import type { FastifyReply } from 'fastify'
import type { JWTPayload } from './auth.js'
import { prisma } from '../prisma.js'
import { closeUserStreams } from '../services/sseConnections.js'

/** Lifetime of an issued JWT and its cookie. */
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7 // 7 days

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
}

export interface SessionUser {
  id: string
  email: string
  role: string
  tokenVersion: number
}

/**
 * Signs a JWT for the user, sets it as the HTTP-only `token` cookie and
 * returns it (web/mobile clients also send it as a Bearer header).
 */
export function issueSession(reply: FastifyReply, user: SessionUser): string {
  const payload: JWTPayload = {
    userId: user.id,
    email: user.email,
    role: user.role,
    tv: user.tokenVersion,
  }
  const token = reply.server.jwt.sign(payload, { expiresIn: SESSION_TTL_SECONDS })

  reply.setCookie('token', token, { ...cookieOptions, maxAge: SESSION_TTL_SECONDS })
  return token
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie('token', cookieOptions)
}

/** Invalidates every JWT issued to the user so far, and closes their open notification streams. */
export async function revokeAllSessions(userId: string): Promise<void> {
  await prisma.userAccount.update({
    where: { id: userId },
    data: { tokenVersion: { increment: 1 } },
  })
  closeUserStreams(userId)
}
