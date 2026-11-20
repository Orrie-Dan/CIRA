import type { FastifyInstance, FastifyRequest } from 'fastify'
import { parseOrThrow } from '../utils/validation.js'
import { z } from 'zod'
import type { UserRole } from '@prisma/client'
import { prisma } from '../prisma.js'
import { registerSchema, loginSchema } from '../schemas.js'
import { ApiError } from '../utils/errors.js'
import { hashPassword, verifyPassword, normalizeEmail, JWTPayload } from '../utils/auth.js'
import { authenticateUser, requireAuthenticatedUser } from '../utils/authMiddleware.js'
import { issueSession, clearSessionCookie, revokeAllSessions } from '../utils/session.js'
import { limits } from '../utils/rateLimit.js'
import { userRepository } from '../repositories/index.js'
import { normalizePhone, phoneSchema, optionalPhoneSchema } from '../utils/phone.js'
import { assertPhoneAvailable, claimVerifiedPhone, isPhoneUniqueViolation, phoneInUseError } from '../services/phoneService.js'
import { logAuditEvent, AuditActions, ResourceTypes } from '../utils/auditLogger.js'
import {
  verifyGoogleToken,
  verifyAppleToken,
  findOrCreateOAuthUser,
} from '../utils/oauth.js'
import { generateOtpCode, storeOtpRecord, verifyOtpRecord } from '../utils/otp.js'
import { sendOTPViaEmail } from '../utils/email.js'
import { sendOTPViaSMS } from '../utils/sms.js'
import sharp from 'sharp'
import { uploadToCloudinary, deleteFromCloudinary, extractPublicId } from '../utils/cloudinary.js'

export async function authRoutes(app: FastifyInstance) {
  // Register new user
  app.post('/auth/register', { config: { rateLimit: limits.register } }, async (req: FastifyRequest, reply) => {
    const body = req.body as Record<string, unknown>
    app.log.info({ body: { ...body, password: body?.password ? '[HIDDEN]' : undefined } }, 'Registration request received:')
    
    const parsed = registerSchema.safeParse(req.body)
    if (!parsed.success) {
      app.log.warn(parsed.error.flatten(), 'Validation failed:')
      const fieldErrors: Record<string, string[]> = {}
      parsed.error.errors.forEach((err) => {
        const path = err.path.join('.')
        if (!fieldErrors[path]) {
          fieldErrors[path] = []
        }
        fieldErrors[path].push(err.message)
      })
      
      return reply.code(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Please check your information and try again.',
          details: {
            fieldErrors,
            formErrors: parsed.error.errors.map(e => e.message),
          },
          requestId: req.id,
        },
      })
    }

    try {
      // Check if user already exists
      const existingUser = await userRepository.findByEmail(parsed.data.email)

      if (existingUser) {
        return reply.code(409).send({
          error: {
            code: 'USER_ALREADY_EXISTS',
            message: 'A user with this email already exists',
            requestId: req.id,
          },
        })
      }

      if (parsed.data.phone) {
        await assertPhoneAvailable(parsed.data.phone)
      }

      // Hash password and create user (unverified initially)
      const passwordHash = await hashPassword(parsed.data.password)

      // Clean up optional fields - convert empty strings to null
      const userData: {
        email: string
        passwordHash: string
        fullName: string | null
        phone: string | null
        role: UserRole
        provider: null
        providerId: null
      } = {
        email: normalizeEmail(parsed.data.email),
        passwordHash: passwordHash,
        fullName: parsed.data.fullName && parsed.data.fullName.trim().length > 0 
          ? parsed.data.fullName.trim() 
          : null,
        phone: parsed.data.phone ?? null, // normalized by registerSchema
        role: 'citizen', // Default role for self-registration
        provider: null,
        providerId: null,
        // emailVerified and phoneVerified have defaults in the schema, so we don't need to set them
      }

      app.log.info({ ...userData, passwordHash: '[HIDDEN]' }, 'Creating user with data:')

      const user = await prisma.userAccount.create({
        data: userData,
        select: {
          id: true,
          email: true,
          fullName: true,
          phone: true,
          role: true,
          emailVerified: true,
          phoneVerified: true,
          createdAt: true,
        },
      })

      // Generate and send OTP
      const otp = generateOtpCode()
      await storeOtpRecord(user.email, otp, user.id, 'verification')

      // Always verify the email: it is the login identifier, and an SMS code
      // must never mark the email as verified.
      try {
        await sendOTPViaEmail(user.email, otp)
      } catch (error) {
        app.log.error(error, 'Failed to send OTP:')
        // Continue anyway - OTP is logged in development
      }

      // Log audit event
      await logAuditEvent({
        userId: user.id,
        action: AuditActions.USER_REGISTERED,
        resourceType: ResourceTypes.USER,
        resourceId: user.id,
        details: { email: user.email, role: user.role, requiresVerification: true },
      })

      // Return user without token - they need to verify OTP first
      return reply.code(201).send({
        user,
        requiresVerification: true,
        message: 'Account created. Please verify your email/phone with the OTP code sent to you.',
      })
    } catch (error: any) {
      app.log.error({
        name: error?.name,
        code: error?.code,
        message: error?.message,
        stack: error?.stack,
      }, 'Registration error:')

      if (error instanceof ApiError) throw error
      if (isPhoneUniqueViolation(error)) throw phoneInUseError()

      // Provide more specific error messages
      if (error.code === 'P2002') {
        // Prisma unique constraint violation
        return reply.code(409).send({
          error: {
            code: 'DUPLICATE_ENTRY',
            message: 'An account with this email already exists. Please use a different email or try logging in.',
            requestId: req.id,
          },
        })
      }
      
      if (error.code === 'P2003') {
        // Prisma foreign key constraint violation
        return reply.code(400).send({
          error: {
            code: 'INVALID_REFERENCE',
            message: 'Invalid data provided. Please check your information and try again.',
            requestId: req.id,
          },
        })
      }
      
      // Prisma validation errors
      if (error.name === 'PrismaClientValidationError' || error.message?.includes('Unknown argument')) {
        app.log.error({
          name: error.name,
          message: error.message,
          code: error.code,
        }, 'Prisma validation error:')
        return reply.code(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid data provided. Please check your information and try again.',
            details: {
              formErrors: [error.message || 'Invalid data format'],
            },
            requestId: req.id,
          },
        })
      }
      
      // Database connection errors
      if (error.code === 'ECONNREFUSED' || error.message?.includes('connect') || error.message?.includes('Connection')) {
        return reply.code(503).send({
          error: {
            code: 'DATABASE_ERROR',
            message: 'Database connection failed. Please try again later.',
            requestId: req.id,
          },
        })
      }
      
      // Extract safe error message - ensure it's always a string
      let errorMessage = 'Failed to create user account. Please try again.'
      
      if (error && typeof error.message === 'string' && error.message.length > 0) {
        // Only use error message if it's a reasonable string (not a stringified object)
        if (!error.message.includes('Object') && 
            !error.message.includes('Input') && 
            !error.message.includes('Prisma') &&
            !error.message.includes('CreateNested') &&
            error.message.length < 500) {
          errorMessage = error.message
        }
      }
      
      // In development, include more details
      const errorResponse: any = {
        error: {
          code: 'REGISTRATION_FAILED',
          message: errorMessage,
          requestId: req.id,
        },
      }
      
      if (process.env.NODE_ENV !== 'production') {
        errorResponse.error.debug = {
          name: error?.name,
          code: error?.code,
          message: error?.message?.substring(0, 200),
        }
      }
      
      return reply.code(500).send(errorResponse)
    }
  })

  // Login
  app.post('/auth/login', { config: { rateLimit: limits.login } }, async (req: FastifyRequest, reply) => {
    const input = parseOrThrow(loginSchema, req.body)

    try {
      // Find user by email
      const user = await userRepository.findByEmail(input.email)

      if (!user) {
        return reply.code(401).send({
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'Invalid email or password',
            requestId: req.id,
          },
        })
      }

      // Check if user has a password (not OAuth-only account)
      if (!user.passwordHash) {
        return reply.code(401).send({
          error: {
            code: 'OAUTH_ONLY_ACCOUNT',
            message: 'This account was created with social login. Please use social login to sign in.',
            requestId: req.id,
          },
        })
      }

      // Verify password
      const isValid = await verifyPassword(input.password, user.passwordHash)
      if (!isValid) {
        return reply.code(401).send({
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'Invalid email or password',
            requestId: req.id,
          },
        })
      }

      if (!user.emailVerified) {
        return reply.code(403).send({
          error: {
            code: 'EMAIL_NOT_VERIFIED',
            message: 'Please verify your email before logging in',
            requestId: req.id,
          },
        })
      }

      const token = issueSession(reply, user)

      // Log audit event
      await logAuditEvent({
        userId: user.id,
        action: AuditActions.USER_LOGIN,
        resourceType: ResourceTypes.USER,
        resourceId: user.id,
        details: { email: user.email },
      })

      return reply.send({
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          phone: user.phone,
          role: user.role,
          createdAt: user.createdAt,
        },
        token, // Also return token in response for frontend convenience
      })
    } catch (error) {
      app.log.error({ error, stack: error instanceof Error ? error.stack : undefined }, 'Login error')
      throw new ApiError(500, 'Failed to authenticate user', 'INTERNAL_ERROR')
    }
  })

  // Get current user
  app.get('/auth/me', { preHandler: authenticateUser }, async (req: FastifyRequest, reply) => {
    try {
      // JWT is verified by the decorator/middleware
      const user = await prisma.userAccount.findUnique({
        where: { id: (req.user as JWTPayload).userId },
        select: {
          id: true,
          email: true,
          fullName: true,
          phone: true,
          role: true,
          avatarUrl: true,
          createdAt: true,
        },
      })

      if (!user) {
        return reply.code(404).send({
          error: {
            code: 'USER_NOT_FOUND',
            message: 'User not found',
            requestId: req.id,
          },
        })
      }

      return reply.send({ user })
    } catch (error) {
      app.log.error(error, 'Get user error:')
      throw new ApiError(500, 'Failed to get user information', 'INTERNAL_ERROR')
    }
  })

  // Update profile
  app.put('/auth/profile', { preHandler: authenticateUser }, async (req: FastifyRequest, reply) => {
    const updateProfileSchema = z.object({
      fullName: z.string().min(1).max(255).optional(),
      phone: optionalPhoneSchema,
    })

    const input = parseOrThrow(updateProfileSchema, req.body)
    const userId = (req.user as JWTPayload).userId

    const updateData: { fullName?: string; phone?: string | null; phoneVerified?: boolean } = {}
    if (input.fullName !== undefined) {
      updateData.fullName = input.fullName
    }
    if (input.phone !== undefined) {
      const current = await prisma.userAccount.findUnique({ where: { id: userId }, select: { phone: true } })
      if (input.phone !== current?.phone) {
        if (input.phone) await assertPhoneAvailable(input.phone, userId)
        updateData.phone = input.phone
        // A new number has to be verified again (POST /auth/phone/verify).
        updateData.phoneVerified = false
      }
    }

    try {
      const user = await prisma.userAccount.update({
        where: { id: userId },
        data: updateData,
        select: {
          id: true,
          email: true,
          fullName: true,
          phone: true,
          phoneVerified: true,
          role: true,
          avatarUrl: true,
          createdAt: true,
        },
      })

      // Log audit event
      await logAuditEvent({
        userId: user.id,
        action: AuditActions.USER_PROFILE_UPDATED,
        resourceType: ResourceTypes.USER,
        resourceId: user.id,
        details: { updatedFields: Object.keys(updateData) },
      })

      return reply.send({ user })
    } catch (error) {
      if (isPhoneUniqueViolation(error)) throw phoneInUseError()
      app.log.error(error, 'Update profile error:')
      throw new ApiError(500, 'Failed to update profile', 'UPDATE_FAILED')
    }
  })

  // Upload avatar
  app.put('/auth/profile/avatar', { preHandler: authenticateUser }, async (req: FastifyRequest, reply) => {
    try {
      const userId = (req.user as JWTPayload).userId
      
      const data = await req.file()
      if (!data) {
        return reply.code(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'No file uploaded',
            requestId: req.id,
          },
        })
      }

      // Validate file type (JPEG/PNG only)
      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png']
      if (!data.mimetype || !allowedTypes.includes(data.mimetype)) {
        return reply.code(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid file type. Only JPEG and PNG images are allowed.',
            requestId: req.id,
          },
        })
      }

      // Validate file size (max 2MB)
      const maxSize = 2 * 1024 * 1024 // 2MB
      const buffer = await data.toBuffer()
      if (buffer.length > maxSize) {
        return reply.code(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'File too large. Maximum size is 2MB.',
            requestId: req.id,
          },
        })
      }

      // Resize image to 200x200px using sharp
      const resizedBuffer = await sharp(buffer)
        .resize(200, 200, {
          fit: 'cover',
          position: 'center',
        })
        .jpeg({ quality: 85 })
        .toBuffer()

      // Delete old avatar from Cloudinary if exists
      const user = await prisma.userAccount.findUnique({
        where: { id: userId },
        select: { avatarUrl: true },
      })

      if (user?.avatarUrl) {
        const oldPublicId = extractPublicId(user.avatarUrl)
        if (oldPublicId) {
          try {
            await deleteFromCloudinary(oldPublicId)
          } catch (err) {
            app.log.warn(err, 'Failed to delete old avatar from Cloudinary')
          }
        }
      }

      // Upload to Cloudinary
      const uploadResult = await uploadToCloudinary(resizedBuffer, 'avatars', {
        resource_type: 'image',
        transformation: [
          { width: 200, height: 200, crop: 'fill', gravity: 'face' },
          { quality: 'auto' },
          { fetch_format: 'auto' },
        ],
      })

      // Update user avatar URL in database
      const updatedUser = await prisma.userAccount.update({
        where: { id: userId },
        data: {
          avatarUrl: uploadResult.secure_url, // Use secure_url (HTTPS)
        },
        select: {
          id: true,
          email: true,
          fullName: true,
          phone: true,
          role: true,
          avatarUrl: true,
          createdAt: true,
        },
      })

      // Log audit event
      await logAuditEvent({
        userId: updatedUser.id,
        action: AuditActions.USER_PROFILE_UPDATED,
        resourceType: ResourceTypes.USER,
        resourceId: updatedUser.id,
        details: { updatedFields: ['avatarUrl'] },
      })

      return reply.send({ user: updatedUser })
    } catch (error) {
      app.log.error(error, 'Avatar upload error:')
      throw new ApiError(500, 'Failed to upload avatar', 'UPLOAD_FAILED')
    }
  })

  // Get user preferences
  app.get('/auth/preferences', { preHandler: authenticateUser }, async (req: FastifyRequest, reply) => {
    try {
      const userId = (req.user as JWTPayload).userId
      
      let preferences = await prisma.userPreferences.findUnique({
        where: { userId },
      })

      // Create default preferences if they don't exist
      if (!preferences) {
        preferences = await prisma.userPreferences.create({
          data: {
            userId,
            emailNotifications: true,
            pushNotifications: true,
            nearbyAlerts: true,
            language: 'en',
          },
        })
      }

      return reply.send({ preferences })
    } catch (error) {
      app.log.error(error, 'Get preferences error:')
      throw new ApiError(500, 'Failed to get preferences', 'FETCH_FAILED')
    }
  })

  // Update user preferences
  app.put('/auth/preferences', { preHandler: authenticateUser }, async (req: FastifyRequest, reply) => {
    const updatePreferencesSchema = z.object({
      emailNotifications: z.boolean().optional(),
      pushNotifications: z.boolean().optional(),
      nearbyAlerts: z.boolean().optional(),
      language: z.enum(['en', 'rw']).optional(),
    })

    const input = parseOrThrow(updatePreferencesSchema, req.body)

    try {
      const userId = (req.user as JWTPayload).userId
      
      const preferences = await prisma.userPreferences.upsert({
        where: { userId },
        update: {
          ...(input.emailNotifications !== undefined && { emailNotifications: input.emailNotifications }),
          ...(input.pushNotifications !== undefined && { pushNotifications: input.pushNotifications }),
          ...(input.nearbyAlerts !== undefined && { nearbyAlerts: input.nearbyAlerts }),
          ...(input.language !== undefined && { language: input.language }),
        },
        create: {
          userId,
          emailNotifications: input.emailNotifications ?? true,
          pushNotifications: input.pushNotifications ?? true,
          nearbyAlerts: input.nearbyAlerts ?? true,
          language: input.language ?? 'en',
        },
      })

      return reply.send({ preferences })
    } catch (error) {
      app.log.error(error, 'Update preferences error:')
      throw new ApiError(500, 'Failed to update preferences', 'UPDATE_FAILED')
    }
  })

  // Logout
  app.post('/auth/logout', async (_req: FastifyRequest, reply) => {
    clearSessionCookie(reply)
    return reply.send({ message: 'Logged out successfully' })
  })

  // Logout from every device: invalidates all JWTs issued to this user
  app.post('/auth/logout-all', { preHandler: authenticateUser }, async (req: FastifyRequest, reply) => {
    const userId = (req.user as JWTPayload).userId
    await revokeAllSessions(userId)
    clearSessionCookie(reply)

    await logAuditEvent({
      userId,
      action: AuditActions.USER_LOGOUT_ALL,
      resourceType: ResourceTypes.USER,
      resourceId: userId,
    })

    return reply.send({ message: 'Logged out from all devices' })
  })

  // Google OAuth login
  app.post('/auth/google', { config: { rateLimit: limits.oauth } }, async (req: FastifyRequest, reply) => {
    const googleLoginSchema = z.object({
      idToken: z.string().min(1),
    })

    const input = parseOrThrow(googleLoginSchema, req.body)

    try {
      // Verify Google token and get user info
      const googleUser = await verifyGoogleToken(input.idToken)

      if (!googleUser.verified_email) {
        return reply.code(400).send({
          error: {
            code: 'EMAIL_NOT_VERIFIED',
            message: 'Google email is not verified',
            requestId: req.id,
          },
        })
      }

      // Find or create user
      const user = await findOrCreateOAuthUser(
        'google',
        googleUser.id,
        googleUser.email,
        googleUser.name,
        googleUser.picture
      )

      const token = issueSession(reply, user)

      // Log audit event
      await logAuditEvent({
        userId: user.id,
        action: AuditActions.USER_LOGIN,
        resourceType: ResourceTypes.USER,
        resourceId: user.id,
        details: { email: user.email, provider: 'google' },
      })

      return reply.send({
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          phone: user.phone,
          role: user.role,
          createdAt: user.createdAt,
        },
        token,
      })
    } catch (error: any) {
      app.log.error(error, 'Google OAuth error:')
      return reply.code(401).send({
        error: {
          code: 'OAUTH_ERROR',
          message: error.message || 'Failed to authenticate with Google',
          requestId: req.id,
        },
      })
    }
  })

  // Apple OAuth login
  app.post('/auth/apple', { config: { rateLimit: limits.oauth } }, async (req: FastifyRequest, reply) => {
    const appleLoginSchema = z.object({
      idToken: z.string().min(1),
      fullName: z
        .object({
          givenName: z.string().optional(),
          familyName: z.string().optional(),
        })
        .optional(),
    })

    const input = parseOrThrow(appleLoginSchema, req.body)

    try {
      // Verify Apple token and get user info
      const appleUser = await verifyAppleToken(input.idToken)

      if (!appleUser.email_verified) {
        return reply.code(400).send({
          error: {
            code: 'EMAIL_NOT_VERIFIED',
            message: 'Apple email is not verified',
            requestId: req.id,
          },
        })
      }

      // Construct full name from Apple response or request
      let fullName: string | undefined
      if (input.fullName) {
        const parts = [
          input.fullName.givenName,
          input.fullName.familyName,
        ].filter(Boolean)
        fullName = parts.length > 0 ? parts.join(' ') : undefined
      } else if (appleUser.name) {
        const parts = [
          appleUser.name.firstName,
          appleUser.name.lastName,
        ].filter(Boolean)
        fullName = parts.length > 0 ? parts.join(' ') : undefined
      }

      // Find or create user
      const user = await findOrCreateOAuthUser(
        'apple',
        appleUser.sub,
        appleUser.email,
        fullName
      )

      const token = issueSession(reply, user)

      // Log audit event
      await logAuditEvent({
        userId: user.id,
        action: AuditActions.USER_LOGIN,
        resourceType: ResourceTypes.USER,
        resourceId: user.id,
        details: { email: user.email, provider: 'apple' },
      })

      return reply.send({
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          phone: user.phone,
          role: user.role,
          createdAt: user.createdAt,
        },
        token,
      })
    } catch (error: any) {
      app.log.error(error, 'Apple OAuth error:')
      return reply.code(401).send({
        error: {
          code: 'OAUTH_ERROR',
          message: error.message || 'Failed to authenticate with Apple',
          requestId: req.id,
        },
      })
    }
  })

  // Send OTP for verification
  app.post('/auth/send-otp', { config: { rateLimit: limits.sendCode } }, async (req: FastifyRequest, reply) => {
    const sendOTPSchema = z.object({
      email: z.string().trim().toLowerCase().email().optional(),
      phone: z.string().trim().optional(),
    })

    const input = parseOrThrow(sendOTPSchema, req.body)

    if (!input.email && !input.phone) {
      return reply.code(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Either email or phone must be provided',
          requestId: req.id,
        },
      })
    }

    try {
      // Email wins when both are given (the mobile verify screen sends both).
      // A phone code is a login, so it only goes to a number the account holder
      // verified while signed in; unknown, unverified or malformed numbers get
      // the same answer as a missing account.
      const phone = input.email ? null : normalizePhone(input.phone!)
      const identifier = input.email || phone
      const user = input.email
        ? await userRepository.findByEmail(input.email)
        : phone
          ? await prisma.userAccount.findFirst({ where: { phone, phoneVerified: true } })
          : null

      if (!user || !identifier) {
        // Don't reveal if user exists (security best practice)
        return reply.send({
          message: 'If an account exists, a verification code has been sent.',
        })
      }

      // Generate OTP
      const otp = generateOtpCode()
      await storeOtpRecord(identifier, otp, user.id, 'verification')

      // Deliver over the same channel the code is stored under: email when
      // an email is given (even if a phone is too), SMS only for phone-only.
      try {
        if (input.email) {
          await sendOTPViaEmail(identifier, otp)
        } else {
          await sendOTPViaSMS(identifier, otp)
        }
      } catch (error) {
        app.log.error(error, 'Failed to send OTP:')
        // Continue anyway
      }

      return reply.send({
        message: 'If an account exists, a verification code has been sent.',
      })
    } catch (error) {
      app.log.error(error, 'Send OTP error:')
      throw new ApiError(500, 'Failed to send verification code', 'SEND_OTP_FAILED')
    }
  })

  // Verify OTP
  app.post('/auth/verify-otp', { config: { rateLimit: limits.verifyCode } }, async (req: FastifyRequest, reply) => {
    const verifyOTPSchema = z.object({
      email: z.string().trim().toLowerCase().email().optional(),
      phone: z.string().trim().optional(),
      code: z.string().length(6),
    })

    const input = parseOrThrow(verifyOTPSchema, req.body)

    if (!input.email && !input.phone) {
      return reply.code(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Either email or phone must be provided',
          requestId: req.id,
        },
      })
    }

    try {
      const phone = input.email ? null : normalizePhone(input.phone!)
      const identifier = input.email || phone
      const verification = identifier
        ? await verifyOtpRecord(identifier, input.code, 'verification')
        : { valid: false as const, userId: undefined, error: undefined }

      if (!verification.valid) {
        return reply.code(400).send({
          error: {
            code: 'INVALID_OTP',
            message: verification.error || 'Invalid or expired verification code',
            requestId: req.id,
          },
        })
      }

      const userSelect = {
        id: true,
        email: true,
        fullName: true,
        phone: true,
        role: true,
        emailVerified: true,
        phoneVerified: true,
        createdAt: true,
        tokenVersion: true,
      } as const

      let account
      if (input.email) {
        // An email code verifies the email.
        account = await prisma.userAccount.update({
          where: { id: verification.userId! },
          data: { emailVerified: true },
          select: userSelect,
        })
        await logAuditEvent({
          userId: account.id,
          action: AuditActions.USER_PROFILE_UPDATED,
          resourceType: ResourceTypes.USER,
          resourceId: account.id,
          details: { verification: { emailVerified: true } },
        })
      } else {
        // A phone code is only a login, and only while the number is still this
        // account's verified number (it may have changed since the code was sent).
        // Numbers are verified while signed in: POST /auth/phone/verify.
        account = await prisma.userAccount.findFirst({
          where: { id: verification.userId!, phone: phone!, phoneVerified: true },
          select: userSelect,
        })
        if (!account) {
          return reply.code(400).send({
            error: { code: 'INVALID_OTP', message: 'Invalid or expired verification code', requestId: req.id },
          })
        }
      }

      const { tokenVersion, ...user } = account

      // Same rule as password login: no session until the email is verified
      // (a phone code alone does not prove ownership of the account email).
      if (!user.emailVerified) {
        return reply.send({ user, verified: true, requiresEmailVerification: true })
      }

      const token = issueSession(reply, { ...user, tokenVersion })

      return reply.send({
        user,
        token,
        verified: true,
      })
    } catch (error) {
      app.log.error(error, 'Verify OTP error:')
      throw new ApiError(500, 'Failed to verify code', 'VERIFY_OTP_FAILED')
    }
  })

  // Phone verification happens while signed in, so the code proves both that
  // the caller holds the number and that they own the account. Codes are keyed
  // per user and number, so two people verifying the same number can't
  // overwrite each other's code.
  const phoneCodeKey = (userId: string, phone: string) => `${userId}:${phone}`
  const phoneBodySchema = z.object({ phone: phoneSchema })

  app.post('/auth/phone/send-code', { preHandler: authenticateUser, config: { rateLimit: limits.sendCode } }, async (req: FastifyRequest, reply) => {
    const { phone } = parseOrThrow(phoneBodySchema, req.body)
    const { userId } = requireAuthenticatedUser(req)

    const holder = await prisma.userAccount.findUnique({ where: { phone }, select: { id: true, phoneVerified: true } })
    if (holder && holder.id === userId && holder.phoneVerified) {
      return reply.send({ message: 'This phone number is already verified.', alreadyVerified: true })
    }
    if (holder && holder.id !== userId && holder.phoneVerified) {
      throw phoneInUseError()
    }

    const otp = generateOtpCode()
    await storeOtpRecord(phoneCodeKey(userId, phone), otp, userId, 'phone_verification')
    try {
      await sendOTPViaSMS(phone, otp)
    } catch (error) {
      app.log.error(error, 'Failed to send phone verification code:')
    }

    return reply.send({ message: 'A verification code has been sent to this number.' })
  })

  app.post('/auth/phone/verify', { preHandler: authenticateUser, config: { rateLimit: limits.verifyCode } }, async (req: FastifyRequest, reply) => {
    const { phone, code } = parseOrThrow(phoneBodySchema.extend({ code: z.string().length(6) }), req.body)
    const { userId } = requireAuthenticatedUser(req)

    const verification = await verifyOtpRecord(phoneCodeKey(userId, phone), code, 'phone_verification')
    if (!verification.valid || verification.userId !== userId) {
      return reply.code(400).send({
        error: {
          code: 'INVALID_OTP',
          message: verification.error || 'Invalid or expired verification code',
          requestId: req.id,
        },
      })
    }

    const { user, releasedFromUserId } = await claimVerifiedPhone(userId, phone)

    await logAuditEvent({
      userId,
      action: AuditActions.USER_PROFILE_UPDATED,
      resourceType: ResourceTypes.USER,
      resourceId: userId,
      details: { verification: { phoneVerified: true }, ...(releasedFromUserId ? { phoneReleasedFromUserId: releasedFromUserId } : {}) },
    })

    return reply.send({ user, verified: true })
  })
}

