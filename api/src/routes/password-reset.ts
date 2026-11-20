import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { prisma } from '../prisma.js'
import { ApiError } from '../utils/errors.js'
import { hashPassword } from '../utils/auth.js'
import {
  generateOtpCode,
  storeOtpRecord,
  verifyOtpRecord,
  cleanupExpiredOtps,
} from '../services/otpStore.js'

export async function passwordResetRoutes(app: FastifyInstance) {
  app.post('/auth/password-reset/request', async (req: FastifyRequest, reply) => {
    const requestResetSchema = z.object({
      email: z.string().email(),
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
      await cleanupExpiredOtps()

      const user = await prisma.userAccount.findUnique({
        where: { email: parsed.data.email },
        select: { id: true, email: true },
      })

      if (!user) {
        return reply.send({
          message: 'If an account with that email exists, a password reset code has been sent.',
        })
      }

      const otp = generateOtpCode()
      await storeOtpRecord(parsed.data.email, otp, user.id, 'password_reset')

      return reply.send({
        message: 'If an account with that email exists, a password reset code has been sent.',
      })
    } catch (error) {
      app.log.error(error, 'Password reset request error:')
      throw new ApiError(500, 'Failed to process password reset request', 'RESET_REQUEST_FAILED')
    }
  })

  app.post('/auth/password-reset/verify', async (req: FastifyRequest, reply) => {
    const verifyResetSchema = z.object({
      email: z.string().email(),
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
      await cleanupExpiredOtps()

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
      await prisma.userAccount.update({
        where: { id: verification.userId },
        data: { passwordHash },
      })

      return reply.send({
        message: 'Password has been reset successfully',
      })
    } catch (error) {
      app.log.error(error, 'Password reset verify error:')
      throw new ApiError(500, 'Failed to reset password', 'RESET_VERIFY_FAILED')
    }
  })
}
