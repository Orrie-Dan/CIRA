import type { FastifyRequest, FastifyReply, preHandlerHookHandler } from 'fastify'
import { JWTPayload } from './auth.js'

// Extend Fastify JWT types to properly type the payload
declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JWTPayload
  }
}

type AuthenticatedRequest = FastifyRequest & {
  user?: JWTPayload
}

export function getAuthenticatedUser(request: FastifyRequest): JWTPayload | undefined {
  return (request as AuthenticatedRequest).user
}

function getUser(request: FastifyRequest): JWTPayload | undefined {
  return getAuthenticatedUser(request)
}

async function verifyTokenFromRequest(
  request: FastifyRequest
): Promise<JWTPayload | null> {
  let token = request.cookies.token

  if (!token) {
    const authHeader = request.headers.authorization
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.substring(7)
    }
  }

  if (!token) return null

  const originalToken = request.headers.authorization
  request.headers.authorization = `Bearer ${token}`

  try {
    const decoded = await request.jwtVerify<JWTPayload>()
    ;(request as AuthenticatedRequest).user = decoded
    return decoded
  } catch {
    return null
  } finally {
    request.headers.authorization = originalToken || undefined
  }
}

export async function authenticateUser(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const decoded = await verifyTokenFromRequest(request)
  if (!decoded) {
    return reply.code(401).send({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
        requestId: request.id,
      },
    })
  }
}

export async function optionalAuthenticate(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  await verifyTokenFromRequest(request)
}

export function requireRole(...roles: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const user = getUser(request)
    if (!user) {
      return reply.code(401).send({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
          requestId: request.id,
        },
      })
    }

    if (!roles.includes(user.role)) {
      return reply.code(403).send({
        error: {
          code: 'FORBIDDEN',
          message: 'Insufficient permissions',
          requestId: request.id,
        },
      })
    }
  }
}

export const staffAuth = {
  preHandler: [authenticateUser, requireRole('admin', 'officer')] as preHandlerHookHandler[],
}

export const adminAuth = {
  preHandler: [authenticateUser, requireRole('admin')] as preHandlerHookHandler[],
}

export const reportMutationAuth = {
  preHandler: [authenticateUser, requireRole('admin', 'officer')] as preHandlerHookHandler[],
}

