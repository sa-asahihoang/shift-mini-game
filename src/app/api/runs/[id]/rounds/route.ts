// src/app/api/runs/[id]/rounds/route.ts
import { getDb } from '@/lib/db/client'
import { withRequest } from '@/lib/http/handler'
import { parseRunId, playRoundSchema } from '@/lib/http/schemas'
import { getRateLimiter } from '@/lib/rate-limit'
import { RateLimitedError } from '@/lib/services/errors'
import { playRound } from '@/lib/services/play-round'
import { setContext } from '@/lib/observability/request-context'

export const POST = withRequest(async (request, context) => {
  const startedAt = Date.now()
  const runId = parseRunId(context.params.id)
  // .catch giống route tạo lượt: body rỗng hoặc hỏng làm request.json() ném
  // SyntaxError, vốn không phải ZodError lẫn ServiceError nên rơi thẳng vào 500.
  const body = playRoundSchema.parse(await request.json().catch(() => ({})))
  setContext({ runId, nonce: body.nonce })

  const decision = await getRateLimiter().hit(`round:${context.playerId}`, 120, 60)
  if (!decision.allowed) {
    throw new RateLimitedError('chơi quá nhanh', {
      type: 'rate_limited',
      playerId: context.playerId,
      runId,
      requestId: context.requestId,
      payload: { scope: 'round', nonce: body.nonce },
    })
  }

  return playRound({
    db: getDb(),
    runId,
    playerId: context.playerId,
    hand: body.hand,
    nonce: body.nonce,
    requestId: context.requestId,
    latencyMs: Date.now() - startedAt,
  })
})
