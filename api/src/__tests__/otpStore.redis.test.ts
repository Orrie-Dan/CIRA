import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { Redis } from 'ioredis'
import { setRedisForTesting } from '../services/redis.js'
import { storeOtpRecord, verifyOtpRecord, OTP_MAX_ATTEMPTS } from '../services/otpStore.js'
import * as store from '../services/ephemeralStore.js'

/**
 * Runs against a real Redis when REDIS_TEST_URL is set, e.g.
 *   REDIS_TEST_URL=redis://127.0.0.1:6379/15 pnpm test
 * Use a dedicated DB index: the test flushes it.
 */
const url = process.env.REDIS_TEST_URL

describe.skipIf(!url)('otpStore (redis backend)', () => {
  let redis: Redis

  beforeAll(() => {
    redis = new Redis(url!)
    setRedisForTesting(redis)
  })

  afterAll(async () => {
    setRedisForTesting(undefined)
    await redis.flushdb()
    await redis.quit()
  })

  beforeEach(async () => {
    await redis.flushdb()
  })

  it('stores hashed codes with a TTL and verifies once', async () => {
    await storeOtpRecord('a@test.com', '123456', 'user-1', 'verification')
    const raw = await redis.get('otp:verification:a@test.com')
    expect(raw).not.toContain('123456')
    expect(await redis.pttl('otp:verification:a@test.com')).toBeGreaterThan(14 * 60 * 1000)

    expect(await verifyOtpRecord('A@test.com', '123456', 'verification')).toEqual({ valid: true, userId: 'user-1' })
    expect((await verifyOtpRecord('a@test.com', '123456', 'verification')).valid).toBe(false)
  })

  it('enforces the attempt cap', async () => {
    await storeOtpRecord('a@test.com', '123456', 'user-1', 'verification')
    for (let i = 0; i < OTP_MAX_ATTEMPTS; i++) {
      await verifyOtpRecord('a@test.com', '000000', 'verification')
    }
    expect((await verifyOtpRecord('a@test.com', '123456', 'verification')).valid).toBe(false)
  })

  it('only one of several concurrent correct verifications succeeds', async () => {
    await storeOtpRecord('a@test.com', '123456', 'user-1', 'verification')
    const results = await Promise.all(
      Array.from({ length: 5 }, () => verifyOtpRecord('a@test.com', '123456', 'verification'))
    )
    expect(results.filter((r) => r.valid)).toHaveLength(1)
  })

  it('take() is single-use and incrWithTtl sets a TTL on first increment', async () => {
    await store.setWithTtl('t', 'v', 60_000)
    expect(await store.take('t')).toBe('v')
    expect(await store.take('t')).toBeNull()

    expect(await store.incrWithTtl('c', 60_000)).toBe(1)
    expect(await store.incrWithTtl('c', 60_000)).toBe(2)
    expect(await redis.pttl('c')).toBeGreaterThan(0)
  })
})
