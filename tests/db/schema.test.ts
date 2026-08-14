// tests/db/schema.test.ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { players, runs } from '@/lib/db/schema'
import { getTestDb, resetTestDb, stopTestDb } from '../helpers/test-db'

const baseRun = {
  serverSeed: 'a'.repeat(64),
  commitment: 'b'.repeat(64),
  clientSeed: 'c'.repeat(32),
  targetWins: 20,
  maxRounds: 300,
}

describe('lược đồ cơ sở dữ liệu', () => {
  afterAll(stopTestDb)

  beforeEach(async () => resetTestDb(await getTestDb()))

  it('tạo được người chơi với account_id null', async () => {
    const db = await getTestDb()
    const [player] = await db.insert(players).values({}).returning()
    expect(player.accountId).toBeNull()
    expect(player.bestWins).toBe(0)
  })

  it('chặn người chơi có hai lượt active cùng lúc', async () => {
    const db = await getTestDb()
    const [player] = await db.insert(players).values({}).returning()
    await db.insert(runs).values({ ...baseRun, playerId: player.id, runCode: 'JKN-0000-0001' })

    // drizzle-orm bọc lỗi driver trong DrizzleQueryError — thông điệp gốc của
    // Postgres (tên constraint) nằm ở `.cause`, không phải `.message` cấp cao nhất.
    const error: unknown = await db
      .insert(runs)
      .values({ ...baseRun, playerId: player.id, runCode: 'JKN-0000-0002' })
      .then(
        () => undefined,
        (err: unknown) => err,
      )

    expect(error).toBeInstanceOf(Error)
    const cause = (error as Error).cause
    expect(cause).toBeInstanceOf(Error)
    expect((cause as Error).message).toMatch(/runs_one_active_per_player/)
  })

  it('cho phép nhiều lượt đã kết thúc trên cùng người chơi', async () => {
    const db = await getTestDb()
    const [player] = await db.insert(players).values({}).returning()
    await db.insert(runs).values({ ...baseRun, playerId: player.id, runCode: 'JKN-0000-0003', status: 'lost' })
    await db.insert(runs).values({ ...baseRun, playerId: player.id, runCode: 'JKN-0000-0004', status: 'lost' })
    await db.insert(runs).values({ ...baseRun, playerId: player.id, runCode: 'JKN-0000-0005' })

    const all = await db.select().from(runs)
    expect(all).toHaveLength(3)
  })

  it('chặn run_code trùng nhau', async () => {
    const db = await getTestDb()
    const [a] = await db.insert(players).values({}).returning()
    const [b] = await db.insert(players).values({}).returning()
    await db.insert(runs).values({ ...baseRun, playerId: a.id, runCode: 'JKN-DUP-0001' })

    await expect(
      db.insert(runs).values({ ...baseRun, playerId: b.id, runCode: 'JKN-DUP-0001' }),
    ).rejects.toThrow()
  })
})
