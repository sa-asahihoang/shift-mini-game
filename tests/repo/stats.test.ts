// tests/repo/stats.test.ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createPlayer } from '@/lib/repo/players'
import { insertRound } from '@/lib/repo/rounds'
import { insertRun } from '@/lib/repo/runs'
import { loadGameStats } from '@/lib/repo/stats'
import { getTestDb, resetTestDb, stopTestDb } from '../helpers/test-db'

const seedValues = {
  serverSeed: 'a'.repeat(64),
  commitment: 'b'.repeat(64),
  clientSeed: 'c'.repeat(32),
  targetWins: 20,
  maxRounds: 300,
}

describe('loadGameStats', () => {
  afterAll(stopTestDb)
  beforeEach(async () => resetTestDb(await getTestDb()))

  it('trả về số 0 và winRate null khi chưa có ván nào', async () => {
    const stats = await loadGameStats(await getTestDb())
    expect(stats).toMatchObject({ totalRounds: 0, decidedRounds: 0, playerWins: 0, winRate: null })
  })

  it('loại ván hòa ra khỏi mẫu số của tỉ lệ thắng', async () => {
    const db = await getTestDb()
    const player = await createPlayer(db)
    const run = await insertRun(db, { ...seedValues, playerId: player.id, runCode: 'JKN-STAT-001' })

    const outcomes = ['win', 'win', 'lose', 'lose', 'draw', 'draw', 'draw'] as const
    for (const [nonce, outcome] of outcomes.entries()) {
      await insertRound(db, { runId: run.id, nonce, playerHand: 0, serverHand: 1, outcome })
    }

    const stats = await loadGameStats(db)
    expect(stats.totalRounds).toBe(7)
    expect(stats.decidedRounds).toBe(4)
    expect(stats.playerWins).toBe(2)
    expect(stats.winRate).toBeCloseTo(0.5, 5)
  })

  it('đếm số lượt và chuỗi dài nhất', async () => {
    const db = await getTestDb()
    const a = await createPlayer(db)
    const b = await createPlayer(db)
    await insertRun(db, { ...seedValues, playerId: a.id, runCode: 'JKN-STAT-002', status: 'lost', wins: 4 })
    await insertRun(db, { ...seedValues, playerId: b.id, runCode: 'JKN-STAT-003', status: 'lost', wins: 9 })

    const stats = await loadGameStats(db)
    expect(stats.totalRuns).toBe(2)
    expect(stats.longestStreak).toBe(9)
  })
})
