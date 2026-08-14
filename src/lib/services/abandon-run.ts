// src/lib/services/abandon-run.ts
import type { Db } from '@/lib/db/client'
import { recordAudit } from '@/lib/repo/audit'
import { raiseBestWins } from '@/lib/repo/players'
import { lockRun, updateRunState } from '@/lib/repo/runs'
import { getLogger } from '@/lib/observability/logger'
import { ConflictError, NotFoundError, ServiceError, recordRejection } from './errors'

export interface AbandonRunInput {
  db: Db
  runId: string
  playerId: string
  requestId?: string
}

export interface AbandonRunResult {
  status: 'abandoned'
  serverSeed: string
  wins: number
}

/**
 * Bỏ lượt giữa chừng và lộ seed ngay, để người chơi vẫn kiểm chứng được.
 * Bỏ lượt không mang lại lợi thế nào — lượt mới có seed mới ngẫu nhiên —
 * nên không cần chống lạm dụng.
 */
export async function abandonRun(input: AbandonRunInput): Promise<AbandonRunResult> {
  try {
    return await input.db.transaction(async (tx) => {
      const run = await lockRun(tx, input.runId, input.playerId)
      if (!run) throw new NotFoundError('không tìm thấy lượt chơi')

      if (run.status !== 'active') {
        throw new ConflictError('run_not_active', `lượt đã kết thúc (${run.status})`, {
          type: 'run_not_active',
          playerId: input.playerId,
          runId: input.runId,
          requestId: input.requestId,
          payload: { status: run.status },
        })
      }

      await updateRunState(tx, run.id, {
        status: 'abandoned',
        wins: run.wins,
        nextNonce: run.nextNonce,
        endedAt: new Date(),
      })
      await raiseBestWins(tx, input.playerId, run.wins)

      // Ghi cả hai: `run_abandoned` nói vì sao lượt kết thúc, `seed_revealed` đánh
      // dấu thời điểm seed trở nên biết được. Thiếu sự kiện thứ hai thì một truy vấn
      // `type = 'seed_revealed'` để dựng lại mọi lần seed lộ ra sẽ bỏ sót đúng
      // đường này, dù seed ở đây cũng lộ y như khi thua hay thắng.
      const auditBase = {
        playerId: input.playerId,
        runId: run.id,
        requestId: input.requestId ?? null,
      }
      await recordAudit(tx, {
        ...auditBase,
        type: 'run_abandoned',
        payload: { wins: run.wins, rounds: run.nextNonce },
      })
      await recordAudit(tx, {
        ...auditBase,
        type: 'seed_revealed',
        payload: { status: 'abandoned', wins: run.wins, rounds: run.nextNonce },
      })

      return { status: 'abandoned' as const, serverSeed: run.serverSeed, wins: run.wins }
    })
  } catch (error) {
    if (error instanceof ServiceError) {
      await recordRejection(input.db, error).catch((failure) =>
        getLogger().error({ err: failure }, 'ghi audit cho request bị từ chối thất bại'),
      )
    }
    throw error
  }
}
