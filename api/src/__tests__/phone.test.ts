import { describe, it, expect } from 'vitest'
import { normalizePhone, optionalPhoneSchema, phoneSchema } from '../utils/phone.js'

describe('normalizePhone', () => {
  it.each([
    ['+250788123456', '+250788123456'],
    ['+250 788 123 456', '+250788123456'],
    ['0788123456', '+250788123456'],
    ['0788-123-456', '+250788123456'],
    ['(0788) 123.456', '+250788123456'],
    ['250788123456', '+250788123456'],
    ['  +14155552671 ', '+14155552671'],
  ])('%s -> %s', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected)
  })

  it.each([
    '',
    '12',
    '788123456', // no leading 0 or country code
    '0688123456', // Rwandan mobiles start with 07
    '+0788123456', // country codes don't start with 0
    '+1234567', // too short
    '+1234567890123456', // too long (E.164 max is 15 digits)
    '07881234567', // 11 digits
    'phone',
  ])('rejects %j', (input) => {
    expect(normalizePhone(input)).toBeNull()
  })

  it('maps every spelling of one number to the same value', () => {
    const spellings = ['0788123456', '+250788123456', '250788123456', '+250 788-123-456']
    expect(new Set(spellings.map(normalizePhone))).toEqual(new Set(['+250788123456']))
  })
})

describe('phone schemas', () => {
  it('phoneSchema normalizes and rejects invalid numbers', () => {
    expect(phoneSchema.parse('0788123456')).toBe('+250788123456')
    expect(phoneSchema.safeParse('12').success).toBe(false)
  })

  it('optionalPhoneSchema: missing stays undefined, empty clears, invalid fails', () => {
    expect(optionalPhoneSchema.parse(undefined)).toBeUndefined()
    expect(optionalPhoneSchema.parse('  ')).toBeNull()
    expect(optionalPhoneSchema.parse('0788123456')).toBe('+250788123456')
    expect(optionalPhoneSchema.safeParse('12').success).toBe(false)
  })
})
