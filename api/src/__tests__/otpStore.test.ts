import { describe, it, expect, beforeEach } from 'vitest'
import {
  generateOtpCode,
  storeOtpRecord,
  verifyOtpRecord,
  OTP_MAX_ATTEMPTS,
} from '../services/otpStore.js'
import { clearMemoryStoreForTesting } from '../services/ephemeralStore.js'
import { setRedisForTesting } from '../services/redis.js'

describe('otpStore (memory backend)', () => {
  beforeEach(() => {
    setRedisForTesting(null)
    clearMemoryStoreForTesting()
  })

  it('generates 6-digit codes', () => {
    for (let i = 0; i < 200; i++) {
      expect(generateOtpCode()).toMatch(/^[1-9]\d{5}$/)
    }
  })

  it('verifies the correct code exactly once and returns the userId', async () => {
    await storeOtpRecord('a@test.com', '123456', 'user-1', 'verification')
    expect(await verifyOtpRecord('a@test.com', '123456', 'verification')).toEqual({
      valid: true,
      userId: 'user-1',
    })
    expect((await verifyOtpRecord('a@test.com', '123456', 'verification')).valid).toBe(false)
  })

  it('rejects a wrong code without consuming the record', async () => {
    await storeOtpRecord('a@test.com', '123456', 'user-1', 'verification')
    expect((await verifyOtpRecord('a@test.com', '000000', 'verification')).valid).toBe(false)
    expect((await verifyOtpRecord('a@test.com', '123456', 'verification')).valid).toBe(true)
  })

  it('invalidates the code after too many wrong attempts', async () => {
    await storeOtpRecord('a@test.com', '123456', 'user-1', 'verification')
    for (let i = 0; i < OTP_MAX_ATTEMPTS; i++) {
      expect((await verifyOtpRecord('a@test.com', '000000', 'verification')).valid).toBe(false)
    }
    const blocked = await verifyOtpRecord('a@test.com', '123456', 'verification')
    expect(blocked.valid).toBe(false)
    expect(blocked.error).toMatch(/too many attempts/i)
    // Record is gone; even the right code fails now
    expect((await verifyOtpRecord('a@test.com', '123456', 'verification')).valid).toBe(false)
  })

  it('issuing a new code resets the attempt counter', async () => {
    await storeOtpRecord('a@test.com', '123456', 'user-1', 'verification')
    for (let i = 0; i < OTP_MAX_ATTEMPTS - 1; i++) {
      await verifyOtpRecord('a@test.com', '000000', 'verification')
    }
    await storeOtpRecord('a@test.com', '654321', 'user-1', 'verification')
    for (let i = 0; i < OTP_MAX_ATTEMPTS - 1; i++) {
      await verifyOtpRecord('a@test.com', '000000', 'verification')
    }
    expect((await verifyOtpRecord('a@test.com', '654321', 'verification')).valid).toBe(true)
  })

  it('treats email identifiers case-insensitively', async () => {
    await storeOtpRecord('User@Test.com', '123456', 'user-1', 'verification')
    expect((await verifyOtpRecord(' user@test.COM ', '123456', 'verification')).valid).toBe(true)
  })

  it('keeps purposes separate', async () => {
    await storeOtpRecord('a@test.com', '123456', 'user-1', 'verification')
    expect((await verifyOtpRecord('a@test.com', '123456', 'password_reset')).valid).toBe(false)
  })

  it('expires codes', async () => {
    await storeOtpRecord('a@test.com', '123456', 'user-1', 'verification', -1)
    expect((await verifyOtpRecord('a@test.com', '123456', 'verification')).valid).toBe(false)
  })
})
