import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'

vi.mock('../prisma.js', () => ({
  prisma: {
    report: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    userAccount: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    organization: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    reportAssignment: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
    },
    reportComment: {
      create: vi.fn(),
    },
    reportStatusHistory: {
      create: vi.fn(),
    },
    $transaction: vi.fn((fn: (tx: unknown) => unknown) => fn({})),
  },
}))

import Fastify from 'fastify'
import jwt from '@fastify/jwt'
import cookie from '@fastify/cookie'
import { adminRoutes } from '../routes/admin.js'
import { getRequiredSecret } from '../utils/secrets.js'

describe('admin route auth', () => {
  const app = Fastify()

  beforeAll(async () => {
    await app.register(jwt, { secret: getRequiredSecret('JWT_SECRET') })
    await app.register(cookie, { secret: getRequiredSecret('COOKIE_SECRET') })
    await app.register(adminRoutes)
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  it('rejects unauthenticated GET /admin/users', async () => {
    const response = await app.inject({ method: 'GET', url: '/admin/users' })
    expect(response.statusCode).toBe(401)
  })

  it('rejects officer token for GET /admin/users', async () => {
    const token = app.jwt.sign({
      userId: 'officer-1',
      email: 'officer@test.com',
      role: 'officer',
    })

    const response = await app.inject({
      method: 'GET',
      url: '/admin/users',
      headers: { authorization: `Bearer ${token}` },
    })

    expect(response.statusCode).toBe(403)
  })
})
