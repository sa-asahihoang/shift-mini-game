// src/instrumentation.ts
import { logger } from '@/lib/observability/logger'

/**
 * Bề mặt tối thiểu chúng ta thật sự dùng của Sentry.
 *
 * Khai báo tại chỗ thay vì `typeof import('@sentry/node')` để typecheck không cần
 * gói đó có mặt — nó là phụ thuộc tuỳ chọn, chỉ cài khi bật Sentry.
 */
interface SentryLike {
  init(options: Record<string, unknown>): void
  withScope(callback: (scope: { setTags(tags: Record<string, string>): void }) => void): void
  captureException(error: unknown): void
}

/**
 * Ba biến này không có giá trị mặc định ở bất cứ đâu trong mã nguồn, và thiếu
 * biến nào cũng làm hỏng một thứ khác nhau: SESSION_SECRET thì không ký được
 * cookie, IP_HASH_SALT thì không tạo được lượt, ADMIN_TOKEN thì `assertAdmin`
 * từ chối tất cả — tức là một triển khai không xử được khiếu nại nào.
 *
 * Trước đây cả ba chỉ ném theo từng request. Container vẫn khởi động lành lặn,
 * qua health check, rồi 500 trên mọi request chơi game. Kiểm ở đây để nó chết
 * đúng lúc người vận hành còn đang nhìn màn hình deploy.
 */
const REQUIRED_ENV = ['SESSION_SECRET', 'IP_HASH_SALT', 'ADMIN_TOKEN'] as const

export function assertRequiredEnv(env: Partial<NodeJS.ProcessEnv> = process.env): void {
  const missing = REQUIRED_ENV.filter((key) => !env[key])
  if (missing.length > 0) {
    throw new Error(`thiếu biến môi trường bắt buộc: ${missing.join(', ')}`)
  }
}

// Next.js gọi hàm này một lần khi server khởi động.
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  assertRequiredEnv()

  const dsn = process.env.SENTRY_DSN
  if (!dsn) return

  const { setErrorReporter } = await import('@/lib/observability/errors')

  // Specifier gián tiếp, KHÔNG phải chuỗi literal. Turbopack phân giải tĩnh mọi
  // import có literal để chia chunk, kể cả trong nhánh không bao giờ chạy tới —
  // nên để literal ở đây làm `next build` hỏng trên mọi triển khai KHÔNG dùng
  // Sentry, ngược hẳn ý đồ "không đặt DSN thì bỏ qua". Đã kiểm chứng: build báo
  // "Module not found: Can't resolve '@sentry/node'".
  const specifier = process.env.SENTRY_MODULE ?? '@sentry/node'

  try {
    const Sentry = (await import(specifier)) as unknown as SentryLike

    Sentry.init({
      dsn,
      tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
      environment: process.env.NODE_ENV,
    })

    setErrorReporter((error, tags) => {
      Sentry.withScope((scope) => {
        scope.setTags(tags)
        Sentry.captureException(error)
      })
    })
  } catch (error) {
    // Đặt DSN mà chưa cài gói thì phải kêu to rồi chạy tiếp không có Sentry.
    // Sập ở đây nghĩa là một biến môi trường cấu hình sai làm chết cả app.
    logger.error({ err: error }, 'không nạp được Sentry, chạy tiếp không có báo lỗi từ xa')
  }
}
