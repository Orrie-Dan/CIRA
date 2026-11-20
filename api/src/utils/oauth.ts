import { OAuth2Client } from 'google-auth-library'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import { prisma } from '../prisma.js'
import { userRepository } from '../repositories/index.js'
import { normalizeEmail } from './auth.js'

export interface GoogleUserInfo {
  id: string
  email: string
  verified_email: boolean
  name?: string
  picture?: string
}

export interface AppleUserInfo {
  sub: string
  email: string
  email_verified?: boolean
  name?: {
    firstName?: string
    lastName?: string
  }
}

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID)
const appleJwks = createRemoteJWKSet(
  new URL('https://appleid.apple.com/auth/keys')
)

export async function verifyGoogleToken(
  idToken: string
): Promise<GoogleUserInfo> {
  const clientId = process.env.GOOGLE_CLIENT_ID
  if (!clientId) {
    throw new Error('GOOGLE_CLIENT_ID is not configured')
  }

  const ticket = await googleClient.verifyIdToken({
    idToken,
    audience: clientId,
  })

  const payload = ticket.getPayload()
  if (!payload?.sub || !payload.email) {
    throw new Error('Invalid Google token payload')
  }

  return {
    id: payload.sub,
    email: payload.email,
    verified_email: payload.email_verified === true,
    name: payload.name,
    picture: payload.picture,
  }
}

export async function verifyAppleToken(
  idToken: string
): Promise<AppleUserInfo> {
  const clientId = process.env.APPLE_CLIENT_ID
  if (!clientId) {
    throw new Error('APPLE_CLIENT_ID is not configured')
  }

  const { payload } = await jwtVerify(idToken, appleJwks, {
    issuer: 'https://appleid.apple.com',
    audience: clientId,
  })

  if (!payload.sub || typeof payload.email !== 'string') {
    throw new Error('Invalid Apple token payload')
  }

  return {
    sub: payload.sub,
    email: payload.email,
    email_verified:
      payload.email_verified === true || payload.email_verified === 'true',
  }
}

/**
 * Find or create user from OAuth provider.
 *
 * Callers must only pass an email the provider has verified.
 *
 * Linking to an existing email account: if that account never verified its
 * email, whoever set its password (and phone) never proved they own the
 * address — it may be an attacker who pre-registered the victim's email.
 * In that case the provider sign-in takes the account over: the password
 * and phone are cleared and all existing sessions are revoked.
 */
export async function findOrCreateOAuthUser(
  provider: 'google' | 'apple',
  providerId: string,
  rawEmail: string,
  fullName?: string,
  picture?: string
) {
  const email = normalizeEmail(rawEmail)

  const existingUser = await prisma.userAccount.findFirst({
    where: {
      provider,
      providerId,
    },
  })

  if (existingUser) {
    return existingUser
  }

  const existingEmailUser = await userRepository.findByEmail(email)

  if (existingEmailUser) {
    if (existingEmailUser.emailVerified) {
      return await prisma.userAccount.update({
        where: { id: existingEmailUser.id },
        data: { provider, providerId },
      })
    }

    return await prisma.userAccount.update({
      where: { id: existingEmailUser.id },
      data: {
        provider,
        providerId,
        emailVerified: true,
        passwordHash: null,
        phone: null,
        phoneVerified: false,
        fullName: fullName || existingEmailUser.fullName,
        tokenVersion: { increment: 1 },
      },
    })
  }

  return await prisma.userAccount.create({
    data: {
      email,
      fullName: fullName || null,
      avatarUrl: picture || null,
      provider,
      providerId,
      role: 'citizen',
      passwordHash: null,
      emailVerified: true,
    },
  })
}
