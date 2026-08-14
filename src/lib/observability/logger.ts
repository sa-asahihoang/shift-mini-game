// src/lib/observability/logger.ts
import pino, { type Logger } from 'pino'
import { getContext } from './request-context'

/**
 * serverSeed không bao giờ được xuất hiện trong log khi lượt còn active.
 * Khai báo ở cấp logger để nó không lọt ra kể cả khi ai đó vô ý log nguyên object.
 * Thêm đường dẫn mới vào đây ngay khi có chỗ mới có thể chứa seed.
 *
 * Trần lồng: danh sách trên phủ tối đa 3 cấp khoá tuỳ ý. Lồng sâu hơn — ví dụ
 * log nguyên một object request đã bọc nhiều lớp — sẽ để seed lọt ra nguyên văn.
 * Đừng log nguyên object thô nhiều lớp; lấy đúng trường cần rồi hãy log.
 */
export const REDACT_PATHS = [
  'serverSeed',
  '*.serverSeed',
  '*.*.serverSeed',
  '*.*.*.serverSeed',
  'run.serverSeed',
  'result.serverSeed',
  'rounds[*].serverSeed',
]

export const logger: Logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
  base: { service: 'janken' },
})

/** Logger đã gắn sẵn khoá tương quan của request hiện tại. */
export function getLogger(): Logger {
  const context = getContext()
  return context ? logger.child({ ...context }) : logger
}
