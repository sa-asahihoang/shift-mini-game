// src/lib/repo/audit.ts
import { desc, eq } from 'drizzle-orm'
import { auditEvents } from '@/lib/db/schema'
import type { Tx } from './players'

export type AuditEvent = typeof auditEvents.$inferSelect
export type NewAuditEvent = typeof auditEvents.$inferInsert

export type AuditType =
  | 'run_started'
  | 'seed_revealed'
  | 'run_abandoned'
  | 'run_capped'
  | 'rate_limited'
  | 'replay_rejected'
  | 'nonce_mismatch'
  | 'run_not_active'

export async function recordAudit(tx: Tx, event: NewAuditEvent & { type: AuditType }): Promise<void> {
  await tx.insert(auditEvents).values(event)
}

export async function listAuditForRun(tx: Tx, runId: string): Promise<AuditEvent[]> {
  return tx
    .select()
    .from(auditEvents)
    .where(eq(auditEvents.runId, runId))
    .orderBy(desc(auditEvents.createdAt))
}
