import { logger } from '@/lib/observability/logger'
import { createMemoryRateLimiter } from './memory'
import { createRedisRateLimiter } from './redis'

export interface RateLimitDecision {
  allowed: boolean
  remaining: number
  resetAt: number
}

export interface RateLimiter {
  hit(key: string, limit: number, windowSeconds: number, now?: number): Promise<RateLimitDecision>
}

let shared: RateLimiter | undefined

/**
 * Không có REDIS_URL thì rơi về bộ nhớ — game vẫn chạy, chỉ mất lớp chắn bot.
 *
 * Dựng client cũng phải rơi về bộ nhớ chứ không được ném lên: một REDIS_URL gõ sai
 * là tình huống dễ gặp hơn nhiều so với Redis sập giữa chừng, và để nó nổ ở đây thì
 * cả game chết vì một biến môi trường sai — đúng thứ nguyên tắc fail-open sinh ra
 * để tránh.
 */
export function getRateLimiter(): RateLimiter {
  if (!shared) {
    const url = process.env.REDIS_URL
    if (!url) {
      shared = createMemoryRateLimiter()
    } else {
      try {
        shared = createRedisRateLimiter(url)
      } catch (error) {
        logger.error({ err: error }, 'không dựng được rate limiter Redis, rơi về bộ nhớ')
        shared = createMemoryRateLimiter()
      }
    }
  }
  return shared
}

export { createMemoryRateLimiter, createRedisRateLimiter }
