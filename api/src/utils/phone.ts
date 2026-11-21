import { z } from 'zod'

/**
 * Normalizes a phone number to E.164 so the same number is always stored and
 * looked up the same way (phone numbers are unique per account).
 *
 * Accepts international numbers (`+` and 8-15 digits) and Rwandan numbers
 * without the `+` (`07XXXXXXXX`, `2507XXXXXXXX`), which become `+2507XXXXXXXX`.
 * Spaces, dashes, dots and parentheses are ignored. Returns null for anything else.
 */
export function normalizePhone(raw: string): string | null {
  const compact = raw.trim().replace(/[\s\-().]/g, '')
  if (/^\+[1-9]\d{7,14}$/.test(compact)) return compact
  if (/^07\d{8}$/.test(compact)) return `+250${compact.slice(1)}`
  if (/^2507\d{8}$/.test(compact)) return `+${compact}`
  return null
}

const INVALID_PHONE_MESSAGE = 'Enter a valid phone number, e.g. 0788123456 or +250788123456'

/** Required phone number, normalized to E.164. */
export const phoneSchema = z.string().transform((value, ctx) => {
  const normalized = normalizePhone(value)
  if (!normalized) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: INVALID_PHONE_MESSAGE })
    return z.NEVER
  }
  return normalized
})

/**
 * Optional phone number for profile-style fields: missing stays undefined,
 * an empty string means "no phone" (null), anything else is normalized.
 */
export const optionalPhoneSchema = z
  .string()
  .optional()
  .transform((value, ctx) => {
    if (value === undefined) return undefined
    if (value.trim() === '') return null
    const normalized = normalizePhone(value)
    if (!normalized) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: INVALID_PHONE_MESSAGE })
      return z.NEVER
    }
    return normalized
  })
