// src/app/api/runs/[id]/route.ts
import { getDb } from '@/lib/db/client'
import { withRequest } from '@/lib/http/handler'
import { parseRunId } from '@/lib/http/schemas'
import { listRounds } from '@/lib/repo/rounds'
import { NotFoundError } from '@/lib/services/errors'
import { runs } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'

// Route này trả hạt giống của lượt đã kết thúc và chỉ phân quyền bằng cookie —
// không bao giờ được để Next.js coi nó là tĩnh và phục vụ chung một bản.
export const dynamic = 'force-dynamic'

export const GET = withRequest(async (_request, context) => {
  const runId = parseRunId(context.params.id)
  const db = getDb()
  const [run] = await db
    .select()
    .from(runs)
    .where(and(eq(runs.id, runId), eq(runs.playerId, context.playerId)))
    .limit(1)

  if (!run) throw new NotFoundError('không tìm thấy lượt chơi')

  const played = await listRounds(db, run.id)

  return {
    runId: run.id,
    runCode: run.runCode,
    commitment: run.commitment,
    clientSeed: run.clientSeed,
    status: run.status,
    wins: run.wins,
    nextNonce: run.nextNonce,
    targetWins: run.targetWins,
    // Chỉ lộ khi lượt đã kết thúc.
    serverSeed: run.status === 'active' ? undefined : run.serverSeed,
    rounds: played.map((r) => ({
      nonce: r.nonce,
      playerHand: r.playerHand,
      serverHand: r.serverHand,
      outcome: r.outcome,
    })),
  }
})
