// src/lib/services/inspect-run.ts
import { timingSafeEqual } from 'node:crypto'
import type { Db } from '@/lib/db/client'
import { verifyRun, type VerifyResult } from '@/lib/fairness'
import type { Hand } from '@/lib/game/hands'
import { checkStoredRunState, type RunStateCheck, type RunStatus } from '@/lib/game/run-state'
import { listAuditForRun, type AuditEvent } from '@/lib/repo/audit'
import { listRounds } from '@/lib/repo/rounds'
import { findRunByCode } from '@/lib/repo/runs'
import { NotFoundError, ServiceError } from './errors'

export interface RunInspection {
  run: {
    id: string
    runCode: string
    status: string
    wins: number
    targetWins: number
    commitment: string
    clientSeed: string
    serverSeed: string
    createdAt: Date
    endedAt: Date | null
  }
  verification: VerifyResult
  /** Dựng lại `status`/`wins` từ sổ ván — `verifyRun` không hề chạm tới hai cột này. */
  stateCheck: RunStateCheck
  audit: AuditEvent[]
}

export function assertAdmin(token: string | undefined): void {
  const expected = process.env.ADMIN_TOKEN
  if (!expected) throw new ServiceError('forbidden', 403, 'chưa cấu hình ADMIN_TOKEN')

  const a = Buffer.from(token ?? '')
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new ServiceError('forbidden', 403, 'token quản trị không hợp lệ')
  }
}

/**
 * Dựng lại toàn cảnh một lượt bằng chính hàm mà người chơi dùng để kiểm chứng.
 * Một hàm, hai chỗ dùng — đó là điều khiến kết luận ở đây có sức nặng.
 */
export async function inspectRun(db: Db, runCode: string): Promise<RunInspection> {
  const run = await findRunByCode(db, runCode)
  if (!run) throw new NotFoundError(`không tìm thấy lượt có mã ${runCode}`)

  const played = await listRounds(db, run.id)

  return {
    run: {
      id: run.id,
      runCode: run.runCode,
      status: run.status,
      wins: run.wins,
      targetWins: run.targetWins,
      commitment: run.commitment,
      clientSeed: run.clientSeed,
      serverSeed: run.serverSeed,
      createdAt: run.createdAt,
      endedAt: run.endedAt,
    },
    verification: verifyRun({
      serverSeed: run.serverSeed,
      clientSeed: run.clientSeed,
      commitment: run.commitment,
      rounds: played.map((r) => ({
        nonce: r.nonce,
        playerHand: r.playerHand as Hand,
        serverHand: r.serverHand as Hand,
        outcome: r.outcome,
      })),
    }),
    stateCheck: checkStoredRunState(
      { status: run.status as RunStatus, wins: run.wins },
      played.map((r) => r.outcome),
      // Trần của CHÍNH lượt này, không phải config hiện tại: giá trị được chụp
      // lúc tạo lượt đúng vì lý do này.
      { targetWins: run.targetWins, maxRounds: run.maxRounds },
    ),
    audit: await listAuditForRun(db, run.id),
  }
}
