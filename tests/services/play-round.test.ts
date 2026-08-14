// tests/services/play-round.test.ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { deriveHand } from '@/lib/fairness'
import { judge, type Hand } from '@/lib/game/hands'
import { listAuditForRun } from '@/lib/repo/audit'
import { createPlayer, findPlayer } from '@/lib/repo/players'
import { listRounds } from '@/lib/repo/rounds'
import { lockRun } from '@/lib/repo/runs'
import { abandonRun } from '@/lib/services/abandon-run'
import { playRound } from '@/lib/services/play-round'
import { startRun } from '@/lib/services/start-run'
import { getTestDb, resetTestDb, stopTestDb } from '../helpers/test-db'
import type { Db } from '@/lib/db/client'

const config = { targetWins: 20, maxRoundsPerRun: 300 }
const shortConfig = { targetWins: 2, maxRoundsPerRun: 4 }

/** Chuẩn bị một lượt và trả kèm hàm tính tay thắng/thua/hòa cho từng nonce. */
async function setup(db: Db, cfg = config) {
  const player = await createPlayer(db)
  const run = await startRun({ db, playerId: player.id, config: cfg })
  const [row] = await db.query.runs.findMany({ where: (r, { eq }) => eq(r.id, run.runId) })

  const serverHandAt = (nonce: number) => deriveHand(row.serverSeed, row.clientSeed, nonce)
  const handThatBeats = (nonce: number) => (((serverHandAt(nonce) + 1) % 3) as Hand)
  const handThatLoses = (nonce: number) => (((serverHandAt(nonce) + 2) % 3) as Hand)
  const handThatDraws = (nonce: number) => serverHandAt(nonce)

  return { player, run, row, serverHandAt, handThatBeats, handThatLoses, handThatDraws }
}

describe('playRound', () => {
  afterAll(stopTestDb)
  beforeEach(async () => resetTestDb(await getTestDb()))

  it('ván thắng thì tăng chuỗi và lượt vẫn active', async () => {
    const db = await getTestDb()
    const { player, run, handThatBeats } = await setup(db)

    const result = await playRound({ db, runId: run.runId, playerId: player.id, hand: handThatBeats(0), nonce: 0 })

    expect(result.outcome).toBe('win')
    expect(result.wins).toBe(1)
    expect(result.status).toBe('active')
    expect(result.serverSeed).toBeUndefined()
  })

  it('ván hòa thì giữ chuỗi nhưng vẫn tiêu một nonce', async () => {
    const db = await getTestDb()
    const { player, run, handThatDraws } = await setup(db)

    const result = await playRound({ db, runId: run.runId, playerId: player.id, hand: handThatDraws(0), nonce: 0 })

    expect(result.outcome).toBe('draw')
    expect(result.wins).toBe(0)
    expect(result.status).toBe('active')
    expect(result.serverSeed).toBeUndefined()
  })

  it('ván thua thì kết thúc lượt và lộ seed', async () => {
    const db = await getTestDb()
    const { player, run, row, handThatLoses } = await setup(db)

    const result = await playRound({ db, runId: run.runId, playerId: player.id, hand: handThatLoses(0), nonce: 0 })

    expect(result.outcome).toBe('lose')
    expect(result.status).toBe('lost')
    expect(result.serverSeed).toBe(row.serverSeed)
  })

  it('thắng đủ targetWins thì thắng lượt và lộ seed', async () => {
    const db = await getTestDb()
    const { player, run, row, handThatBeats, serverHandAt } = await setup(db, shortConfig)

    let nonce = 0
    let wins = 0
    let last
    while (wins < 2) {
      const hand = handThatBeats(nonce)
      last = await playRound({ db, runId: run.runId, playerId: player.id, hand, nonce })
      expect(judge(hand, serverHandAt(nonce))).toBe('win')
      wins = last.wins
      nonce++
    }

    expect(last?.status).toBe('won')
    expect(last?.serverSeed).toBe(row.serverSeed)
  })

  it('cập nhật best_wins của người chơi khi lượt kết thúc', async () => {
    const db = await getTestDb()
    const { player, run, handThatBeats, handThatLoses } = await setup(db)

    await playRound({ db, runId: run.runId, playerId: player.id, hand: handThatBeats(0), nonce: 0 })
    await playRound({ db, runId: run.runId, playerId: player.id, hand: handThatBeats(1), nonce: 1 })
    await playRound({ db, runId: run.runId, playerId: player.id, hand: handThatLoses(2), nonce: 2 })

    expect((await findPlayer(db, player.id))?.bestWins).toBe(2)
  })

  it('từ chối nonce vượt trước và ghi audit dù transaction đã rollback', async () => {
    const db = await getTestDb()
    const { player, run, handThatBeats } = await setup(db)

    await expect(
      playRound({ db, runId: run.runId, playerId: player.id, hand: handThatBeats(5), nonce: 5 }),
    ).rejects.toMatchObject({ code: 'nonce_mismatch', httpStatus: 409 })

    const events = await listAuditForRun(db, run.runId)
    expect(events.map((e) => e.type)).toContain('nonce_mismatch')
    expect(await listRounds(db, run.runId)).toHaveLength(0)
  })

  it('gửi lại đúng nonce với đúng tay thì trả kết quả cũ, không sinh ván mới', async () => {
    const db = await getTestDb()
    const { player, run, handThatBeats } = await setup(db)
    const hand = handThatBeats(0)

    const first = await playRound({ db, runId: run.runId, playerId: player.id, hand, nonce: 0 })
    const retry = await playRound({ db, runId: run.runId, playerId: player.id, hand, nonce: 0 })

    expect(retry.outcome).toBe(first.outcome)
    expect(retry.serverHand).toBe(first.serverHand)
    expect(retry.wins).toBe(first.wins)
    expect(retry.replayed).toBe(true)
    expect(await listRounds(db, run.runId)).toHaveLength(1)
  })

  it('gửi lại đúng nonce với tay khác thì bị từ chối và ghi audit', async () => {
    const db = await getTestDb()
    const { player, run, handThatBeats, handThatLoses } = await setup(db)

    await playRound({ db, runId: run.runId, playerId: player.id, hand: handThatLoses(0), nonce: 0 })

    await expect(
      playRound({ db, runId: run.runId, playerId: player.id, hand: handThatBeats(0), nonce: 0 }),
    ).rejects.toMatchObject({ code: 'replay_rejected', httpStatus: 409 })

    const events = await listAuditForRun(db, run.runId)
    expect(events.map((e) => e.type)).toContain('replay_rejected')
    expect(await listRounds(db, run.runId)).toHaveLength(1)
  })

  it('retry ván cuối của lượt đã kết thúc vẫn trả lại seed', async () => {
    const db = await getTestDb()
    const { player, run, row, handThatLoses } = await setup(db)
    const hand = handThatLoses(0)

    await playRound({ db, runId: run.runId, playerId: player.id, hand, nonce: 0 })
    const retry = await playRound({ db, runId: run.runId, playerId: player.id, hand, nonce: 0 })

    expect(retry.status).toBe('lost')
    expect(retry.serverSeed).toBe(row.serverSeed)
    expect(retry.replayed).toBe(true)
  })

  it('từ chối chơi tiếp trên lượt đã kết thúc', async () => {
    const db = await getTestDb()
    const { player, run, handThatLoses, handThatBeats } = await setup(db)

    await playRound({ db, runId: run.runId, playerId: player.id, hand: handThatLoses(0), nonce: 0 })

    await expect(
      playRound({ db, runId: run.runId, playerId: player.id, hand: handThatBeats(1), nonce: 1 }),
    ).rejects.toMatchObject({ code: 'run_not_active' })
  })

  it('từ chối lượt của người chơi khác', async () => {
    const db = await getTestDb()
    const { run, handThatBeats } = await setup(db)
    const intruder = await createPlayer(db)

    await expect(
      playRound({ db, runId: run.runId, playerId: intruder.id, hand: handThatBeats(0), nonce: 0 }),
    ).rejects.toMatchObject({ httpStatus: 404 })
  })

  it('hai mươi request đồng thời cùng nonce chỉ ghi đúng một ván', async () => {
    const db = await getTestDb()
    const { player, run, handThatDraws } = await setup(db)
    const hand = handThatDraws(0)

    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        playRound({ db, runId: run.runId, playerId: player.id, hand, nonce: 0 }),
      ),
    )

    expect(await listRounds(db, run.runId)).toHaveLength(1)
    expect(new Set(results.map((r) => r.serverHand)).size).toBe(1)
    expect(new Set(results.map((r) => r.outcome)).size).toBe(1)
    expect(results.filter((r) => !r.replayed)).toHaveLength(1)
  })

  it('khoá dòng buộc transaction thứ hai chờ transaction thứ nhất commit', async () => {
    const db = await getTestDb()
    const { player, run } = await setup(db)
    const HOLD_MS = 300

    // Test 20-request bên dưới chứng minh kết quả cuối cùng đúng, nhưng nó dựa vào
    // may rủi của event loop: gỡ .for('update') ra thì nó vẫn xanh khoảng 9 lần
    // trên 10. Test này đo thẳng chính hành vi chặn, nên một regression làm rơi
    // row lock sẽ đỏ mọi lần chứ không phải thỉnh thoảng.
    let releasedAt = 0
    let acquiredAt = 0

    const holder = db.transaction(async (tx) => {
      await lockRun(tx, run.runId, player.id)
      await new Promise((resolve) => setTimeout(resolve, HOLD_MS))
      releasedAt = Date.now()
    })

    // Cho holder kịp cầm khoá trước khi waiter thử.
    await new Promise((resolve) => setTimeout(resolve, 50))

    const waiter = db.transaction(async (tx) => {
      await lockRun(tx, run.runId, player.id)
      acquiredAt = Date.now()
    })

    await Promise.all([holder, waiter])

    // Không có khoá thì waiter lấy được ngay, tức acquiredAt < releasedAt.
    expect(acquiredAt).toBeGreaterThanOrEqual(releasedAt)
  })

  it('chạm trần số ván thì đóng lượt với abandoned và ghi run_capped', async () => {
    const db = await getTestDb()
    const { player, run, handThatDraws } = await setup(db, shortConfig)

    let last
    for (let nonce = 0; nonce < 4; nonce++) {
      last = await playRound({ db, runId: run.runId, playerId: player.id, hand: handThatDraws(nonce), nonce })
    }

    expect(last?.status).toBe('abandoned')
    expect(last?.serverSeed).toBeDefined()
    expect((await listAuditForRun(db, run.runId)).map((e) => e.type)).toContain('run_capped')
  })

  it('ghi lại requestId và tay của cả hai bên vào bản ghi ván', async () => {
    const db = await getTestDb()
    const { player, run, handThatBeats, serverHandAt } = await setup(db)

    await playRound({
      db,
      runId: run.runId,
      playerId: player.id,
      hand: handThatBeats(0),
      nonce: 0,
      requestId: 'req-xyz',
      latencyMs: 12,
    })

    const [round] = await listRounds(db, run.runId)
    expect(round.requestId).toBe('req-xyz')
    expect(round.latencyMs).toBe(12)
    expect(round.playerHand).toBe(handThatBeats(0))
    expect(round.serverHand).toBe(serverHandAt(0))
  })
})

describe('abandonRun', () => {
  afterAll(stopTestDb)
  beforeEach(async () => resetTestDb(await getTestDb()))

  it('đóng lượt, lộ seed và ghi audit', async () => {
    const db = await getTestDb()
    const { player, run, row, handThatBeats } = await setup(db)

    await playRound({ db, runId: run.runId, playerId: player.id, hand: handThatBeats(0), nonce: 0 })
    const result = await abandonRun({ db, runId: run.runId, playerId: player.id })

    expect(result.status).toBe('abandoned')
    expect(result.serverSeed).toBe(row.serverSeed)
    expect(result.wins).toBe(1)
    const auditTypes = (await listAuditForRun(db, run.runId)).map((e) => e.type)
    expect(auditTypes).toContain('run_abandoned')
    expect(auditTypes).toContain('seed_revealed')
  })

  it('từ chối bỏ một lượt đã kết thúc', async () => {
    const db = await getTestDb()
    const { player, run, handThatLoses } = await setup(db)

    await playRound({ db, runId: run.runId, playerId: player.id, hand: handThatLoses(0), nonce: 0 })
    await expect(abandonRun({ db, runId: run.runId, playerId: player.id })).rejects.toMatchObject({
      code: 'run_not_active',
    })
  })

  it('bỏ lượt xong thì tạo được lượt mới', async () => {
    const db = await getTestDb()
    const { player, run } = await setup(db)

    await abandonRun({ db, runId: run.runId, playerId: player.id })
    const next = await startRun({ db, playerId: player.id, config })

    expect(next.runId).not.toBe(run.runId)
    expect(next.resumed).toBe(false)
  })
})
