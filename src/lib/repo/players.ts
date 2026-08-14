// src/lib/repo/players.ts
import { eq, sql } from 'drizzle-orm'
import type { Db } from '@/lib/db/client'
import { players } from '@/lib/db/schema'

export type Tx = Db | Parameters<Parameters<Db['transaction']>[0]>[0]
export type Player = typeof players.$inferSelect

export async function createPlayer(tx: Tx): Promise<Player> {
  const [player] = await tx.insert(players).values({}).returning()
  return player
}

export async function findPlayer(tx: Tx, id: string): Promise<Player | undefined> {
  const [player] = await tx.select().from(players).where(eq(players.id, id)).limit(1)
  return player
}

/** Chỉ nâng lên, không bao giờ hạ xuống — best_wins là kỷ lục chứ không phải trạng thái. */
export async function raiseBestWins(tx: Tx, playerId: string, wins: number): Promise<void> {
  await tx
    .update(players)
    .set({ bestWins: sql`greatest(${players.bestWins}, ${wins})` })
    .where(eq(players.id, playerId))
}
