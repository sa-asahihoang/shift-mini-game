// src/lib/services/start-run.ts
import type { Db } from '@/lib/db/client'
import { loadGameConfig, type GameConfig } from '@/lib/config/game'
import { commit, generateClientSeed, generateServerSeed } from '@/lib/fairness'
import { recordAudit } from '@/lib/repo/audit'
import { findActiveRun, insertRun } from '@/lib/repo/runs'
import { generateRunCode } from '@/lib/run-code'

export interface StartRunInput {
  db: Db
  playerId: string
  clientSeed?: string
  ipHash?: string
  userAgent?: string
  requestId?: string
  config?: GameConfig
}

export interface StartRunResult {
  runId: string
  runCode: string
  commitment: string
  clientSeed: string
  targetWins: number
  wins: number
  nextNonce: number
  resumed: boolean
}

export const MAX_CLIENT_SEED_LENGTH = 128

/**
 * Tạo lượt mới, hoặc trả lại lượt đang dở.
 *
 * Mỗi người chơi chỉ được có một lượt active — quy tắc này còn được ép ở tầng DB
 * bằng partial unique index, nên hai request song song không thể cùng tạo lượt.
 */
export async function startRun(input: StartRunInput): Promise<StartRunResult> {
  const config = input.config ?? loadGameConfig()

  return input.db.transaction(async (tx) => {
    const existing = await findActiveRun(tx, input.playerId)
    if (existing) {
      return {
        runId: existing.id,
        runCode: existing.runCode,
        commitment: existing.commitment,
        clientSeed: existing.clientSeed,
        targetWins: existing.targetWins,
        wins: existing.wins,
        nextNonce: existing.nextNonce,
        resumed: true,
      }
    }

    const serverSeed = generateServerSeed()
    const clientSeed = (input.clientSeed ?? '').trim().slice(0, MAX_CLIENT_SEED_LENGTH) || generateClientSeed()

    const run = await insertRun(tx, {
      runCode: generateRunCode(),
      playerId: input.playerId,
      serverSeed,
      commitment: commit(serverSeed),
      clientSeed,
      targetWins: config.targetWins,
      maxRounds: config.maxRoundsPerRun,
      ipHash: input.ipHash ?? null,
      userAgent: input.userAgent ?? null,
    })

    await recordAudit(tx, {
      type: 'run_started',
      playerId: input.playerId,
      runId: run.id,
      requestId: input.requestId ?? null,
      payload: { commitment: run.commitment, targetWins: run.targetWins },
    })

    return {
      runId: run.id,
      runCode: run.runCode,
      commitment: run.commitment,
      clientSeed: run.clientSeed,
      targetWins: run.targetWins,
      wins: 0,
      nextNonce: 0,
      resumed: false,
    }
  })
}
