import { describe, it, expect } from 'vitest'
import { requireRole } from '../utils/authMiddleware.js'
import type { FastifyReply, FastifyRequest } from 'fastify'
import type { JWTPayload } from '../utils/auth.js'

function mockRequest(user?: JWTPayload): FastifyRequest {
  return { user, id: 'test-request-id' } as FastifyRequest
}

function mockReply() {
  const reply = {
    statusCode: 200,
    body: undefined as unknown,
    code(code: number) {
      this.statusCode = code
      return this
    },
    send(payload: unknown) {
      this.body = payload
      return this
    },
  }
  return reply as unknown as FastifyReply & { statusCode: number; body: unknown }
}

describe('requireRole', () => {
  it('returns 401 when user is missing', async () => {
    const handler = requireRole('admin')
    const reply = mockReply()
    await handler(mockRequest(), reply)
    expect(reply.statusCode).toBe(401)
  })

  it('returns 403 when role is not allowed', async () => {
    const handler = requireRole('admin')
    const reply = mockReply()
    await handler(
      mockRequest({ userId: '1', email: 'o@test.com', role: 'officer', tv: 0 }),
      reply
    )
    expect(reply.statusCode).toBe(403)
  })

  it('allows matching role', async () => {
    const handler = requireRole('admin', 'officer')
    const reply = mockReply()
    await handler(
      mockRequest({ userId: '1', email: 'a@test.com', role: 'admin', tv: 0 }),
      reply
    )
    expect(reply.statusCode).toBe(200)
    expect(reply.body).toBeUndefined()
  })
})
