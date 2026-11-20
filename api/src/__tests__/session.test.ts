import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'

vi.mock('../prisma.js', () => ({
  prisma: {
    userAccount: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}))

import Fastify from 'fastify'
import jwt from '@fastify/jwt'
import cookie from '@fastify/cookie'
import { prisma } from '../prisma.js'
import { authenticateUser, getAuthenticatedUser } from '../utils/authMiddleware.js'
import { issueSession, SESSION_TTL_SECONDS } from '../utils/session.js'
import { getRequiredSecret } from '../utils/secrets.js'

const findUnique = vi.mocked(prisma.userAccount.findUnique)

function dbUser(overrides: Record<string, unknown> = {}) {
  return { id: 'user-1', email: 'u@test.com', role: 'citizen', tokenVersion: 3, ...overrides } as never
}

describe('session tokens', () => {
  const app = Fastify()

  beforeAll(async () => {
    await app.register(jwt, { secret: getRequiredSecret('JWT_SECRET') })
    await app.register(cookie, { secret: getRequiredSecret('COOKIE_SECRET') })
    app.get('/me', { preHandler: authenticateUser }, async (req) => getAuthenticatedUser(req))
    app.post('/login', async (_req, reply) => {
      const token = issueSession(reply, { id: 'user-1', email: 'u@test.com', role: 'citizen', tokenVersion: 3 })
      return { token }
    })
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(() => {
    findUnique.mockReset()
  })

  it('issues a token that expires after the session TTL and sets the cookie', async () => {
    const res = await app.inject({ method: 'POST', url: '/login' })
    const { token } = res.json() as { token: string }
    const decoded = app.jwt.decode<{ exp: number; iat: number; tv: number }>(token)!
    expect(decoded.tv).toBe(3)
    expect(decoded.exp - decoded.iat).toBe(SESSION_TTL_SECONDS)

    const setCookie = String(res.headers['set-cookie'])
    expect(setCookie).toContain('token=')
    expect(setCookie).toContain('HttpOnly')
    expect(setCookie).toContain(`Max-Age=${SESSION_TTL_SECONDS}`)
  })

  it('accepts a token whose tv matches the stored token_version', async () => {
    findUnique.mockResolvedValue(dbUser())
    const token = app.jwt.sign({ userId: 'user-1', email: 'u@test.com', role: 'citizen', tv: 3 })
    const res = await app.inject({ method: 'GET', url: '/me', headers: { authorization: `Bearer ${token}` } })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ userId: 'user-1', tv: 3 })
  })

  it('rejects a token after token_version was bumped (revoked)', async () => {
    findUnique.mockResolvedValue(dbUser({ tokenVersion: 4 }))
    const token = app.jwt.sign({ userId: 'user-1', email: 'u@test.com', role: 'citizen', tv: 3 })
    const res = await app.inject({ method: 'GET', url: '/me', headers: { authorization: `Bearer ${token}` } })
    expect(res.statusCode).toBe(401)
  })

  it('rejects legacy tokens without a tv claim', async () => {
    findUnique.mockResolvedValue(dbUser())
    const token = app.jwt.sign({ userId: 'user-1', email: 'u@test.com', role: 'citizen' } as never)
    const res = await app.inject({ method: 'GET', url: '/me', headers: { authorization: `Bearer ${token}` } })
    expect(res.statusCode).toBe(401)
    expect(findUnique).not.toHaveBeenCalled()
  })

  it('rejects an expired token', async () => {
    findUnique.mockResolvedValue(dbUser())
    const token = app.jwt.sign(
      { userId: 'user-1', email: 'u@test.com', role: 'citizen', tv: 3 },
      { expiresIn: 60 }
    )
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      vi.setSystemTime(Date.now() + 61_000)
      const res = await app.inject({ method: 'GET', url: '/me', headers: { authorization: `Bearer ${token}` } })
      expect(res.statusCode).toBe(401)
    } finally {
      vi.useRealTimers()
    }
  })

  it('rejects a token for a deleted user', async () => {
    findUnique.mockResolvedValue(null)
    const token = app.jwt.sign({ userId: 'user-1', email: 'u@test.com', role: 'citizen', tv: 3 })
    const res = await app.inject({ method: 'GET', url: '/me', headers: { authorization: `Bearer ${token}` } })
    expect(res.statusCode).toBe(401)
  })

  it('uses the role stored in the database, not the one in the token', async () => {
    findUnique.mockResolvedValue(dbUser({ role: 'citizen' }))
    const token = app.jwt.sign({ userId: 'user-1', email: 'u@test.com', role: 'admin', tv: 3 })
    const res = await app.inject({ method: 'GET', url: '/me', headers: { authorization: `Bearer ${token}` } })
    expect(res.json()).toMatchObject({ role: 'citizen' })
  })

  it('accepts the token from the cookie', async () => {
    findUnique.mockResolvedValue(dbUser())
    const token = app.jwt.sign({ userId: 'user-1', email: 'u@test.com', role: 'citizen', tv: 3 })
    const res = await app.inject({ method: 'GET', url: '/me', cookies: { token } })
    expect(res.statusCode).toBe(200)
  })
})
