// src/lib/services/errors.ts
import type { Db } from '@/lib/db/client'
import { recordAudit, type AuditType } from '@/lib/repo/audit'

export interface AuditPayload {
  type: AuditType
  playerId?: string
  runId?: string
  requestId?: string
  payload?: Record<string, unknown>
}

export class ServiceError extends Error {
  /** Đặt true sau khi audit đã được ghi, để không ghi hai lần khi lỗi đi qua nhiều lớp. */
  audited = false

  constructor(
    readonly code: string,
    readonly httpStatus: number,
    message: string,
    readonly audit?: AuditPayload,
  ) {
    super(message)
    this.name = new.target.name
  }
}

export class NotFoundError extends ServiceError {
  constructor(message: string, audit?: AuditPayload) {
    super('not_found', 404, message, audit)
  }
}

export class ConflictError extends ServiceError {
  constructor(code: string, message: string, audit?: AuditPayload) {
    super(code, 409, message, audit)
  }
}

export class RateLimitedError extends ServiceError {
  constructor(message: string, audit?: AuditPayload) {
    super('rate_limited', 429, message, audit)
  }
}

/**
 * Ghi sự kiện đối chiếu của một request bị từ chối.
 *
 * Phải gọi NGOÀI transaction đã rollback. Nếu ghi bên trong, rollback cuốn luôn
 * bản ghi audit — và mất đúng thứ cần nhất khi người chơi khiếu nại "tôi bấm mà
 * không ăn".
 *
 * CẢNH BÁO: kiểu `Db` ở đây KHÔNG chặn được việc truyền nhầm một transaction
 * handle. Drizzle định nghĩa transaction kế thừa từ cùng lớp cơ sở, nên
 * `recordRejection(tx, err)` biên dịch trót lọt và âm thầm ghi audit vào đúng
 * transaction sắp bị rollback. Luôn truyền kết nối gốc: `input.db` hoặc `getDb()`.
 * Test "ghi audit dù transaction đã rollback" ở tầng service là chốt chặn thật
 * cho quy tắc này.
 */
export async function recordRejection(db: Db, error: ServiceError): Promise<void> {
  if (!error.audit || error.audited) return
  await recordAudit(db, {
    type: error.audit.type,
    playerId: error.audit.playerId ?? null,
    runId: error.audit.runId ?? null,
    requestId: error.audit.requestId ?? null,
    payload: error.audit.payload ?? {},
  })
  // Đặt cờ SAU khi ghi xong. Đặt trước thì một lần ghi hỏng sẽ để lại cờ đã bật
  // mà không có bản ghi nào, và mọi lớp phía sau đều bỏ qua — mất luôn sự kiện
  // quan trọng nhất thay vì có cơ hội ghi lại.
  error.audited = true
}
