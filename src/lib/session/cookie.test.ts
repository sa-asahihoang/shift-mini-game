import { describe, expect, it } from 'vitest'
import { hashIp, readPlayerId, signPlayerId } from './cookie'

const SECRET = 'secret-du-dai-de-lam-khoa-hmac'
const PLAYER = '4f6d2c1a-0000-4000-8000-000000000001'

describe('cookie session', () => {
  it('ký rồi đọc lại ra đúng playerId', () => {
    expect(readPlayerId(signPlayerId(PLAYER, SECRET), SECRET)).toBe(PLAYER)
  })

  it('từ chối cookie bị sửa phần dữ liệu', () => {
    const signed = signPlayerId(PLAYER, SECRET)
    const [, signature] = signed.split('.')
    const forged = `${Buffer.from('4f6d2c1a-0000-4000-8000-000000000002').toString('base64url')}.${signature}`
    expect(readPlayerId(forged, SECRET)).toBeNull()
  })

  it('từ chối cookie ký bằng khoá khác', () => {
    expect(readPlayerId(signPlayerId(PLAYER, 'khoa-khac-hoan-toan'), SECRET)).toBeNull()
  })

  it('từ chối cookie rỗng hoặc sai định dạng', () => {
    expect(readPlayerId(undefined, SECRET)).toBeNull()
    expect(readPlayerId('', SECRET)).toBeNull()
    expect(readPlayerId('khong-co-dau-cham', SECRET)).toBeNull()
    expect(readPlayerId('a.b.c', SECRET)).toBeNull()
  })
})

describe('hashIp', () => {
  it('tất định và không lộ IP gốc', () => {
    const hashed = hashIp('203.0.113.9', 'muoi')
    expect(hashed).toBe(hashIp('203.0.113.9', 'muoi'))
    expect(hashed).not.toContain('203')
    expect(hashed).toMatch(/^[0-9a-f]{64}$/)
  })

  it('đổi muối thì đổi kết quả', () => {
    expect(hashIp('203.0.113.9', 'muoi-a')).not.toBe(hashIp('203.0.113.9', 'muoi-b'))
  })
})
