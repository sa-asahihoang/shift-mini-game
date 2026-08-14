// tests/services/audit-sweep.test.ts
import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { commit, deriveHand } from '@/lib/fairness'
import { runs } from '@/lib/db/schema'
import { judge, type Hand } from '@/lib/game/hands'
import { createPlayer } from '@/lib/repo/players'
import { insertRound } from '@/lib/repo/rounds'
import { insertRun, updateRunState } from '@/lib/repo/runs'
import { sweepFinishedRuns } from '@/lib/services/audit-sweep'
import { getTestDb, resetTestDb, stopTestDb } from '../helpers/test-db'

const past = new Date('2020-01-01T00:00:00Z')

async function makeFinishedRun(db: Awaited<ReturnType<typeof getTestDb>>, code: string, tamper: boolean) {
  const player = await createPlayer(db)
  const serverSeed = 'd'.repeat(63) + code.slice(-1)
  const clientSeed = 'hat-giong'
  const run = await insertRun(db, {
    playerId: player.id,
    runCode: code,
    serverSeed,
    commitment: commit(serverSeed),
    clientSeed,
    targetWins: 20,
    maxRounds: 300,
  })

  const trueHand = deriveHand(serverSeed, clientSeed, 0)
  // Phải là tay THUA, vì hàng `runs` bên dưới ghi status 'lost'. Trước đây helper
  // này để playerHand = 0 cố định, nên với phần lớn seed thì ván ghi lại là thắng
  // hoặc hòa trong khi lượt lại được lưu là thua — một trạng thái không thể xảy
  // ra khi chơi thật, và đúng loại lệch mà sweep phải bắt.
  const playerHand = ((trueHand + 2) % 3) as Hand
  // Outcome ghi lại phải khớp với tay THẬT sự đã derive (đây là điều đã thực sự
  // xảy ra lúc chơi). Khi tamper, chỉ serverHand bị sửa — outcome vẫn giữ nguyên
  // như lúc ghi — vì đó chính là kiểu can thiệp mà sweep phải bắt được: dựng lại
  // serverHand từ seed rồi thấy nó không khớp bản ghi.
  const outcome = judge(playerHand, trueHand)
  await insertRound(db, {
    runId: run.id,
    nonce: 0,
    playerHand,
    serverHand: (tamper ? ((trueHand + 1) % 3) : trueHand) as Hand,
    outcome,
  })
  await updateRunState(db, run.id, { status: 'lost', wins: 0, nextNonce: 1, endedAt: new Date() })
  return run
}

describe('sweepFinishedRuns', () => {
  afterAll(stopTestDb)
  beforeEach(async () => resetTestDb(await getTestDb()))

  it('quét lượt đã kết thúc và không báo gì khi mọi thứ khớp', async () => {
    const db = await getTestDb()
    await makeFinishedRun(db, 'JKN-SWEP-0001', false)
    await makeFinishedRun(db, 'JKN-SWEP-0002', false)

    const report = await sweepFinishedRuns(db, past)
    expect(report.scanned).toBe(2)
    expect(report.mismatched).toEqual([])
  })

  it('báo đúng lượt bị lệch', async () => {
    const db = await getTestDb()
    await makeFinishedRun(db, 'JKN-SWEP-0003', false)
    await makeFinishedRun(db, 'JKN-SWEP-0004', true)

    const report = await sweepFinishedRuns(db, past)
    expect(report.scanned).toBe(2)
    expect(report.mismatched).toEqual(['JKN-SWEP-0004'])
  })

  it('báo lượt có runs.wins bị sửa dù mọi ván vẫn dựng lại đúng', async () => {
    const db = await getTestDb()
    await makeFinishedRun(db, 'JKN-SWEP-0009', false)
    const corrupted = await makeFinishedRun(db, 'JKN-SWEP-0010', false)

    // Không đụng tới sổ ván: chỉ con số tổng sai. Trước khi có checkStoredRunState
    // thì đây là loại hỏng duy nhất mà job đêm không bao giờ thấy — đúng loại mà
    // người chơi khiếu nại.
    await db.update(runs).set({ wins: 20, status: 'won' }).where(eq(runs.id, corrupted.id))

    const report = await sweepFinishedRuns(db, past)
    expect(report.scanned).toBe(2)
    expect(report.mismatched).toEqual(['JKN-SWEP-0010'])
  })

  it('bỏ qua lượt còn đang active', async () => {
    const db = await getTestDb()
    const player = await createPlayer(db)
    await insertRun(db, {
      playerId: player.id,
      runCode: 'JKN-SWEP-0005',
      serverSeed: 'e'.repeat(64),
      commitment: commit('e'.repeat(64)),
      clientSeed: 'x',
      targetWins: 20,
      maxRounds: 300,
    })

    expect((await sweepFinishedRuns(db, past)).scanned).toBe(0)
  })

  it('quét cả lượt tạo trước cửa sổ nhưng kết thúc bên trong nó', async () => {
    const db = await getTestDb()
    const run = await makeFinishedRun(db, 'JKN-SWEP-0006', false)

    // Tạo từ lâu, vừa mới kết thúc — đúng hình dạng của một người chơi rải lượt
    // qua nhiều ngày. Lọc theo createdAt sẽ bỏ sót vĩnh viễn, vì cửa sổ đêm sau
    // cũng tính từ hiện tại.
    await db
      .update(runs)
      .set({ createdAt: new Date('2020-01-01T00:00:00Z'), endedAt: new Date() })
      .where(eq(runs.id, run.id))

    const report = await sweepFinishedRuns(db, new Date(Date.now() - 3600_000))
    expect(report.scanned).toBe(1)
  })

  it('báo cắt bớt khi chạm trần', async () => {
    const db = await getTestDb()
    await makeFinishedRun(db, 'JKN-SWEP-0007', false)
    await makeFinishedRun(db, 'JKN-SWEP-0008', false)

    expect((await sweepFinishedRuns(db, past, 1)).truncated).toBe(true)
    expect((await sweepFinishedRuns(db, past, 50)).truncated).toBe(false)
  })
})
