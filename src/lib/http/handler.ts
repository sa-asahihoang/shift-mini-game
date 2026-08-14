// src/lib/http/handler.ts
import { randomUUID } from 'node:crypto'
import { ZodError } from 'zod'
import { getDb } from '@/lib/db/client'
import { reportError } from '@/lib/observability/errors'
import { getLogger } from '@/lib/observability/logger'
import { runWithContext, setContext } from '@/lib/observability/request-context'
import { getRateLimiter } from '@/lib/rate-limit'
import { hashIp } from '@/lib/session/cookie'
import { RateLimitedError, ServiceError, recordRejection } from '@/lib/services/errors'
import { clientIp, resolveSession } from './session'

export interface HandlerContext {
  requestId: string
  playerId: string
  params: Record<string, string>
}

type RouteParams = { params: Promise<Record<string, string>> }

function jsonResponse(body: unknown, status: number, setCookie?: string, requestId?: string): Response {
  // GET /api/runs/:id trả serverSeed cho lượt đã kết thúc và chỉ được phân quyền
  // bằng cookie. Hôm nay không có gì cache nó, nhưng một proxy thêm vào sau này
  // là đủ để một người chơi nhận hạt giống của lượt người khác — mà đó là điều
  // không rút lại được. Chặn từ gốc, cho mọi response.
  const headers = new Headers({ 'content-type': 'application/json', 'cache-control': 'no-store' })
  if (setCookie) headers.append('set-cookie', setCookie)
  if (requestId) headers.set('x-request-id', requestId)
  return new Response(JSON.stringify(body), { status, headers })
}

/**
 * Trần rộng tay: một NAT doanh nghiệp hay một proxy có thể đặt rất nhiều người
 * chơi thật sau cùng một địa chỉ. Mục tiêu là chặn lạm dụng, không phải soi
 * người chơi bình thường.
 */
const IP_RATE_LIMIT = 300
const IP_RATE_WINDOW_SECONDS = 60

/**
 * Chặn theo IP, chạy TRƯỚC `resolveSession`.
 *
 * Mọi limiter khác đều khoá theo `playerId`, mà `resolveSession` lại cấp một
 * `players` row mới cho bất kỳ request nào không mang cookie hợp lệ — nên chỉ
 * cần không gửi cookie là mỗi request có một xô đếm trắng tinh. Đặt trước
 * `resolveSession` là điều kiện cần: đứng sau thì hàng đã ghi vào DB rồi.
 *
 * Cố ý KHÔNG ghi `audit_events`: ở đây chưa có người chơi để quy trách nhiệm, và
 * quan trọng hơn, ghi một dòng cho mỗi request bị chặn biến chính bảng append-only
 * này thành đích tấn công. Log là đủ để người vận hành nhìn thấy.
 */
async function enforceIpRateLimit(request: Request): Promise<void> {
  const salt = process.env.IP_HASH_SALT
  if (!salt) throw new Error('thiếu biến môi trường IP_HASH_SALT')

  const ipHash = hashIp(clientIp(request), salt)
  const decision = await getRateLimiter().hit(`ip:${ipHash}`, IP_RATE_LIMIT, IP_RATE_WINDOW_SECONDS)
  if (!decision.allowed) {
    // Chỉ log phần băm — IP thô không bao giờ rời khỏi tiến trình.
    getLogger().warn({ ipHash, limit: IP_RATE_LIMIT }, 'chặn theo IP: quá nhiều request')
    throw new RateLimitedError('quá nhiều request từ địa chỉ này')
  }
}

/**
 * Bọc mọi route: gán requestId, dựng session, đặt request context cho logger,
 * và quy lỗi có kiểu về mã HTTP tương ứng.
 */
export function withRequest(
  handler: (request: Request, context: HandlerContext) => Promise<unknown>,
) {
  return async (request: Request, route?: RouteParams): Promise<Response> => {
    const requestId = request.headers.get('x-request-id') ?? randomUUID()

    return runWithContext({ requestId }, async () => {
      const startedAt = Date.now()
      let setCookie: string | undefined

      try {
        await enforceIpRateLimit(request)

        const session = await resolveSession(request)
        setCookie = session.setCookie
        setContext({ playerId: session.playerId })

        const params = route ? await route.params : {}
        const body = await handler(request, { requestId, playerId: session.playerId, params })

        getLogger().info({ durationMs: Date.now() - startedAt, status: 200 }, 'request ok')
        return jsonResponse(body, 200, setCookie, requestId)
      } catch (error) {
        if (error instanceof ZodError) {
          getLogger().warn({ issues: error.issues }, 'dữ liệu gửi lên không hợp lệ')
          return jsonResponse({ error: 'invalid_request', issues: error.issues }, 400, setCookie, requestId)
        }
        if (error instanceof ServiceError) {
          // Bắt cả lỗi ném thẳng từ route (rate limit) — recordRejection tự bỏ qua
          // nếu service đã ghi audit rồi, nên không có chuyện ghi hai lần.
          await recordRejection(getDb(), error).catch((failure) =>
            getLogger().error({ err: failure }, 'ghi audit cho request bị từ chối thất bại'),
          )
          getLogger().warn({ code: error.code, status: error.httpStatus }, error.message)
          return jsonResponse({ error: error.code, message: error.message }, error.httpStatus, setCookie, requestId)
        }
        getLogger().error({ err: error }, 'lỗi không lường trước')
        reportError(error)
        return jsonResponse({ error: 'internal_error' }, 500, setCookie, requestId)
      }
    })
  }
}
