// src/lib/observability/errors.ts
import { logger } from './logger'
import { getContext } from './request-context'

export type ErrorReporter = (error: unknown, tags: Record<string, string>) => void

/**
 * Mảnh tên khoá không bao giờ được gửi ra ngoài, so sánh không phân biệt hoa
 * thường và theo kiểu CHỨA chứ không phải bằng đúng.
 *
 * Log nội bộ đã có `REDACT_PATHS`, nhưng chỗ này nghiêm hơn một bậc: dữ liệu rời
 * khỏi tầm kiểm soát của người vận hành. Một seed lọt vào kho của bên thứ ba thì
 * không rút lại được, và nó lọt đúng ở đường xử lý lỗi — nơi người ta quen tay
 * nhét thêm ngữ cảnh cho dễ điều tra.
 *
 * So khớp bằng đúng tên là một danh sách phải đoán trước mọi cách đặt tên:
 * `seedHex`, `serverSeedHash`, `rawSeed` đều lọt. Chặn theo mảnh thì chỉ cần
 * đoán đúng hai từ. Đánh đổi là có thể chặn nhầm một tag lành tính có chữ
 * "seed" — mất một tag chẩn đoán rẻ hơn nhiều so với mất một hạt giống.
 */
const FORBIDDEN_TAG_FRAGMENTS = ['seed', 'secret']

let reporter: ErrorReporter | null = null

/** Cắm Sentry (hoặc bất cứ thứ gì) ở đúng một chỗ này. */
export function setErrorReporter(next: ErrorReporter | null): void {
  reporter = next
}

export function reportError(error: unknown, tags: Record<string, string | undefined> = {}): void {
  const context = getContext()
  const merged: Record<string, string> = {}

  for (const [key, value] of Object.entries({ ...context, ...tags })) {
    if (value === undefined || value === null) continue
    const lowered = key.toLowerCase()
    if (FORBIDDEN_TAG_FRAGMENTS.some((fragment) => lowered.includes(fragment))) {
      // Chỉ log TÊN khoá, không bao giờ log giá trị.
      logger.warn({ key }, 'chặn một khoá cấm không cho gửi ra dịch vụ báo lỗi ngoài')
      continue
    }
    merged[key] = String(value)
  }

  try {
    reporter?.(error, merged)
  } catch (reportingFailure) {
    // Nhà cung cấp sập không được kéo theo request của người chơi.
    logger.warn({ err: reportingFailure }, 'gửi báo lỗi thất bại')
  }
}
