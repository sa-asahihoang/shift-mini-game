// src/app/api/runs/route.ts
import { getDb } from '@/lib/db/client'
import { withRequest } from '@/lib/http/handler'
import { startRunSchema } from '@/lib/http/schemas'
import { clientIp } from '@/lib/http/session'
import { getRateLimiter } from '@/lib/rate-limit'
import { hashIp } from '@/lib/session/cookie'
import { RateLimitedError } from '@/lib/services/errors'
import { startRun } from '@/lib/services/start-run'

export const POST = withRequest(async (request, context) => {
  const body = startRunSchema.parse(await request.json().catch(() => ({})))
  // Không đặt giá trị mặc định cho muối: thiếu biến này mà vẫn chạy nghĩa là mọi
  // triển khai băm IP bằng cùng một muối ai cũng đoán được, và bảng tra ngược dựng
  // sẵn sẽ khôi phục lại IP thô. Thà sập lúc khởi động còn hơn âm thầm mất tác dụng.
  const salt = process.env.IP_HASH_SALT
  if (!salt) throw new Error('thiếu biến môi trường IP_HASH_SALT')
  const ipHash = hashIp(clientIp(request), salt)

  const decision = await getRateLimiter().hit(`start:${context.playerId}`, 30, 60)
  if (!decision.allowed) {
    throw new RateLimitedError('tạo lượt quá nhanh', {
      type: 'rate_limited',
      playerId: context.playerId,
      requestId: context.requestId,
      payload: { scope: 'start' },
    })
  }

  return startRun({
    db: getDb(),
    playerId: context.playerId,
    clientSeed: body.clientSeed,
    ipHash,
    userAgent: request.headers.get('user-agent') ?? undefined,
    requestId: context.requestId,
  })
})
