import type { RateLimitDecision, RateLimiter } from './index'

interface Window {
  count: number
  resetAt: number
}

/**
 * Số lời gọi giữa hai lần dọn. Dọn mỗi lần `hit` sẽ là O(số khoá) trên đường
 * nóng; dọn định kỳ trả về O(1) khấu hao mà vẫn không để map phình vô hạn.
 */
export const MEMORY_SWEEP_EVERY = 256

export interface MemoryRateLimiter extends RateLimiter {
  /** Số cửa sổ đang giữ. Có mặt để test khẳng định được việc dọn thật sự xảy ra. */
  size(): number
}

/** Cửa sổ cố định. Dùng cho test và cho môi trường không có Redis. */
export function createMemoryRateLimiter(): MemoryRateLimiter {
  const windows = new Map<string, Window>()
  let sinceSweep = 0

  return {
    size: () => windows.size,

    async hit(key, limit, windowSeconds, now = Date.now()): Promise<RateLimitDecision> {
      // Không có bước này thì mỗi khoá từng xuất hiện đều nằm lại trong map mãi
      // mãi. Đường rơi về bộ nhớ vẫn chạy thật trên production mỗi khi không
      // dựng được client Redis, và ở đó khoá là băm IP — tức là do người ngoài
      // quyết định có bao nhiêu khoá.
      if (++sinceSweep >= MEMORY_SWEEP_EVERY) {
        sinceSweep = 0
        for (const [existingKey, window] of windows) {
          if (window.resetAt <= now) windows.delete(existingKey)
        }
      }

      const existing = windows.get(key)
      const window =
        existing && existing.resetAt > now ? existing : { count: 0, resetAt: now + windowSeconds * 1000 }

      window.count++
      windows.set(key, window)

      return {
        allowed: window.count <= limit,
        remaining: Math.max(0, limit - window.count),
        resetAt: window.resetAt,
      }
    },
  }
}
