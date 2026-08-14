// tests/services/inspect-run.test.ts
import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { runs } from '@/lib/db/schema'
import { deriveHand } from '@/lib/fairness'
import type { Hand } from '@/lib/game/hands'
import { createPlayer } from '@/lib/repo/players'
import { insertRound } from '@/lib/repo/rounds'
import { assertAdmin, inspectRun } from '@/lib/services/inspect-run'
import { playRound } from '@/lib/services/play-round'
import { ServiceError } from '@/lib/services/errors'
import { startRun } from '@/lib/services/start-run'
import { getTestDb, resetTestDb, stopTestDb } from '../helpers/test-db'

const config = { targetWins: 20, maxRoundsPerRun: 300 }

describe('inspectRun', () => {
  afterAll(stopTestDb)
  beforeEach(async () => resetTestDb(await getTestDb()))

  it('dựng lại một lượt trung thực và báo tất cả khớp', async () => {
    const db = await getTestDb()
    const player = await createPlayer(db)
    const run = await startRun({ db, playerId: player.id, config })
    const [row] = await db.query.runs.findMany({ where: (r, { eq }) => eq(r.id, run.runId) })

    const losingHand = ((deriveHand(row.serverSeed, row.clientSeed, 0) + 2) % 3) as Hand
    await playRound({ db, runId: run.runId, playerId: player.id, hand: losingHand, nonce: 0 })

    const inspection = await inspectRun(db, run.runCode)
    expect(inspection.run.status).toBe('lost')
    expect(inspection.verification.commitmentValid).toBe(true)
    expect(inspection.verification.allRoundsMatch).toBe(true)
    expect(inspection.audit.map((e) => e.type)).toContain('run_started')
  })

  it('phát hiện bản ghi ván bị sửa tay', async () => {
    const db = await getTestDb()
    const player = await createPlayer(db)
    const run = await startRun({ db, playerId: player.id, config })
    const [row] = await db.query.runs.findMany({ where: (r, { eq }) => eq(r.id, run.runId) })

    // Ghi thẳng một ván sai lệch để mô phỏng dữ liệu hỏng hoặc bị can thiệp.
    const trueHand = deriveHand(row.serverSeed, row.clientSeed, 0)
    await insertRound(db, {
      runId: run.runId,
      nonce: 0,
      playerHand: 0,
      serverHand: ((trueHand + 1) % 3) as Hand,
      outcome: 'win',
    })

    const inspection = await inspectRun(db, run.runCode)
    expect(inspection.verification.allRoundsMatch).toBe(false)
    expect(inspection.verification.rounds[0].matches).toBe(false)
  })

  it('bắt được runs.wins bị sửa dù mọi ván vẫn dựng lại đúng', async () => {
    const db = await getTestDb()
    const player = await createPlayer(db)
    const run = await startRun({ db, playerId: player.id, config })
    const [row] = await db.query.runs.findMany({ where: (r, { eq }) => eq(r.id, run.runId) })

    const losingHand = ((deriveHand(row.serverSeed, row.clientSeed, 0) + 2) % 3) as Hand
    await playRound({ db, runId: run.runId, playerId: player.id, hand: losingHand, nonce: 0 })

    // Sửa thẳng con số tổng, giữ nguyên sổ ván — bug ở tầng ứng dụng hay một bàn
    // tay can thiệp đều để lại đúng hình dạng này. `verifyRun` không đọc cột này
    // nên nó vẫn báo mọi ván khớp.
    await db.update(runs).set({ wins: 20, status: 'won' }).where(eq(runs.id, run.runId))

    const inspection = await inspectRun(db, run.runCode)
    expect(inspection.verification.allRoundsMatch).toBe(true)
    expect(inspection.stateCheck.matches).toBe(false)
    expect(inspection.stateCheck.derived).toEqual({ status: 'lost', wins: 0 })
    expect(inspection.stateCheck.stored).toEqual({ status: 'won', wins: 20 })
  })

  it('lượt trung thực có stateCheck khớp', async () => {
    const db = await getTestDb()
    const player = await createPlayer(db)
    const run = await startRun({ db, playerId: player.id, config })
    const [row] = await db.query.runs.findMany({ where: (r, { eq }) => eq(r.id, run.runId) })

    const winningHand = ((deriveHand(row.serverSeed, row.clientSeed, 0) + 1) % 3) as Hand
    await playRound({ db, runId: run.runId, playerId: player.id, hand: winningHand, nonce: 0 })

    const inspection = await inspectRun(db, run.runCode)
    expect(inspection.stateCheck.matches).toBe(true)
    expect(inspection.stateCheck.derived).toEqual({ status: 'active', wins: 1 })
  })

  it('báo không tìm thấy khi mã sai', async () => {
    const db = await getTestDb()
    await expect(inspectRun(db, 'JKN-XXXX-XXXX')).rejects.toMatchObject({ httpStatus: 404 })
  })
})

describe('assertAdmin', () => {
  // process.env là trạng thái toàn cục dùng chung cho cả file test này — nếu không
  // khôi phục sau mỗi test, việc xoá ADMIN_TOKEN ở một test sẽ rò rỉ sang các test
  // chạy sau nó (kể cả những test không liên quan tới assertAdmin).
  const originalAdminToken = process.env.ADMIN_TOKEN

  afterEach(() => {
    if (originalAdminToken === undefined) delete process.env.ADMIN_TOKEN
    else process.env.ADMIN_TOKEN = originalAdminToken
  })

  // Phải khẳng định ĐÚNG loại lỗi, không chỉ "có ném". `timingSafeEqual` ném
  // RangeError khi hai buffer khác độ dài, nên nếu ai đó đảo thứ tự phép so sánh
  // độ dài với lời gọi đó, hàm sẽ nổ 500 thay vì từ chối sạch 403 — mà một
  // `.toThrow()` trần vẫn xanh y nguyên. Đây là chốt chặn duy nhất giữa người lạ
  // và seed của mọi lượt, kể cả lượt đang chơi dở.
  const expectDenied = (token: string | undefined) => {
    let thrown: unknown
    try {
      assertAdmin(token)
    } catch (error) {
      thrown = error
    }
    expect(thrown).toBeInstanceOf(ServiceError)
    expect(thrown).toMatchObject({ code: 'forbidden', httpStatus: 403 })
  }

  it('từ chối khi token sai hoặc thiếu', () => {
    process.env.ADMIN_TOKEN = 'token-that'
    expectDenied(undefined)
    expectDenied('')
    expectDenied('token-gia')
    // Sai nhưng ĐÚNG độ dài: đường duy nhất thật sự chạy tới timingSafeEqual.
    expectDenied('token-thaX')
    expect(() => assertAdmin('token-that')).not.toThrow()
  })

  it('từ chối tất cả khi chưa cấu hình ADMIN_TOKEN', () => {
    delete process.env.ADMIN_TOKEN
    expectDenied('bat-ky')
  })
})
