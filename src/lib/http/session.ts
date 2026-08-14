// src/lib/http/session.ts
import { getDb } from '@/lib/db/client'
import { createPlayer, findPlayer } from '@/lib/repo/players'
import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS, readPlayerId, signPlayerId } from '@/lib/session/cookie'

function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.get('cookie')
  if (!header) return undefined
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=')
    if (key === name) return rest.join('=')
  }
  return undefined
}

export interface ResolvedSession {
  playerId: string
  setCookie?: string
}

/** Đọc người chơi từ cookie, tạo mới nếu chưa có hoặc cookie không hợp lệ. */
export async function resolveSession(request: Request): Promise<ResolvedSession> {
  const secret = process.env.SESSION_SECRET
  if (!secret) throw new Error('thiếu biến môi trường SESSION_SECRET')

  const db = getDb()
  const signed = readCookie(request, SESSION_COOKIE)
  const claimed = readPlayerId(signed, secret)

  if (claimed && (await findPlayer(db, claimed))) {
    return { playerId: claimed }
  }

  const player = await createPlayer(db)
  const value = signPlayerId(player.id, secret)
  const attributes = [
    `${SESSION_COOKIE}=${value}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${SESSION_MAX_AGE_SECONDS}`,
  ]
  if (process.env.NODE_ENV === 'production') attributes.push('Secure')

  return { playerId: player.id, setCookie: attributes.join('; ') }
}

/**
 * CẢNH BÁO: tin `x-forwarded-for` vô điều kiện. Chấp nhận được khi app chỉ nhận
 * request qua proxy của Coolify (proxy tự ghi đè header). Nhưng nếu container
 * lộ ra Internet trực tiếp, giá trị này do người gọi tự đặt — nghĩa là cả
 * `ipHash` lưu trong `runs` lẫn khoá rate limit theo IP đều giả mạo được. Không
 * xử lý ở đây: sửa đúng cách là cấu hình danh sách proxy tin cậy, không phải
 * đoán mò trong code.
 */
export function clientIp(request: Request): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'unknown'
  )
}
