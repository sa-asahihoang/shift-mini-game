// src/app/api/runs/[id]/abandon/route.ts
import { getDb } from '@/lib/db/client'
import { withRequest } from '@/lib/http/handler'
import { parseRunId } from '@/lib/http/schemas'
import { getRateLimiter } from '@/lib/rate-limit'
import { RateLimitedError } from '@/lib/services/errors'
import { abandonRun } from '@/lib/services/abandon-run'

export const POST = withRequest(async (_request, context) => {
  const runId = parseRunId(context.params.id)

  // Bỏ lượt không mang lại lợi thế nào, nhưng gọi lại trên một lượt đã kết thúc
  // thì mỗi lần lại ghi thêm một `audit_events` — bảng append-only không có ai
  // dọn. Không có limiter ở đây thì đó là đường bơm dữ liệu rẻ nhất trong API.
  const decision = await getRateLimiter().hit(`abandon:${context.playerId}`, 30, 60)
  if (!decision.allowed) {
    throw new RateLimitedError('bỏ lượt quá nhanh', {
      type: 'rate_limited',
      playerId: context.playerId,
      runId,
      requestId: context.requestId,
      payload: { scope: 'abandon' },
    })
  }

  return abandonRun({
    db: getDb(),
    runId,
    playerId: context.playerId,
    requestId: context.requestId,
  })
})
