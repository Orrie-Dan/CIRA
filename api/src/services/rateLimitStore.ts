const WINDOW_MS = 15 * 60 * 1000
const MAX_REQUESTS = 10

const memoryRequests = new Map<string, { count: number; resetAt: number }>()

async function getRedisClient() {
  const redisUrl = process.env.REDIS_URL
  if (!redisUrl) return null

  try {
    const { default: Redis } = await import('ioredis')
    return new Redis(redisUrl, { maxRetriesPerRequest: 1, lazyConnect: true })
  } catch {
    return null
  }
}

export async function checkRateLimitAsync(
  ip: string
): Promise<{ allowed: boolean; resetAt?: number }> {
  const redis = await getRedisClient()
  const key = `ratelimit:${ip}`

  if (redis) {
    try {
      await redis.connect()
      const count = await redis.incr(key)
      if (count === 1) {
        await redis.pexpire(key, WINDOW_MS)
      }
      const ttl = await redis.pttl(key)
      await redis.quit()

      if (count > MAX_REQUESTS) {
        return { allowed: false, resetAt: Date.now() + ttl }
      }
      return { allowed: true }
    } catch {
      await redis.quit().catch(() => undefined)
    }
  }

  return checkRateLimit(ip)
}

export function checkRateLimit(ip: string): { allowed: boolean; resetAt?: number } {
  const now = Date.now()
  const record = memoryRequests.get(ip)

  if (!record || now > record.resetAt) {
    memoryRequests.set(ip, { count: 1, resetAt: now + WINDOW_MS })
    return { allowed: true }
  }

  if (record.count >= MAX_REQUESTS) {
    return { allowed: false, resetAt: record.resetAt }
  }

  record.count++
  memoryRequests.set(ip, record)
  return { allowed: true }
}

export function getClientIp(req: {
  headers: Record<string, string | string[] | undefined>
  ip?: string
}): string {
  if (req.ip && req.ip !== '127.0.0.1') return req.ip

  const forwarded = req.headers['x-forwarded-for']
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim()
  }
  return 'unknown'
}
