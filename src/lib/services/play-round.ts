// src/lib/services/play-round.ts
import type { Db } from '@/lib/db/client'
import { deriveHand } from '@/lib/fairness'
import { judge, type Hand, type Outcome } from '@/lib/game/hands'
import { applyOutcome, type RunStatus } from '@/lib/game/run-state'
import { recordAudit } from '@/lib/repo/audit'
import { raiseBestWins } from '@/lib/repo/players'
import { findRound, insertRound } from '@/lib/repo/rounds'
import { lockRun, updateRunState } from '@/lib/repo/runs'
import { getLogger } from '@/lib/observability/logger'
import { ConflictError, NotFoundError, ServiceError, recordRejection } from './errors'

export interface PlayRoundInput {
  db: Db
  runId: string
  playerId: string
  hand: Hand
  nonce: number
  requestId?: string
  latencyMs?: number
}

export interface PlayRoundResult {
  nonce: number
  playerHand: Hand
  serverHand: Hand
  outcome: Outcome
  wins: number
  status: RunStatus
  targetWins: number
  /** Chỉ có mặt khi lượt đã kết thúc. Không bao giờ trả khi status = 'active'. */
  serverSeed?: string
  replayed: boolean
}

export async function playRound(input: PlayRoundInput): Promise<PlayRoundResult> {
  try {
    return await runInTransaction(input)
  } catch (error) {
    // Transaction đã rollback, nên audit của request bị từ chối phải ghi ở đây.
    // Bọc catch: nếu ghi audit hỏng, lỗi ghi KHÔNG được thay chỗ ServiceError gốc —
    // người chơi phải nhận đúng 409 chứ không phải 500 vì một sự cố ghi nhật ký.
    if (error instanceof ServiceError) {
      await recordRejection(input.db, error).catch((failure) =>
        getLogger().error({ err: failure }, 'ghi audit cho request bị từ chối thất bại'),
      )
    }
    throw error
  }
}

async function runInTransaction(input: PlayRoundInput): Promise<PlayRoundResult> {
  const { db, runId, playerId, hand, nonce } = input

  return db.transaction(async (tx) => {
    const run = await lockRun(tx, runId, playerId)
    if (!run) {
      throw new NotFoundError('không tìm thấy lượt chơi')
    }

    const auditBase = { playerId, runId, requestId: input.requestId }

    // Nonce đã chơi rồi: có thể là retry chính đáng của mạng lỗi, có thể là gian lận.
    // Phân biệt bằng tay đã đánh. Kiểm tra này phải đứng TRƯỚC kiểm tra status,
    // để retry ván cuối của một lượt vừa kết thúc vẫn nhận lại được kết quả.
    if (nonce < run.nextNonce) {
      const existing = await findRound(tx, runId, nonce)

      if (existing && existing.playerHand === hand) {
        return {
          nonce,
          playerHand: hand,
          serverHand: existing.serverHand as Hand,
          outcome: existing.outcome,
          wins: run.wins,
          status: run.status,
          targetWins: run.targetWins,
          serverSeed: run.status === 'active' ? undefined : run.serverSeed,
          replayed: true,
        }
      }

      throw new ConflictError('replay_rejected', 'ván này đã chơi rồi với tay khác', {
        ...auditBase,
        type: 'replay_rejected',
        payload: { nonce, submittedHand: hand, recordedHand: existing?.playerHand ?? null },
      })
    }

    if (nonce > run.nextNonce) {
      throw new ConflictError('nonce_mismatch', 'sai thứ tự ván', {
        ...auditBase,
        type: 'nonce_mismatch',
        payload: { nonce, expected: run.nextNonce },
      })
    }

    if (run.status !== 'active') {
      throw new ConflictError('run_not_active', `lượt đã kết thúc (${run.status})`, {
        ...auditBase,
        type: 'run_not_active',
        payload: { nonce, status: run.status },
      })
    }

    const serverHand = deriveHand(run.serverSeed, run.clientSeed, nonce)
    const outcome = judge(hand, serverHand)
    const next = applyOutcome(
      { status: 'active', wins: run.wins, nextNonce: run.nextNonce },
      outcome,
      { targetWins: run.targetWins, maxRounds: run.maxRounds },
    )

    await insertRound(tx, {
      runId,
      nonce,
      playerHand: hand,
      serverHand,
      outcome,
      requestId: input.requestId ?? null,
      latencyMs: input.latencyMs ?? null,
    })

    const ended = next.status !== 'active'
    await updateRunState(tx, runId, {
      status: next.status,
      wins: next.wins,
      nextNonce: next.nextNonce,
      endedAt: ended ? new Date() : null,
    })

    if (ended) {
      await raiseBestWins(tx, playerId, next.wins)
      await recordAudit(tx, {
        ...auditBase,
        type: 'seed_revealed',
        payload: { status: next.status, wins: next.wins, rounds: next.nextNonce },
      })
      if (next.status === 'abandoned') {
        await recordAudit(tx, {
          ...auditBase,
          type: 'run_capped',
          payload: { maxRounds: run.maxRounds, wins: next.wins },
        })
      }
    }

    return {
      nonce,
      playerHand: hand,
      serverHand,
      outcome,
      wins: next.wins,
      status: next.status,
      targetWins: run.targetWins,
      serverSeed: ended ? run.serverSeed : undefined,
      replayed: false,
    }
  })
}
