import { createHash, randomInt, timingSafeEqual } from 'crypto'
import * as store from './ephemeralStore.js'

export type OtpPurpose = 'verification' | 'password_reset'

export const OTP_TTL_MINUTES = 15
/** Wrong guesses allowed per issued code before it is invalidated. */
export const OTP_MAX_ATTEMPTS = 5

interface OtpRecord {
  codeHash: string
  userId?: string
}

export interface OtpVerifyResult {
  valid: boolean
  userId?: string
  error?: string
}

/** Emails are case-insensitive; phone numbers are compared without spaces. */
export function normalizeOtpIdentifier(identifier: string): string {
  const trimmed = identifier.trim()
  return trimmed.includes('@') ? trimmed.toLowerCase() : trimmed.replace(/\s+/g, '')
}

function recordKey(identifier: string, purpose: OtpPurpose): string {
  return `otp:${purpose}:${normalizeOtpIdentifier(identifier)}`
}

function attemptsKey(identifier: string, purpose: OtpPurpose): string {
  return `otp-attempts:${purpose}:${normalizeOtpIdentifier(identifier)}`
}

function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex')
}

function hashesMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'hex')
  const bufB = Buffer.from(b, 'hex')
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB)
}

/** Cryptographically random 6-digit code. */
export function generateOtpCode(): string {
  return randomInt(100000, 1000000).toString()
}

/**
 * Stores a code for the identifier, replacing any previous code and
 * resetting the attempt counter.
 */
export async function storeOtpRecord(
  identifier: string,
  code: string,
  userId: string | undefined,
  purpose: OtpPurpose,
  expiresInMinutes = OTP_TTL_MINUTES
): Promise<void> {
  const ttlMs = expiresInMinutes * 60 * 1000
  const record: OtpRecord = { codeHash: hashCode(code), userId }
  await store.del(attemptsKey(identifier, purpose))
  await store.setWithTtl(recordKey(identifier, purpose), JSON.stringify(record), ttlMs)
}

/**
 * Checks a code. Each call counts as an attempt; after OTP_MAX_ATTEMPTS
 * the code is invalidated. A correct code can be used exactly once.
 */
export async function verifyOtpRecord(
  identifier: string,
  code: string,
  purpose: OtpPurpose
): Promise<OtpVerifyResult> {
  const key = recordKey(identifier, purpose)
  const counterKey = attemptsKey(identifier, purpose)

  const raw = await store.get(key)
  if (!raw) return { valid: false, error: 'Invalid or expired code' }

  const attempts = await store.incrWithTtl(counterKey, OTP_TTL_MINUTES * 60 * 1000)
  if (attempts > OTP_MAX_ATTEMPTS) {
    await store.del(key, counterKey)
    return { valid: false, error: 'Too many attempts. Please request a new code.' }
  }

  const record = JSON.parse(raw) as OtpRecord
  if (!hashesMatch(record.codeHash, hashCode(code))) {
    return { valid: false, error: 'Invalid or expired code' }
  }

  // Single use: only the caller that actually deletes the record succeeds.
  const consumed = await store.del(key)
  await store.del(counterKey)
  if (!consumed) return { valid: false, error: 'Invalid or expired code' }

  return { valid: true, userId: record.userId }
}
