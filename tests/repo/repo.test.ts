// tests/repo/repo.test.ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createPlayer, findPlayer, raiseBestWins } from '@/lib/repo/players'
import { findActiveRun, findRunByCode, insertRun, lockRun, updateRunState } from '@/lib/repo/runs'
import { findRound, insertRound, listRounds } from '@/lib/repo/rounds'
import { listAuditForRun, recordAudit } from '@/lib/repo/audit'
import { getTestDb, resetTestDb, stopTestDb } from '../helpers/test-db'

const seedValues = {
  serverSeed: 'a'.repeat(64),
  commitment: 'b'.repeat(64),
  clientSeed: 'c'.repeat(32),
  targetWins: 20,
  maxRounds: 300,
}

describe('tầng repo', () => {
  afterAll(stopTestDb)
  beforeEach(async () => resetTestDb(await getTestDb()))

  it('tạo và đọc lại người chơi', async () => {
    const db = await getTestDb()
    const created = await createPlayer(db)
    expect(await findPlayer(db, created.id)).toMatchObject({ id: created.id, bestWins: 0 })
  })

  it('raiseBestWins chỉ nâng lên, không hạ xuống', async () => {
    const db = await getTestDb()
    const player = await createPlayer(db)

    await raiseBestWins(db, player.id, 7)
    expect((await findPlayer(db, player.id))?.bestWins).toBe(7)

    await raiseBestWins(db, player.id, 3)
    expect((await findPlayer(db, player.id))?.bestWins).toBe(7)

    await raiseBestWins(db, player.id, 12)
    expect((await findPlayer(db, player.id))?.bestWins).toBe(12)
  })

  it('findActiveRun chỉ trả lượt đang active', async () => {
    const db = await getTestDb()
    const player = await createPlayer(db)
    const run = await insertRun(db, { ...seedValues, playerId: player.id, runCode: 'JKN-AAAA-0001' })

    expect((await findActiveRun(db, player.id))?.id).toBe(run.id)

    await updateRunState(db, run.id, { status: 'lost', wins: 2, nextNonce: 3, endedAt: new Date() })
    expect(await findActiveRun(db, player.id)).toBeUndefined()
  })

  it('tìm được lượt theo mã', async () => {
    const db = await getTestDb()
    const player = await createPlayer(db)
    await insertRun(db, { ...seedValues, playerId: player.id, runCode: 'JKN-BBBB-0002' })
    expect((await findRunByCode(db, 'JKN-BBBB-0002'))?.runCode).toBe('JKN-BBBB-0002')
    expect(await findRunByCode(db, 'JKN-ZZZZ-9999')).toBeUndefined()
  })

  it('ghi và đọc lại ván theo đúng thứ tự nonce', async () => {
    const db = await getTestDb()
    const player = await createPlayer(db)
    const run = await insertRun(db, { ...seedValues, playerId: player.id, runCode: 'JKN-CCCC-0003' })

    for (const nonce of [2, 0, 1]) {
      await insertRound(db, { runId: run.id, nonce, playerHand: 0, serverHand: 1, outcome: 'lose' })
    }

    expect((await listRounds(db, run.id)).map((r) => r.nonce)).toEqual([0, 1, 2])
    expect(await findRound(db, run.id, 1)).toBeDefined()
    expect(await findRound(db, run.id, 9)).toBeUndefined()
  })

  it('chặn ghi trùng nonce trong cùng một lượt', async () => {
    const db = await getTestDb()
    const player = await createPlayer(db)
    const run = await insertRun(db, { ...seedValues, playerId: player.id, runCode: 'JKN-DDDD-0004' })

    await insertRound(db, { runId: run.id, nonce: 0, playerHand: 0, serverHand: 1, outcome: 'lose' })
    await expect(
      insertRound(db, { runId: run.id, nonce: 0, playerHand: 2, serverHand: 1, outcome: 'win' }),
    ).rejects.toThrow()
  })

  it('lockRun trả về lượt của đúng người chơi', async () => {
    const db = await getTestDb()
    const player = await createPlayer(db)
    const run = await insertRun(db, { ...seedValues, playerId: player.id, runCode: 'JKN-LOCK-0001' })

    await db.transaction(async (tx) => {
      expect((await lockRun(tx, run.id, player.id))?.id).toBe(run.id)
    })
  })

  it('lockRun từ chối lượt của người chơi khác', async () => {
    const db = await getTestDb()
    const owner = await createPlayer(db)
    const intruder = await createPlayer(db)
    const run = await insertRun(db, { ...seedValues, playerId: owner.id, runCode: 'JKN-LOCK-0002' })

    // Không có bộ lọc playerId thì người lạ khoá và đọc được lượt của người khác
    // chỉ bằng cách đoán id — không test nào khác trong tầng này bắt được.
    await db.transaction(async (tx) => {
      expect(await lockRun(tx, run.id, intruder.id)).toBeUndefined()
    })
  })

  it('ghi và đọc lại sự kiện đối chiếu', async () => {
    const db = await getTestDb()
    const player = await createPlayer(db)
    const run = await insertRun(db, { ...seedValues, playerId: player.id, runCode: 'JKN-EEEE-0005' })

    await recordAudit(db, { playerId: player.id, runId: run.id, type: 'run_started', payload: { nonce: 0 } })
    const events = await listAuditForRun(db, run.id)
    expect(events).toHaveLength(1)
    expect(events[0].type).toBe('run_started')
    expect(events[0].payload).toEqual({ nonce: 0 })
  })
})
