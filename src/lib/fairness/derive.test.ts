import { describe, expect, it } from 'vitest'
import { deriveHand } from './derive'
import { isHand } from '@/lib/game/hands'

const SEED = '3f1c'.repeat(16)
const CLIENT = 'nguoi-choi-tu-nhap'

describe('deriveHand', () => {
  it('luôn trả về một tay hợp lệ', () => {
    for (let nonce = 0; nonce < 100; nonce++) {
      expect(isHand(deriveHand(SEED, CLIENT, nonce))).toBe(true)
    }
  })

  it('tất định — cùng input luôn ra cùng output', () => {
    for (let nonce = 0; nonce < 50; nonce++) {
      expect(deriveHand(SEED, CLIENT, nonce)).toBe(deriveHand(SEED, CLIENT, nonce))
    }
  })

  it('đổi bất kỳ input nào cũng đổi chuỗi kết quả', () => {
    const base = Array.from({ length: 40 }, (_, n) => deriveHand(SEED, CLIENT, n)).join('')
    const otherSeed = Array.from({ length: 40 }, (_, n) => deriveHand('a'.repeat(64), CLIENT, n)).join('')
    const otherClient = Array.from({ length: 40 }, (_, n) => deriveHand(SEED, 'khac', n)).join('')
    expect(otherSeed).not.toBe(base)
    expect(otherClient).not.toBe(base)
  })

  it('phân phối đều ba tay — kiểm định chi-square', () => {
    const counts = [0, 0, 0]
    const samples = 300_000
    for (let nonce = 0; nonce < samples; nonce++) {
      counts[deriveHand(SEED, CLIENT, nonce)]++
    }
    const expectedCount = samples / 3
    const chiSquare = counts.reduce((sum, c) => sum + (c - expectedCount) ** 2 / expectedCount, 0)
    // bậc tự do 2, ngưỡng p = 0.001 là 13.816
    expect(chiSquare).toBeLessThan(13.816)
  })

  it('GOLDEN VECTOR — không bao giờ được cập nhật snapshot này', () => {
    const hands = Array.from({ length: 20 }, (_, nonce) => deriveHand(SEED, CLIENT, nonce))
    expect(hands.join(',')).toMatchSnapshot()
  })
})
