import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../prisma.js', () => ({
  prisma: {
    userAccount: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    auditLog: { create: vi.fn() },
  },
}))
vi.mock('../utils/email.js', () => ({
  sendOTPViaEmail: vi.fn(async () => undefined),
  sendPasswordResetEmail: vi.fn(async () => undefined),
}))
vi.mock('../utils/sms.js', () => ({ sendOTPViaSMS: vi.fn(async () => undefined) }))
vi.mock('../utils/auditLogger.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../utils/auditLogger.js')>()),
  logAuditEvent: vi.fn(async () => undefined),
}))

import Fastify, { type FastifyInstance } from 'fastify'
import jwt from '@fastify/jwt'
import cookie from '@fastify/cookie'
import { prisma } from '../prisma.js'
import { sendPasswordResetEmail, sendOTPViaEmail } from '../utils/email.js'
import { sendOTPViaSMS } from '../utils/sms.js'
import { authRoutes } from '../routes/auth.js'
import { passwordResetRoutes } from '../routes/password-reset.js'
import { notificationsRoutes } from '../routes/notifications.js'
import { registerRateLimit, parseTrustProxy, limits } from '../utils/rateLimit.js'
import { getRequiredSecret } from '../utils/secrets.js'
import { fastifyErrorHandler } from '../utils/errors.js'
import { setRedisForTesting } from '../services/redis.js'
import { clearMemoryStoreForTesting } from '../services/ephemeralStore.js'
import { storeOtpRecord } from '../services/otpStore.js'

const users = vi.mocked(prisma.userAccount)

async function buildApp(trustProxy: boolean | number | string = false): Promise<FastifyInstance> {
  const app = Fastify({ trustProxy })
  app.setErrorHandler(fastifyErrorHandler)
  await app.register(jwt, { secret: getRequiredSecret('JWT_SECRET') })
  await app.register(cookie, { secret: getRequiredSecret('COOKIE_SECRET') })
  await registerRateLimit(app)
  await app.register(authRoutes)
  await app.register(passwordResetRoutes)
  await app.register(notificationsRoutes)
  await app.ready()
  return app
}

const citizen = {
  id: 'user-1',
  email: 'user@test.com',
  role: 'citizen',
  tokenVersion: 0,
  emailVerified: true,
  passwordHash: '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva',
  fullName: null,
  phone: null,
  createdAt: new Date(),
}

describe('auth routes', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    vi.clearAllMocks()
    setRedisForTesting(null)
    clearMemoryStoreForTesting()
    users.findUnique.mockResolvedValue(null)
    users.findFirst.mockResolvedValue(null)
    app = await buildApp()
  })

  afterEach(async () => {
    await app.close()
  })

  it('rate limits /auth/login per client IP', async () => {
    const attempt = () =>
      app.inject({ method: 'POST', url: '/auth/login', payload: { email: 'x@test.com', password: 'nope' } })
    for (let i = 0; i < limits.login.max; i++) {
      expect((await attempt()).statusCode).toBe(401)
    }
    const blocked = await attempt()
    expect(blocked.statusCode).toBe(429)
    expect(blocked.json()).toMatchObject({
      error: { code: 'RATE_LIMIT_EXCEEDED', details: { retryAfter: expect.any(String) } },
    })
    expect(blocked.headers['retry-after']).toBeDefined()
  })

  it('does not trust X-Forwarded-For unless TRUST_PROXY is set', async () => {
    for (let i = 0; i < limits.sendCode.max; i++) {
      await app.inject({
        method: 'POST',
        url: '/auth/password-reset/request',
        payload: { email: 'x@test.com' },
        headers: { 'x-forwarded-for': `10.0.0.${i}` },
      })
    }
    const spoofed = await app.inject({
      method: 'POST',
      url: '/auth/password-reset/request',
      payload: { email: 'x@test.com' },
      headers: { 'x-forwarded-for': '10.0.0.99' },
    })
    expect(spoofed.statusCode).toBe(429)
  })

  it('keys on X-Forwarded-For when behind a trusted proxy', async () => {
    const proxied = await buildApp(parseTrustProxy('1'))
    try {
      for (let i = 0; i < limits.sendCode.max; i++) {
        await proxied.inject({
          method: 'POST',
          url: '/auth/password-reset/request',
          payload: { email: 'x@test.com' },
          headers: { 'x-forwarded-for': '10.0.0.1' },
        })
      }
      const otherClient = await proxied.inject({
        method: 'POST',
        url: '/auth/password-reset/request',
        payload: { email: 'x@test.com' },
        headers: { 'x-forwarded-for': '10.0.0.2' },
      })
      expect(otherClient.statusCode).toBe(200)
    } finally {
      await proxied.close()
    }
  })

  it('looks up login emails case-insensitively', async () => {
    await app.inject({ method: 'POST', url: '/auth/login', payload: { email: '  User@Test.COM ', password: 'x' } })
    expect(users.findUnique).toHaveBeenCalledWith({ where: { email: 'user@test.com' } })
  })

  it('password reset: emails the code, then resets the password and revokes sessions', async () => {
    users.findUnique.mockResolvedValue(citizen as never)
    const res = await app.inject({
      method: 'POST',
      url: '/auth/password-reset/request',
      payload: { email: 'User@Test.com' },
    })
    expect(res.statusCode).toBe(200)
    expect(sendPasswordResetEmail).toHaveBeenCalledTimes(1)
    const [to, code] = vi.mocked(sendPasswordResetEmail).mock.calls[0]
    expect(to).toBe('user@test.com')
    expect(res.body).not.toContain(code)

    const verify = await app.inject({
      method: 'POST',
      url: '/auth/password-reset/verify',
      payload: { email: 'user@test.com', otp: code, newPassword: 'new-password-123' },
    })
    expect(verify.statusCode).toBe(200)
    expect(users.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: expect.objectContaining({ tokenVersion: { increment: 1 }, emailVerified: true }),
    })
  })

  it('password reset request gives the same answer for unknown emails and sends nothing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/password-reset/request',
      payload: { email: 'nobody@test.com' },
    })
    expect(res.statusCode).toBe(200)
    expect(sendPasswordResetEmail).not.toHaveBeenCalled()
  })

  it('verify-otp uses the async store (works for codes stored via storeOtpRecord)', async () => {
    await storeOtpRecord('user@test.com', '123456', 'user-1', 'verification')
    users.update.mockResolvedValue(citizen as never)
    const res = await app.inject({
      method: 'POST',
      url: '/auth/verify-otp',
      payload: { email: 'User@test.com', code: '123456' },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { token: string; user: Record<string, unknown> }
    expect(app.jwt.decode<{ tv: number }>(body.token)!.tv).toBe(0)
    expect(body.user).not.toHaveProperty('tokenVersion')
  })

  describe('OTP channel binding (an SMS code must never verify the email)', () => {
    it('register sends the code to the email even when a phone is given', async () => {
      users.create.mockResolvedValue({ ...citizen, emailVerified: false } as never)
      const res = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: { email: 'User@Test.com', password: 'password-123', phone: '+250700000000' },
      })
      expect(res.statusCode).toBe(201)
      expect(users.create.mock.calls[0][0].data).toMatchObject({ email: 'user@test.com' })
      expect(sendOTPViaEmail).toHaveBeenCalledWith('user@test.com', expect.any(String))
      expect(sendOTPViaSMS).not.toHaveBeenCalled()
    })

    it('send-otp with email and phone emails the code', async () => {
      users.findUnique.mockResolvedValue(citizen as never)
      await app.inject({
        method: 'POST',
        url: '/auth/send-otp',
        payload: { email: 'user@test.com', phone: '+250700000000' },
      })
      expect(sendOTPViaEmail).toHaveBeenCalledTimes(1)
      expect(sendOTPViaSMS).not.toHaveBeenCalled()
    })

    it('verify-otp with email and phone marks only the email verified', async () => {
      await storeOtpRecord('user@test.com', '123456', 'user-1', 'verification')
      users.update.mockResolvedValue(citizen as never)
      await app.inject({
        method: 'POST',
        url: '/auth/verify-otp',
        payload: { email: 'user@test.com', phone: '+250700000000', code: '123456' },
      })
      expect(users.update.mock.calls[0][0].data).toEqual({ emailVerified: true })
    })

    it('a phone code never verifies a number: it fails unless the number is already verified', async () => {
      await storeOtpRecord('+250788123456', '123456', 'user-1', 'verification')
      users.findFirst.mockResolvedValue(null) // no account with this *verified* number
      const res = await app.inject({
        method: 'POST',
        url: '/auth/verify-otp',
        payload: { phone: '+250788123456', code: '123456' },
      })
      expect(res.statusCode).toBe(400)
      expect(res.json().error.code).toBe('INVALID_OTP')
      expect(users.findFirst.mock.calls[0][0]).toMatchObject({ where: { id: 'user-1', phone: '+250788123456', phoneVerified: true } })
      expect(users.update).not.toHaveBeenCalled()
      expect(res.headers['set-cookie']).toBeUndefined()
    })

    it('phone login with a verified number still gives no session while the email is unverified', async () => {
      await storeOtpRecord('+250788123456', '123456', 'user-1', 'verification')
      users.findFirst.mockResolvedValue({ ...citizen, emailVerified: false, phone: '+250788123456', phoneVerified: true } as never)
      const res = await app.inject({
        method: 'POST',
        url: '/auth/verify-otp',
        payload: { phone: '0788 123 456', code: '123456' },
      })
      expect(res.statusCode).toBe(200)
      const body = res.json() as Record<string, unknown>
      expect(body.token).toBeUndefined()
      expect(body.requiresEmailVerification).toBe(true)
      expect(res.headers['set-cookie']).toBeUndefined()
      expect(users.update).not.toHaveBeenCalled()
    })
  })

  describe('phone OTP login lookup', () => {
    it('only sends a code to a verified number, looked up in normalized form', async () => {
      const res = await app.inject({ method: 'POST', url: '/auth/send-otp', payload: { phone: '0788-123-456' } })
      expect(res.statusCode).toBe(200)
      expect(users.findFirst.mock.calls[0][0]).toEqual({ where: { phone: '+250788123456', phoneVerified: true } })
      expect(sendOTPViaSMS).not.toHaveBeenCalled()
    })

    it('texts the code when the number is verified', async () => {
      users.findFirst.mockResolvedValue({ ...citizen, phone: '+250788123456', phoneVerified: true } as never)
      await app.inject({ method: 'POST', url: '/auth/send-otp', payload: { phone: '+250 788 123 456' } })
      expect(sendOTPViaSMS).toHaveBeenCalledWith('+250788123456', expect.any(String))
    })

    it('answers a malformed number like a missing account, without a lookup', async () => {
      const res = await app.inject({ method: 'POST', url: '/auth/send-otp', payload: { phone: '12' } })
      expect(res.statusCode).toBe(200)
      expect(res.json().message).toMatch(/If an account exists/)
      expect(users.findFirst).not.toHaveBeenCalled()
    })
  })

  describe('phone verification endpoints', () => {
    it('require a session', async () => {
      for (const url of ['/auth/phone/send-code', '/auth/phone/verify']) {
        const res = await app.inject({ method: 'POST', url, payload: { phone: '+250788123456', code: '123456' } })
        expect(res.statusCode).toBe(401)
      }
    })

    it('reject a malformed number with 400', async () => {
      users.findUnique.mockResolvedValue(citizen as never)
      const token = app.jwt.sign({ userId: 'user-1', email: 'user@test.com', role: 'citizen', tv: 0 })
      const res = await app.inject({
        method: 'POST',
        url: '/auth/phone/send-code',
        headers: { authorization: `Bearer ${token}` },
        payload: { phone: 'not-a-number' },
      })
      expect(res.statusCode).toBe(400)
      expect(sendOTPViaSMS).not.toHaveBeenCalled()
    })
  })

  it('logout-all bumps token_version', async () => {
    users.findUnique.mockResolvedValue(citizen as never)
    const token = app.jwt.sign({ userId: 'user-1', email: 'user@test.com', role: 'citizen', tv: 0 })
    const res = await app.inject({
      method: 'POST',
      url: '/auth/logout-all',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
    expect(users.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { tokenVersion: { increment: 1 } },
    })
  })

  describe('SSE tickets', () => {
    it('requires auth to get a ticket', async () => {
      const res = await app.inject({ method: 'POST', url: '/notifications/stream-ticket' })
      expect(res.statusCode).toBe(401)
    })

    it('rejects the old ?token= query parameter', async () => {
      users.findUnique.mockResolvedValue(citizen as never)
      const token = app.jwt.sign({ userId: 'user-1', email: 'user@test.com', role: 'citizen', tv: 0 })
      const res = await app.inject({ method: 'GET', url: `/notifications/stream?token=${token}` })
      expect(res.statusCode).toBe(401)
    })

    it('a ticket opens the stream once and cannot be reused', async () => {
      users.findUnique.mockResolvedValue(citizen as never)
      const token = app.jwt.sign({ userId: 'user-1', email: 'user@test.com', role: 'citizen', tv: 0 })
      const ticketRes = await app.inject({
        method: 'POST',
        url: '/notifications/stream-ticket',
        headers: { authorization: `Bearer ${token}` },
      })
      expect(ticketRes.statusCode).toBe(200)
      const { ticket } = ticketRes.json() as { ticket: string }
      expect(ticket).not.toContain('.') // not a JWT

      await app.listen({ port: 0, host: '127.0.0.1' })
      const address = app.server.address() as { port: number }
      const base = `http://127.0.0.1:${address.port}/notifications/stream?ticket=${encodeURIComponent(ticket)}`

      const controller = new AbortController()
      const first = await fetch(base, { signal: controller.signal })
      expect(first.status).toBe(200)
      expect(first.headers.get('content-type')).toContain('text/event-stream')
      controller.abort()

      const second = await fetch(base)
      expect(second.status).toBe(401)
    })
  })
})
