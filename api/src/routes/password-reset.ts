import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { prisma } from '../prisma.js'
import { ApiError } from '../utils/errors.js'
import { hashPassword } from '../utils/auth.js'
import { generateOtpCode, storeOtpRecord, verifyOtpRecord } from '../utils/otp.js'
import { sendPasswordResetEmail } from '../utils/email.js'
import { limits } from '../utils/rateLimit.js'
import { userRepository } from '../repositories/index.js'
import { logAuditEvent, AuditActions, ResourceTypes } from '../utils/auditLogger.js'

const GENERIC_REQUEST_MESSAGE =
  'If an account with that email exists, a password reset code has been sent.'

export async function passwordResetRoutes(app: FastifyInstance) {
  app.post(
    '/auth/password-reset/request',
    { config: { rateLimit: limits.sendCode } },
    async (req: FastifyRequest, reply) => {
      const requestResetSchema = z.object({
        email: z.string().trim().toLowerCase().email(),
      })

      const parsed = requestResetSchema.safeParse(req.body)
      if (!parsed.success) {
        return reply.code(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request data',
            details: parsed.error.flatten(),
            requestId: req.id,
          },
        })
      }

      try {
        const user = await userRepository.findByEmail(parsed.data.email)

        if (!user) {
          return reply.send({ message: GENERIC_REQUEST_MESSAGE })
        }

        const otp = generateOtpCode()
        await storeOtpRecord(user.email, otp, user.id, 'password_reset')

        // Not awaited: keeps response timing the same whether or not the
        // account exists. Delivery failures are logged.
        sendPasswordResetEmail(user.email, otp).catch((error) => {
          app.log.error({ err: error, userId: user.id }, 'Failed to send password reset email')
        })

        return reply.send({ message: GENERIC_REQUEST_MESSAGE })
      } catch (error) {
        app.log.error(error, 'Password reset request error:')
        throw new ApiError(500, 'Failed to process password reset request', 'RESET_REQUEST_FAILED')
      }
    }
  )

  app.post(
    '/auth/password-reset/verify',
    { config: { rateLimit: limits.verifyCode } },
    async (req: FastifyRequest, reply) => {
      const verifyResetSchema = z.object({
        email: z.string().trim().toLowerCase().email(),
        otp: z.string().length(6),
        newPassword: z.string().min(8).max(100),
      })

      const parsed = verifyResetSchema.safeParse(req.body)
      if (!parsed.success) {
        return reply.code(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request data',
            details: parsed.error.flatten(),
            requestId: req.id,
          },
        })
      }

      try {
        const verification = await verifyOtpRecord(
          parsed.data.email,
          parsed.data.otp,
          'password_reset'
        )

        if (!verification.valid || !verification.userId) {
          return reply.code(400).send({
            error: {
              code: 'INVALID_OTP',
              message: verification.error || 'Invalid or expired reset code',
              requestId: req.id,
            },
          })
        }

        const passwordHash = await hashPassword(parsed.data.newPassword)
        // The code proves control of the email, so mark it verified, and
        // revoke every session issued under the old password.
        await prisma.userAccount.update({
          where: { id: verification.userId },
          data: { passwordHash, emailVerified: true, tokenVersion: { increment: 1 } },
        })

        await logAuditEvent({
          userId: verification.userId,
          action: AuditActions.USER_PASSWORD_CHANGED,
          resourceType: ResourceTypes.USER,
          resourceId: verification.userId,
          details: { via: 'password_reset' },
        })

        return reply.send({
          message: 'Password has been reset successfully',
        })
      } catch (error) {
        app.log.error(error, 'Password reset verify error:')
        throw new ApiError(500, 'Failed to reset password', 'RESET_VERIFY_FAILED')
      }
    }
  )
}
