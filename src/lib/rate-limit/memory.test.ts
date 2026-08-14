import { describe, expect, it } from 'vitest'
import { MEMORY_SWEEP_EVERY, createMemoryRateLimiter } from './memory'

describe('rate limiter trong bộ nhớ', () => {
  it('cho qua tới đúng hạn mức rồi chặn', async () => {
    const limiter = createMemoryRateLimiter()
    const now = 1_000_000

    for (let i = 0; i < 3; i++) {
      const decision = await limiter.hit('player-1', 3, 60, now)
      expect(decision.allowed).toBe(true)
      expect(decision.remaining).toBe(2 - i)
    }

    const blocked = await limiter.hit('player-1', 3, 60, now)
    expect(blocked.allowed).toBe(false)
    expect(blocked.remaining).toBe(0)
  })

  it('mở lại sau khi hết cửa sổ', async () => {
    const limiter = createMemoryRateLimiter()
    const now = 1_000_000

    await limiter.hit('player-2', 1, 60, now)
    expect((await limiter.hit('player-2', 1, 60, now)).allowed).toBe(false)
    expect((await limiter.hit('player-2', 1, 60, now + 61_000)).allowed).toBe(true)
  })

  it('cửa sổ vẫn còn hiệu lực ở đúng mốc resetAt', async () => {
    const limiter = createMemoryRateLimiter()
    const now = 1_000_000

    // Chốt ranh giới: test "mở lại sau khi hết cửa sổ" dùng now + 61s nên nó pass
    // với cả `>` lẫn `>=`, tức là không ghim được ngữ nghĩa nào. Mốc đúng bằng
    // resetAt mới phân biệt hai cách so sánh.
    await limiter.hit('bien', 1, 60, now)
    expect((await limiter.hit('bien', 1, 60, now + 59_999)).allowed).toBe(false)
    expect((await limiter.hit('bien', 1, 60, now + 60_000)).allowed).toBe(true)
  })

  it('đếm riêng cho từng khoá', async () => {
    const limiter = createMemoryRateLimiter()
    const now = 1_000_000

    await limiter.hit('a', 1, 60, now)
    expect((await limiter.hit('b', 1, 60, now)).allowed).toBe(true)
  })

  it('dọn cửa sổ đã hết hạn thay vì giữ mãi', async () => {
    const limiter = createMemoryRateLimiter()
    const now = 1_000_000

    for (let i = 0; i < 300; i++) await limiter.hit(`khoa-${i}`, 10, 60, now)
    expect(limiter.size()).toBe(300)

    // Sau khi cửa sổ của 300 khoá kia hết hạn, một khoá còn sống phải đẩy được
    // chúng ra khỏi bộ nhớ. Không có bước dọn thì size vẫn là 301 — và trên
    // production, khoá là băm IP do người ngoài quyết định.
    for (let i = 0; i < 2 * MEMORY_SWEEP_EVERY; i++) {
      await limiter.hit('con-song', 10_000, 60, now + 61_000)
    }
    expect(limiter.size()).toBe(1)
  })

  it('không dọn nhầm cửa sổ còn hiệu lực', async () => {
    const limiter = createMemoryRateLimiter()
    const now = 1_000_000

    await limiter.hit('van-con-han', 2, 60, now)
    for (let i = 0; i < 2 * MEMORY_SWEEP_EVERY; i++) await limiter.hit('khac', 10_000, 60, now + 30_000)

    // Cùng cửa sổ, nên lần bấm thứ ba của khoá này vẫn phải bị chặn.
    await limiter.hit('van-con-han', 2, 60, now + 30_000)
    expect((await limiter.hit('van-con-han', 2, 60, now + 30_000)).allowed).toBe(false)
  })

  it('trả về mốc thời gian mở lại', async () => {
    const limiter = createMemoryRateLimiter()
    const now = 1_000_000
    const decision = await limiter.hit('c', 1, 30, now)
    expect(decision.resetAt).toBe(now + 30_000)
  })
})
