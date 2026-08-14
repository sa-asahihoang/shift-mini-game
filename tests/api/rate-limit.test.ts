// tests/api/rate-limit.test.ts
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '@/lib/db/client'
import { getRateLimiter } from '@/lib/rate-limit'
import { SESSION_COOKIE, hashIp, readPlayerId } from '@/lib/session/cookie'
import { getTestDb, getTestDbUrl, resetTestDb, stopTestDb } from '../helpers/test-db'

const SESSION_SECRET = 'khoa-test-du-dai-de-ky-hmac'
const IP_HASH_SALT = 'muoi-test'

let postRuns: (req: Request) => Promise<Response>
let postAbandon: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>

beforeAll(async () => {
  process.env.DATABASE_URL = await getTestDbUrl()
  process.env.SESSION_SECRET = SESSION_SECRET
  process.env.IP_HASH_SALT = IP_HASH_SALT

  postRuns = (await import('@/app/api/runs/route')).POST
  postAbandon = (await import('@/app/api/runs/[id]/abandon/route')).POST
})

afterAll(stopTestDb)
beforeEach(async () => resetTestDb(await getTestDb()))

function request(url: string, ip: string, cookie?: string): Request {
  const headers = new Headers({ 'content-type': 'application/json', 'x-forwarded-for': ip })
  if (cookie) headers.set('cookie', cookie)
  return new Request(url, { method: 'POST', headers, body: '{}' })
}

async function countPlayers(db: Db): Promise<number> {
  const rows = await db.execute<{ n: string }>(sql`SELECT count(*)::text AS n FROM players`)
  return Number(rows[0].n)
}

/** Đổ đầy xô của một khoá bằng chính limiter mà route dùng. */
async function fillBucket(key: string, limit: number) {
  for (let i = 0; i < limit; i++) await getRateLimiter().hit(key, limit, 60)
}

describe('chặn theo IP trước khi dựng session', () => {
  it('không cấp thêm players row cho request không cookie khi IP đã chạm trần', async () => {
    const db = await getTestDb()
    const ip = '203.0.113.7'
    await fillBucket(`ip:${hashIp(ip, IP_HASH_SALT)}`, 300)

    const before = await countPlayers(db)
    const response = await postRuns(request('http://test/api/runs', ip))

    expect(response.status).toBe(429)
    expect((await response.json()).error).toBe('rate_limited')
    // Điểm mấu chốt của lỗi này: không gửi cookie thì `resolveSession` đúc một
    // người chơi mới TRƯỚC khi limiter theo playerId kịp chạy, nên mỗi request
    // lại có một xô trắng tinh. Chặn phải xảy ra trước lần ghi đó.
    expect(await countPlayers(db)).toBe(before)
  })

  it('IP khác không bị vạ lây', async () => {
    await fillBucket(`ip:${hashIp('203.0.113.8', IP_HASH_SALT)}`, 300)

    const response = await postRuns(request('http://test/api/runs', '203.0.113.9'))
    expect(response.status).toBe(200)
  })
})

describe('chặn theo người chơi ở route bỏ lượt', () => {
  it('trả 429 khi gọi bỏ lượt quá nhanh', async () => {
    const started = await postRuns(request('http://test/api/runs', '198.51.100.4'))
    expect(started.status).toBe(200)

    const cookie = started.headers.get('set-cookie')?.split(';')[0] ?? ''
    const playerId = readPlayerId(cookie.slice(`${SESSION_COOKIE}=`.length), SESSION_SECRET)
    expect(playerId).not.toBeNull()

    const { runId } = await started.json()
    await fillBucket(`abandon:${playerId}`, 30)

    // Không có limiter ở đây thì mỗi lần gọi lại trên lượt đã kết thúc lại ghi
    // thêm một dòng vào `audit_events`, bảng append-only không ai dọn.
    const response = await postAbandon(request(`http://test/api/runs/${runId}/abandon`, '198.51.100.4', cookie), {
      params: Promise.resolve({ id: runId }),
    })

    expect(response.status).toBe(429)
    expect((await response.json()).error).toBe('rate_limited')
  })
})
