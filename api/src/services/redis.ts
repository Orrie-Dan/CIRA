import { Redis } from 'ioredis'

let client: Redis | null | undefined

/**
 * Shared Redis client, created once when REDIS_URL is set.
 * Returns null when Redis is not configured (single-instance / dev mode).
 */
export function getRedis(): Redis | null {
  if (client !== undefined) return client

  const redisUrl = process.env.REDIS_URL
  if (!redisUrl) {
    client = null
    return client
  }

  client = new Redis(redisUrl, { maxRetriesPerRequest: 2 })
  client.on('error', (err) => {
    console.error('[redis] connection error:', err.message)
  })
  return client
}

/** Test helper: inject a client (or null) instead of reading REDIS_URL. */
export function setRedisForTesting(value: Redis | null | undefined): void {
  client = value
}
