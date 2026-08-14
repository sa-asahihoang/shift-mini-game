// src/lib/http/schemas.ts
import { z } from 'zod'
import { NotFoundError } from '@/lib/services/errors'

export const startRunSchema = z.object({
  clientSeed: z.string().trim().max(128).optional(),
})

export const playRoundSchema = z.object({
  hand: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  nonce: z.number().int().min(0),
})

const runIdSchema = z.string().uuid()

/**
 * Kiểm id lượt trước khi chạm DB. Không có bước này thì `/api/runs/khong-phai-uuid`
 * làm Postgres ném "invalid input syntax for type uuid" và rơi vào nhánh 500.
 *
 * Trả 404 chứ không phải 400 là có chủ đích: người dò id không được phân biệt
 * "id sai định dạng" với "id đúng định dạng nhưng không phải của bạn".
 */
export function parseRunId(raw: string): string {
  const parsed = runIdSchema.safeParse(raw)
  if (!parsed.success) throw new NotFoundError('không tìm thấy lượt chơi')
  return parsed.data
}
