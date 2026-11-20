import type { FastifyInstance, FastifyRequest, FastifyReply, preHandlerHookHandler } from 'fastify'
import { JWTPayload } from './auth.js'
import { prisma } from '../prisma.js'

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

/**
 * Verifies a session JWT (signature + expiry) and checks it against the
 * user's current token_version. Returns the payload with the role and
 * email as currently stored, so demotions take effect immediately.
 */
export async function verifySessionToken(
  app: FastifyInstance,
  token: string
): Promise<JWTPayload | null> {
  let decoded: JWTPayload
  try {
    decoded = app.jwt.verify<JWTPayload>(token)
  } catch {
    return null
  }

  // Tokens issued before token versioning have no "tv" and never expired.
  if (typeof decoded.tv !== 'number' || typeof decoded.userId !== 'string') return null

  const user = await prisma.userAccount.findUnique({
    where: { id: decoded.userId },
    select: { id: true, email: true, role: true, tokenVersion: true },
  })
  if (!user || user.tokenVersion !== decoded.tv) return null

  return { userId: user.id, email: user.email, role: user.role, tv: user.tokenVersion }
}

function getTokenFromRequest(request: FastifyRequest): string | undefined {
  const authHeader = request.headers.authorization
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.substring(7)
  }
  return request.cookies?.token || undefined
}

async function verifyTokenFromRequest(
  request: FastifyRequest
): Promise<JWTPayload | null> {
  const token = getTokenFromRequest(request)
  if (!token) return null

  const user = await verifySessionToken(request.server, token)
  if (user) {
    ;(request as AuthenticatedRequest).user = user
  }
  return user
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

