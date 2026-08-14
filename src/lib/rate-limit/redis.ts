import Redis from 'ioredis'
import { logger } from '@/lib/observability/logger'
import type { RateLimitDecision, RateLimiter } from './index'

/**
 * Cửa sổ cố định bằng INCR + EXPIRE. Đủ cho mục đích chặn bot, và quan trọng hơn:
 * Redis chết thì cho qua thay vì chặn hết người chơi.
 */
export function createRedisRateLimiter(url: string): RateLimiter {
  const redis = new Redis(url, { maxRetriesPerRequest: 1, lazyConnect: true })

  return {
    async hit(key, limit, windowSeconds, now = Date.now()): Promise<RateLimitDecision> {
      const bucket = Math.floor(now / (windowSeconds * 1000))
      const redisKey = `rl:${key}:${bucket}`

      try {
        const count = await redis.incr(redisKey)
        if (count === 1) await redis.expire(redisKey, windowSeconds)

        return {
          allowed: count <= limit,
          remaining: Math.max(0, limit - count),
          resetAt: (bucket + 1) * windowSeconds * 1000,
        }
      } catch (error) {
        // Cho qua khi Redis hỏng là có chủ đích. Nhưng phải để lại dấu: nếu đây là
        // bug trong code chứ không phải sự cố hạ tầng, mọi lời gọi đều ném và lớp
        // chắn bot tắt vĩnh viễn mà không ai biết.
        logger.warn({ err: error, key }, 'rate limiter Redis lỗi, cho qua')
        return { allowed: true, remaining: limit, resetAt: now + windowSeconds * 1000 }
      }
    },
  }
}
