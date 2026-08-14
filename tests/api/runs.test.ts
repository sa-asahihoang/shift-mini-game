// tests/api/runs.test.ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { deriveHand } from '@/lib/fairness'
import type { Hand } from '@/lib/game/hands'
import { getTestDb, getTestDbUrl, resetTestDb, stopTestDb } from '../helpers/test-db'

let postRuns: (req: Request) => Promise<Response>
let postRounds: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>
let getRun: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>
let postAbandon: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>

beforeAll(async () => {
  // getDb() đọc DATABASE_URL lúc gọi lần đầu, nên phải đặt env TRƯỚC khi import route.
  process.env.DATABASE_URL = await getTestDbUrl()
  process.env.SESSION_SECRET = 'khoa-test-du-dai-de-ky-hmac'
  process.env.IP_HASH_SALT = 'muoi-test'

  postRuns = (await import('@/app/api/runs/route')).POST
  postRounds = (await import('@/app/api/runs/[id]/rounds/route')).POST
  getRun = (await import('@/app/api/runs/[id]/route')).GET
  postAbandon = (await import('@/app/api/runs/[id]/abandon/route')).POST
})

afterAll(stopTestDb)
beforeEach(async () => resetTestDb(await getTestDb()))

function jsonRequest(url: string, body?: unknown, cookie?: string): Request {
  const headers = new Headers({ 'content-type': 'application/json' })
  if (cookie) headers.set('cookie', cookie)
  return new Request(url, { method: 'POST', headers, body: body ? JSON.stringify(body) : undefined })
}

async function startSession() {
  const response = await postRuns(jsonRequest('http://test/api/runs', {}))
  const cookie = response.headers.get('set-cookie')?.split(';')[0] ?? ''
  return { body: await response.json(), cookie }
}

describe('POST /api/runs', () => {
  it('cấp cookie session cho người mới và trả về commitment', async () => {
    const response = await postRuns(jsonRequest('http://test/api/runs', {}))
    expect(response.status).toBe(200)
    expect(response.headers.get('set-cookie')).toMatch(/janken_pid=/)
    expect(response.headers.get('set-cookie')).toMatch(/HttpOnly/)

    const body = await response.json()
    expect(body.commitment).toMatch(/^[0-9a-f]{64}$/)
    expect(body.targetWins).toBe(20)
  })

  it('KHÔNG BAO GIỜ trả serverSeed khi lượt còn active — hình dạng response bị khoá', async () => {
    const { body } = await startSession()
    expect(Object.keys(body).sort()).toEqual([
      'clientSeed',
      'commitment',
      'nextNonce',
      'resumed',
      'runCode',
      'runId',
      'targetWins',
      'wins',
    ])
  })

  it('từ chối clientSeed dài quá mức', async () => {
    const response = await postRuns(jsonRequest('http://test/api/runs', { clientSeed: 'x'.repeat(500) }))
    expect(response.status).toBe(400)
  })
})

describe('POST /api/runs/:id/rounds', () => {
  it('chơi được một ván và không lộ seed khi lượt còn active', async () => {
    const db = await getTestDb()
    const { body: run, cookie } = await startSession()
    const [row] = await db.query.runs.findMany({ where: (r, { eq }) => eq(r.id, run.runId) })
    const drawHand = deriveHand(row.serverSeed, row.clientSeed, 0) as Hand

    const response = await postRounds(
      jsonRequest(`http://test/api/runs/${run.runId}/rounds`, { hand: drawHand, nonce: 0 }, cookie),
      { params: Promise.resolve({ id: run.runId }) },
    )

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.outcome).toBe('draw')
    expect(body.status).toBe('active')
    expect(body).not.toHaveProperty('serverSeed')
    expect(JSON.stringify(body)).not.toContain(row.serverSeed)
  })

  it('trả 409 khi sai thứ tự nonce', async () => {
    const { body: run, cookie } = await startSession()
    const response = await postRounds(
      jsonRequest(`http://test/api/runs/${run.runId}/rounds`, { hand: 0, nonce: 4 }, cookie),
      { params: Promise.resolve({ id: run.runId }) },
    )
    expect(response.status).toBe(409)
    expect((await response.json()).error).toBe('nonce_mismatch')
  })

  it('trả 400 khi tay không hợp lệ', async () => {
    const { body: run, cookie } = await startSession()
    const response = await postRounds(
      jsonRequest(`http://test/api/runs/${run.runId}/rounds`, { hand: 7, nonce: 0 }, cookie),
      { params: Promise.resolve({ id: run.runId }) },
    )
    expect(response.status).toBe(400)
  })

  it('trả 404 khi lượt thuộc về người khác', async () => {
    const { body: run } = await startSession()
    const other = await startSession()

    const response = await postRounds(
      jsonRequest(`http://test/api/runs/${run.runId}/rounds`, { hand: 0, nonce: 0 }, other.cookie),
      { params: Promise.resolve({ id: run.runId }) },
    )
    expect(response.status).toBe(404)
  })

  it('trả 400 khi body không phải JSON hợp lệ', async () => {
    const { body: run, cookie } = await startSession()
    const headers = new Headers({ 'content-type': 'application/json', cookie })
    const response = await postRounds(
      new Request(`http://test/api/runs/${run.runId}/rounds`, { method: 'POST', headers, body: 'khong-phai-json' }),
      { params: Promise.resolve({ id: run.runId }) },
    )
    expect(response.status).toBe(400)
  })
})

describe('GET /api/runs/:id', () => {
  it('khôi phục được trạng thái lượt mà không lộ seed', async () => {
    const { body: run, cookie } = await startSession()
    const response = await getRun(new Request(`http://test/api/runs/${run.runId}`, { headers: { cookie } }), {
      params: Promise.resolve({ id: run.runId }),
    })

    const body = await response.json()
    expect(body.status).toBe('active')
    expect(body.nextNonce).toBe(0)
    expect(body.serverSeed).toBeUndefined()
    expect(body.rounds).toEqual([])
  })

  it('cấm cache mọi response, kể cả đường lỗi', async () => {
    const { body: run, cookie } = await startSession()

    // Route này trả serverSeed cho lượt đã kết thúc và chỉ phân quyền bằng
    // cookie. Một proxy cache thêm vào sau này là đủ để hạt giống của lượt này
    // đến tay người khác — và hạt giống lộ ra thì không rút lại được.
    const ok = await getRun(new Request(`http://test/api/runs/${run.runId}`, { headers: { cookie } }), {
      params: Promise.resolve({ id: run.runId }),
    })
    expect(ok.headers.get('cache-control')).toBe('no-store')

    const missing = await getRun(
      new Request('http://test/api/runs/khong-phai-uuid', { headers: { cookie } }),
      { params: Promise.resolve({ id: 'khong-phai-uuid' }) },
    )
    expect(missing.headers.get('cache-control')).toBe('no-store')

    const created = await postRuns(jsonRequest('http://test/api/runs', {}))
    expect(created.headers.get('cache-control')).toBe('no-store')
  })

  it('không cho người chơi khác đọc lượt của mình', async () => {
    const { body: run } = await startSession()
    const other = await startSession()

    const response = await getRun(
      new Request(`http://test/api/runs/${run.runId}`, { headers: { cookie: other.cookie } }),
      { params: Promise.resolve({ id: run.runId }) },
    )
    expect(response.status).toBe(404)
  })

  it('id sai định dạng trả 404 chứ không phải 500', async () => {
    const { cookie } = await startSession()
    const response = await getRun(
      new Request('http://test/api/runs/khong-phai-uuid', { headers: { cookie } }),
      { params: Promise.resolve({ id: 'khong-phai-uuid' }) },
    )
    expect(response.status).toBe(404)
  })
})

describe('POST /api/runs/:id/abandon', () => {
  it('đóng lượt và công bố seed', async () => {
    const db = await getTestDb()
    const { body: run, cookie } = await startSession()
    const [row] = await db.query.runs.findMany({ where: (r, { eq }) => eq(r.id, run.runId) })

    const response = await postAbandon(
      jsonRequest(`http://test/api/runs/${run.runId}/abandon`, undefined, cookie),
      { params: Promise.resolve({ id: run.runId }) },
    )

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.status).toBe('abandoned')
    // Bỏ lượt là đường kết thúc, nên đây là chỗ DUY NHẤT seed được phép xuất hiện.
    expect(body.serverSeed).toBe(row.serverSeed)
  })

  it('không cho người chơi khác bỏ lượt của mình', async () => {
    const { body: run } = await startSession()
    const other = await startSession()

    const response = await postAbandon(
      jsonRequest(`http://test/api/runs/${run.runId}/abandon`, undefined, other.cookie),
      { params: Promise.resolve({ id: run.runId }) },
    )
    expect(response.status).toBe(404)
  })
})
