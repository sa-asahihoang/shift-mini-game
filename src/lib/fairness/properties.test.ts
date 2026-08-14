import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { deriveHand } from './derive'
import { judge, type Hand } from '@/lib/game/hands'

describe('tính chất thống kê của luật chơi', () => {
  it('tỉ lệ thắng trên ván có phân định hội tụ về 50%', () => {
    fc.assert(
      fc.property(
        fc.array(fc.nat({ max: 15 }), { minLength: 64, maxLength: 64 }).map((nums) => nums.map((n) => n.toString(16)).join('')),
        fc.string(),
        (serverSeed, clientSeed) => {
          let wins = 0
          let decided = 0
          const player: Hand = 0
          for (let nonce = 0; nonce < 60_000; nonce++) {
            const outcome = judge(player, deriveHand(serverSeed, clientSeed, nonce))
            if (outcome === 'draw') continue
            decided++
            if (outcome === 'win') wins++
          }
          const rate = wins / decided
          expect(rate).toBeGreaterThan(0.49)
          expect(rate).toBeLessThan(0.51)
        },
      ),
      { numRuns: 3 },
    )
  })

  it('phân bố độ dài chuỗi thắng khớp đường 1/2^n', () => {
    const serverSeed = 'c'.repeat(64)
    const clientSeed = 'phan-bo-chuoi'
    const runs = 100_000
    const reached = new Array(9).fill(0) as number[]

    let nonce = 0
    for (let run = 0; run < runs; run++) {
      let streak = 0
      for (;;) {
        const outcome = judge(0, deriveHand(serverSeed, clientSeed, nonce++))
        if (outcome === 'draw') continue
        if (outcome === 'lose') break
        streak++
        if (streak >= 8) break
      }
      for (let k = 1; k <= Math.min(streak, 8); k++) reached[k]++
    }

    for (let k = 1; k <= 6; k++) {
      const ratio = reached[k + 1] / reached[k]
      expect(ratio).toBeGreaterThan(0.45)
      expect(ratio).toBeLessThan(0.55)
    }
  })
})
