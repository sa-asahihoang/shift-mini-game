// src/lib/repo/runs.ts
import { and, eq } from 'drizzle-orm'
import { runs } from '@/lib/db/schema'
import type { Tx } from './players'

export type Run = typeof runs.$inferSelect
export type NewRun = typeof runs.$inferInsert

export interface RunStatePatch {
  status: Run['status']
  wins: number
  nextNonce: number
  endedAt: Date | null
}

export async function insertRun(tx: Tx, values: NewRun): Promise<Run> {
  const [run] = await tx.insert(runs).values(values).returning()
  return run
}

export async function findActiveRun(tx: Tx, playerId: string): Promise<Run | undefined> {
  const [run] = await tx
    .select()
    .from(runs)
    .where(and(eq(runs.playerId, playerId), eq(runs.status, 'active')))
    .limit(1)
  return run
}

/**
 * Khoá dòng lượt chơi cho tới hết transaction.
 * Đây là thứ khiến hai request cùng nonce phải xếp hàng thay vì chạy song song.
 */
export async function lockRun(tx: Tx, runId: string, playerId: string): Promise<Run | undefined> {
  const [run] = await tx
    .select()
    .from(runs)
    .where(and(eq(runs.id, runId), eq(runs.playerId, playerId)))
    .limit(1)
    .for('update')
  return run
}

export async function findRunByCode(tx: Tx, code: string): Promise<Run | undefined> {
  const [run] = await tx.select().from(runs).where(eq(runs.runCode, code)).limit(1)
  return run
}

export async function updateRunState(tx: Tx, runId: string, patch: RunStatePatch): Promise<void> {
  await tx.update(runs).set(patch).where(eq(runs.id, runId))
}
