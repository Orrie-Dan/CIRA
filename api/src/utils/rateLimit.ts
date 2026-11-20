import type { FastifyInstance } from 'fastify'
import rateLimit from '@fastify/rate-limit'
import { getRedis } from '../services/redis.js'
import { ApiError } from './errors.js'

/**
 * Registers @fastify/rate-limit in opt-in mode: only routes that declare
 * `config: { rateLimit: ... }` (see `limits` below) are limited.
 * Keys on request.ip, which honours the Fastify `trustProxy` setting, so
 * clients cannot spoof X-Forwarded-For unless a trusted proxy is configured.
 * Uses Redis when REDIS_URL is set so limits are shared across instances.
 */
export async function registerRateLimit(app: FastifyInstance): Promise<void> {
  const redis = getRedis()
  await app.register(rateLimit, {
    global: false,
    ...(redis ? { redis, nameSpace: 'ratelimit:' } : {}),
    // The plugin throws what this returns, so it goes through the app's
    // error handler like any other ApiError (Retry-After header is still set).
    errorResponseBuilder: (_request, context) =>
      new ApiError(429, 'Too many requests. Please try again later.', 'RATE_LIMIT_EXCEEDED', {
        retryAfter: context.after,
      }),
  })
}

const minutes = (n: number) => n * 60 * 1000

/** Per-route limits, keyed by client IP. Use as `config: { rateLimit: limits.login }`. */
export const limits = {
  login: { max: 20, timeWindow: minutes(15) },
  register: { max: 10, timeWindow: minutes(60) },
  oauth: { max: 20, timeWindow: minutes(15) },
  /** Endpoints that send an email/SMS. */
  sendCode: { max: 5, timeWindow: minutes(15) },
  /** Endpoints that check a code (each code also has its own attempt cap). */
  verifyCode: { max: 10, timeWindow: minutes(15) },
  createReport: { max: 10, timeWindow: minutes(15) },
  sseTicket: { max: 30, timeWindow: minutes(5) },
  /** Geocoding proxies Nominatim (1 req/s policy); results are cached. */
  geocoding: { max: 60, timeWindow: minutes(1) },
}

/**
 * Parses TRUST_PROXY for the Fastify `trustProxy` option:
 * unset/"false" -> false, "true" -> true, a number -> that many hops,
 * anything else -> passed through (IP/CIDR list).
 */
export function parseTrustProxy(value: string | undefined): boolean | number | string {
  if (!value || value === 'false') return false
  if (value === 'true') return true
  const hops = Number(value)
  if (Number.isInteger(hops) && hops >= 0) return hops
  return value
}
