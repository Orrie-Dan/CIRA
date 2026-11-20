type OtpPurpose = 'verification' | 'password_reset'

interface OtpRecord {
  code: string
  expiresAt: number
  userId?: string
  purpose: OtpPurpose
}

const memoryStore = new Map<string, OtpRecord>()

function buildKey(identifier: string, purpose: OtpPurpose): string {
  return `otp:${purpose}:${identifier}`
}

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

export async function storeOtpRecord(
  identifier: string,
  code: string,
  userId: string | undefined,
  purpose: OtpPurpose,
  expiresInMinutes = 15
): Promise<void> {
  const key = buildKey(identifier, purpose)
  const record: OtpRecord = {
    code,
    expiresAt: Date.now() + expiresInMinutes * 60 * 1000,
    userId,
    purpose,
  }

  const redis = await getRedisClient()
  if (redis) {
    try {
      await redis.connect()
      await redis.set(key, JSON.stringify(record), 'PX', expiresInMinutes * 60 * 1000)
      await redis.quit()
      return
    } catch {
      await redis.quit().catch(() => undefined)
    }
  }

  memoryStore.set(key, record)
}

export async function verifyOtpRecord(
  identifier: string,
  code: string,
  purpose: OtpPurpose
): Promise<{ valid: boolean; userId?: string; error?: string }> {
  const key = buildKey(identifier, purpose)

  const redis = await getRedisClient()
  if (redis) {
    try {
      await redis.connect()
      const raw = await redis.get(key)
      if (!raw) {
        await redis.quit()
        return { valid: false, error: 'OTP not found' }
      }

      const stored = JSON.parse(raw) as OtpRecord
      if (stored.code !== code) {
        await redis.quit()
        return { valid: false, error: 'Invalid OTP' }
      }

      await redis.del(key)
      await redis.quit()
      return { valid: true, userId: stored.userId }
    } catch {
      await redis.quit().catch(() => undefined)
    }
  }

  const stored = memoryStore.get(key)
  if (!stored) return { valid: false, error: 'OTP not found' }
  if (stored.expiresAt < Date.now()) {
    memoryStore.delete(key)
    return { valid: false, error: 'OTP expired' }
  }
  if (stored.code !== code) return { valid: false, error: 'Invalid OTP' }

  memoryStore.delete(key)
  return { valid: true, userId: stored.userId }
}

export async function cleanupExpiredOtps(): Promise<void> {
  const now = Date.now()
  for (const [key, value] of memoryStore.entries()) {
    if (value.expiresAt < now) memoryStore.delete(key)
  }
}

export function generateOtpCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

// Backward-compatible sync wrappers for existing callers
export function storeOTP(
  identifier: string,
  code: string,
  userId?: string,
  purpose: OtpPurpose = 'verification',
  expiresInMinutes = 15
): void {
  void storeOtpRecord(identifier, code, userId, purpose, expiresInMinutes)
}

export function verifyOTP(
  identifier: string,
  code: string,
  purpose: OtpPurpose = 'verification'
): { valid: boolean; userId?: string; error?: string } {
  // Sync path uses memory only; async routes should call verifyOtpRecord
  const key = buildKey(identifier, purpose)
  const stored = memoryStore.get(key)
  if (!stored) return { valid: false, error: 'OTP not found' }
  if (stored.expiresAt < Date.now()) {
    memoryStore.delete(key)
    return { valid: false, error: 'OTP expired' }
  }
  if (stored.code !== code) return { valid: false, error: 'Invalid OTP' }
  memoryStore.delete(key)
  return { valid: true, userId: stored.userId }
}

export function cleanupExpiredOTPs(): void {
  void cleanupExpiredOtps()
}

export function generateOTP(): string {
  return generateOtpCode()
}

export function getOTPRemainingTime(
  identifier: string,
  purpose: OtpPurpose = 'verification'
): number {
  const key = buildKey(identifier, purpose)
  const stored = memoryStore.get(key)
  if (!stored) return 0
  return Math.max(0, Math.floor((stored.expiresAt - Date.now()) / 1000))
}
