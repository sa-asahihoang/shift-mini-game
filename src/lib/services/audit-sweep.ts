// src/lib/services/audit-sweep.ts
import { and, gte, ne } from 'drizzle-orm'
import type { Db } from '@/lib/db/client'
import { runs } from '@/lib/db/schema'
import { verifyRun } from '@/lib/fairness'
import type { Hand } from '@/lib/game/hands'
import { checkStoredRunState, type RunStatus } from '@/lib/game/run-state'
import { getLogger } from '@/lib/observability/logger'
import { listRounds } from '@/lib/repo/rounds'

export interface SweepReport {
  scanned: number
  /** Mã của những lượt dựng lại không khớp bản ghi. Rỗng là tốt. */
  mismatched: string[]
  /** true nếu số lượt trong cửa sổ chạm `limit` — còn lượt chưa được đối chiếu. */
  truncated: boolean
}

/**
 * Quét lại toàn bộ lượt đã kết thúc và tính lại tay của máy cho từng ván.
 * Lệch một ván là dấu hiệu bug hoặc dữ liệu bị can thiệp — cảnh báo ngay.
 */
export async function sweepFinishedRuns(db: Db, since: Date, limit = 5000): Promise<SweepReport> {
  // Lọc theo `endedAt`, KHÔNG theo `createdAt`. Một lượt bắt đầu trước cửa sổ mà
  // kết thúc bên trong nó sẽ không bao giờ được quét nếu lọc theo lúc tạo — và
  // không bao giờ theo nghĩa vĩnh viễn, vì cửa sổ đêm sau cũng tính từ hiện tại.
  // Người chơi rải một lượt qua nhiều ngày là chuyện bình thường, nên lọc sai ở
  // đây làm hỏng đúng mục đích của job: phát hiện trước khi người chơi phát hiện.
  const finished = await db
    .select()
    .from(runs)
    .where(and(ne(runs.status, 'active'), gte(runs.endedAt, since)))
    .limit(limit)

  const mismatched: string[] = []

  for (const run of finished) {
    const played = await listRounds(db, run.id)
    const result = verifyRun({
      serverSeed: run.serverSeed,
      clientSeed: run.clientSeed,
      commitment: run.commitment,
      rounds: played.map((r) => ({
        nonce: r.nonce,
        playerHand: r.playerHand as Hand,
        serverHand: r.serverHand as Hand,
        outcome: r.outcome,
      })),
    })

    // Từng ván khớp seed vẫn chưa đủ: `verifyRun` không hề đọc `runs.wins` hay
    // `runs.status`, nên một con số tổng bị hỏng đi qua nó sạch sẽ.
    const stateCheck = checkStoredRunState(
      { status: run.status as RunStatus, wins: run.wins },
      played.map((r) => r.outcome),
      { targetWins: run.targetWins, maxRounds: run.maxRounds },
    )

    if (!result.commitmentValid || !result.allRoundsMatch || !stateCheck.matches) {
      mismatched.push(run.runCode)
      getLogger().error(
        {
          runCode: run.runCode,
          commitmentValid: result.commitmentValid,
          allRoundsMatch: result.allRoundsMatch,
          stateMatches: stateCheck.matches,
          storedState: stateCheck.stored,
          derivedState: stateCheck.derived,
        },
        'đối chiếu thất bại — lượt chơi dựng lại không khớp bản ghi',
      )
    }
  }

  const truncated = finished.length === limit
  if (truncated) {
    // Không đổi mã thoát — cắt bớt không phải là lệch. Nhưng phải kêu to, vì im
    // lặng ở đây nghĩa là người vận hành tin rằng đã quét hết trong khi chưa.
    getLogger().warn(
      { limit, since: since.toISOString() },
      'quét chạm trần, còn lượt chưa được đối chiếu trong cửa sổ này',
    )
  }

  return { scanned: finished.length, mismatched, truncated }
}
