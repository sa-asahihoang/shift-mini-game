import { createHmac, timingSafeEqual } from 'node:crypto'

export const SESSION_COOKIE = 'janken_pid'
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 365

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url')
}

export function signPlayerId(playerId: string, secret: string): string {
  const payload = Buffer.from(playerId, 'utf8').toString('base64url')
  return `${payload}.${sign(payload, secret)}`
}

export function readPlayerId(cookieValue: string | undefined, secret: string): string | null {
  if (!cookieValue) return null

  const parts = cookieValue.split('.')
  if (parts.length !== 2) return null

  const [payload, signature] = parts
  const expected = Buffer.from(sign(payload, secret))
  const received = Buffer.from(signature)
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null

  return Buffer.from(payload, 'base64url').toString('utf8')
}

/** Lưu IP đã băm thay vì IP thô — vẫn nhóm được hành vi mà không giữ dữ liệu cá nhân. */
export function hashIp(ip: string, salt: string): string {
  return createHmac('sha256', salt).update(ip).digest('hex')
}
