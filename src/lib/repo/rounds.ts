// src/lib/repo/rounds.ts
import { and, asc, eq } from 'drizzle-orm'
import { rounds } from '@/lib/db/schema'
import type { Tx } from './players'

export type Round = typeof rounds.$inferSelect
export type NewRound = typeof rounds.$inferInsert

export async function insertRound(tx: Tx, values: NewRound): Promise<void> {
  await tx.insert(rounds).values(values)
}

export async function findRound(tx: Tx, runId: string, nonce: number): Promise<Round | undefined> {
  const [round] = await tx
    .select()
    .from(rounds)
    .where(and(eq(rounds.runId, runId), eq(rounds.nonce, nonce)))
    .limit(1)
  return round
}

export async function listRounds(tx: Tx, runId: string): Promise<Round[]> {
  return tx.select().from(rounds).where(eq(rounds.runId, runId)).orderBy(asc(rounds.nonce))
}
