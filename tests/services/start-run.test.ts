// tests/services/start-run.test.ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { commit } from '@/lib/fairness'
import { createPlayer } from '@/lib/repo/players'
import { listAuditForRun } from '@/lib/repo/audit'
import { updateRunState } from '@/lib/repo/runs'
import { RUN_CODE_PATTERN } from '@/lib/run-code'
import { startRun } from '@/lib/services/start-run'
import { getTestDb, resetTestDb, stopTestDb } from '../helpers/test-db'

const config = { targetWins: 20, maxRoundsPerRun: 300 }

describe('startRun', () => {
  afterAll(stopTestDb)
  beforeEach(async () => resetTestDb(await getTestDb()))

  it('tạo lượt mới với commitment khớp seed đã lưu', async () => {
    const db = await getTestDb()
    const player = await createPlayer(db)

    const result = await startRun({ db, playerId: player.id, config })

    expect(result.runCode).toMatch(RUN_CODE_PATTERN)
    expect(result.commitment).toMatch(/^[0-9a-f]{64}$/)
    expect(result.targetWins).toBe(20)
    expect(result.wins).toBe(0)
    expect(result.nextNonce).toBe(0)
    expect(result.resumed).toBe(false)

    const [run] = await db.query.runs.findMany({ where: (r, { eq }) => eq(r.id, result.runId) })
    expect(commit(run.serverSeed)).toBe(result.commitment)
  })

  it('không bao giờ trả serverSeed ra ngoài', async () => {
    const db = await getTestDb()
    const player = await createPlayer(db)
    const result = await startRun({ db, playerId: player.id, config })

    const [run] = await db.query.runs.findMany({ where: (r, { eq }) => eq(r.id, result.runId) })
    expect(Object.keys(result)).not.toContain('serverSeed')
    expect(JSON.stringify(result)).not.toContain(run.serverSeed)
  })

  it('dùng clientSeed người chơi tự nhập', async () => {
    const db = await getTestDb()
    const player = await createPlayer(db)
    const result = await startRun({ db, playerId: player.id, clientSeed: 'toi-tu-chon-cai-nay', config })
    expect(result.clientSeed).toBe('toi-tu-chon-cai-nay')
  })

  it('sinh clientSeed ngẫu nhiên khi người chơi không nhập', async () => {
    const db = await getTestDb()
    const player = await createPlayer(db)
    const result = await startRun({ db, playerId: player.id, config })
    expect(result.clientSeed).toMatch(/^[0-9a-f]{32}$/)
  })

  it('gọi lại khi đang có lượt dở thì trả lại lượt đó, không tạo mới', async () => {
    const db = await getTestDb()
    const player = await createPlayer(db)

    const first = await startRun({ db, playerId: player.id, config })
    const second = await startRun({ db, playerId: player.id, clientSeed: 'seed-khac', config })

    expect(second.runId).toBe(first.runId)
    expect(second.clientSeed).toBe(first.clientSeed)
    expect(second.resumed).toBe(true)

    const all = await db.query.runs.findMany()
    expect(all).toHaveLength(1)

    // Nhánh resume dựng object trả về riêng, không dùng chung code với nhánh tạo
    // mới, nên phải tự chứng minh nó cũng không rò seed.
    const [row] = await db.query.runs.findMany({ where: (r, { eq }) => eq(r.id, first.runId) })
    expect(JSON.stringify(second)).not.toContain(row.serverSeed)
  })

  it('tạo được lượt mới sau khi lượt cũ đã kết thúc', async () => {
    const db = await getTestDb()
    const player = await createPlayer(db)

    const first = await startRun({ db, playerId: player.id, config })
    await updateRunState(db, first.runId, { status: 'lost', wins: 0, nextNonce: 1, endedAt: new Date() })
    const second = await startRun({ db, playerId: player.id, config })

    expect(second.runId).not.toBe(first.runId)
    expect(second.resumed).toBe(false)
  })

  it('seed của hai lượt liên tiếp không bao giờ trùng nhau', async () => {
    const db = await getTestDb()
    const player = await createPlayer(db)
    const seeds = new Set<string>()

    for (let i = 0; i < 20; i++) {
      const result = await startRun({ db, playerId: player.id, config })
      const [run] = await db.query.runs.findMany({ where: (r, { eq }) => eq(r.id, result.runId) })
      seeds.add(run.serverSeed)
      await updateRunState(db, result.runId, { status: 'lost', wins: 0, nextNonce: 1, endedAt: new Date() })
    }
    expect(seeds.size).toBe(20)
  })

  it('ghi sự kiện run_started', async () => {
    const db = await getTestDb()
    const player = await createPlayer(db)
    const result = await startRun({ db, playerId: player.id, config, requestId: 'req-abc' })

    const events = await listAuditForRun(db, result.runId)
    expect(events.map((e) => e.type)).toContain('run_started')
    expect(events[0].requestId).toBe('req-abc')
  })

  it('chụp lại targetWins và maxRounds tại thời điểm tạo', async () => {
    const db = await getTestDb()
    const player = await createPlayer(db)
    const result = await startRun({
      db,
      playerId: player.id,
      config: { targetWins: 5, maxRoundsPerRun: 50 },
    })

    const [run] = await db.query.runs.findMany({ where: (r, { eq }) => eq(r.id, result.runId) })
    expect(run.targetWins).toBe(5)
    expect(run.maxRounds).toBe(50)
  })
})
