import type { FastifyInstance, FastifyRequest } from 'fastify'
import { assertUuid } from '../utils/validation.js'
import { z } from 'zod'
import {
  getUserNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
} from '../utils/notifications.js'
import { registerDeviceToken, unregisterDeviceToken } from '../utils/pushNotifications.js'
import { ApiError } from '../utils/errors.js'
import { authenticateUser, optionalAuthenticate, getAuthenticatedUser } from '../utils/authMiddleware.js'
import { limits } from '../utils/rateLimit.js'
import { randomBytes } from 'crypto'
import * as ephemeralStore from '../services/ephemeralStore.js'
import { zodToJsonSchemaFastify } from '../utils/swagger.js'
import type { JWTPayload } from '../utils/auth.js'

const SSE_TICKET_TTL_SECONDS = 60
const sseTicketKey = (ticket: string) => `sse-ticket:${ticket}`

// Store SSE connections per user
const sseConnections = new Map<string, Set<{ send: (data: string) => void; close: () => void }>>()

export async function notificationsRoutes(app: FastifyInstance) {
  // Register device token for push notifications
  app.post('/notifications/register-device', {
    schema: {
      description: 'Register device token for push notifications',
      tags: ['notifications'],
      body: zodToJsonSchemaFastify(
        z.object({
          token: z.string(),
          platform: z.enum(['ios', 'android', 'web']),
        })
      ),
    },
  }, async (req: FastifyRequest, reply) => {
    await authenticateUser(req, reply)
    const user = req.user as JWTPayload | undefined
    if (!user) {
      return
    }

    const parsed = z
      .object({
        token: z.string(),
        platform: z.enum(['ios', 'android', 'web']),
      })
      .safeParse(req.body)

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
      await registerDeviceToken(user.userId, parsed.data.token, parsed.data.platform)
      return reply.send({ success: true })
    } catch (error) {
      app.log.error(error, 'Failed to register device token')
      throw new ApiError(500, 'Failed to register device token', 'REGISTER_FAILED')
    }
  })

  // Unregister device token
  app.post('/notifications/unregister-device', {
    schema: {
      description: 'Unregister device token',
      tags: ['notifications'],
      body: zodToJsonSchemaFastify(
        z.object({
          token: z.string(),
        })
      ),
    },
  }, async (req: FastifyRequest, reply) => {
    await authenticateUser(req, reply)
    if (!req.user) {
      return
    }

    const parsed = z
      .object({
        token: z.string(),
      })
      .safeParse(req.body)

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
      const userId = (req.user as { userId: string }).userId
      await unregisterDeviceToken(parsed.data.token, userId)
      return reply.send({ success: true })
    } catch (error) {
      app.log.error(error, 'Failed to unregister device token')
      throw new ApiError(500, 'Failed to unregister device token', 'UNREGISTER_FAILED')
    }
  })

  // Get notifications
  app.get('/notifications', {
    schema: {
      description: 'Get user notifications',
      tags: ['notifications'],
      querystring: zodToJsonSchemaFastify(
        z.object({
          limit: z.coerce.number().int().min(1).max(100).optional().default(50),
          offset: z.coerce.number().int().min(0).optional().default(0),
          unreadOnly: z.coerce.boolean().optional(),
        })
      ),
    },
  }, async (req: FastifyRequest, reply) => {
    await authenticateUser(req, reply)
    const user = req.user as JWTPayload | undefined
    if (!user) {
      return
    }

    const parsed = z
      .object({
        limit: z.coerce.number().int().min(1).max(100).optional().default(50),
        offset: z.coerce.number().int().min(0).optional().default(0),
        unreadOnly: z.coerce.boolean().optional(),
      })
      .safeParse(req.query)

    if (!parsed.success) {
      return reply.code(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid query parameters',
          details: parsed.error.flatten(),
          requestId: req.id,
        },
      })
    }

    try {
      const { notifications, total } = await getUserNotifications(user.userId, {
        limit: parsed.data.limit,
        offset: parsed.data.offset,
        unreadOnly: parsed.data.unreadOnly,
      })

      return reply.send({
        data: notifications.map((n) => ({
          id: n.id,
          type: n.type,
          title: n.title,
          body: n.body,
          data: n.data,
          read: n.read,
          createdAt: n.createdAt.toISOString(),
        })),
        meta: {
          total,
          limit: parsed.data.limit,
          offset: parsed.data.offset,
        },
      })
    } catch (error) {
      app.log.error(error, 'Failed to fetch notifications')
      throw new ApiError(500, 'Failed to fetch notifications', 'FETCH_FAILED')
    }
  })

  // Get unread count
  app.get('/notifications/unread-count', {
    schema: {
      description: 'Get unread notification count',
      tags: ['notifications'],
    },
  }, async (req: FastifyRequest, reply) => {
    await authenticateUser(req, reply)
    const user = req.user as JWTPayload | undefined
    if (!user) {
      return
    }

    try {
      const count = await getUnreadCount(user.userId)
      return reply.send({ count })
    } catch (error) {
      app.log.error(error, 'Failed to get unread count')
      throw new ApiError(500, 'Failed to get unread count', 'FETCH_FAILED')
    }
  })

  // Mark notification as read
  app.patch('/notifications/:id/read', {
    schema: {
      description: 'Mark notification as read',
      tags: ['notifications'],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
        },
        required: ['id'],
      },
    },
  }, async (req: FastifyRequest<{ Params: { id: string } }>, reply) => {
    await authenticateUser(req, reply)
    const user = req.user as JWTPayload | undefined
    if (!user) {
      return
    }

    const { id } = req.params
    assertUuid(id, 'Invalid notification ID format')

    try {
      const result = await markAsRead(id, user.userId)
      if (result.count === 0) {
        return reply.code(404).send({
          error: {
            code: 'NOT_FOUND',
            message: 'Notification not found',
            requestId: req.id,
          },
        })
      }
      return reply.send({ success: true })
    } catch (error) {
      app.log.error(error, 'Failed to mark notification as read')
      throw new ApiError(500, 'Failed to mark notification as read', 'UPDATE_FAILED')
    }
  })

  // Mark all notifications as read
  app.patch('/notifications/read-all', {
    schema: {
      description: 'Mark all notifications as read',
      tags: ['notifications'],
    },
  }, async (req: FastifyRequest, reply) => {
    await authenticateUser(req, reply)
    const user = req.user as JWTPayload | undefined
    if (!user) {
      return
    }

    try {
      await markAllAsRead(user.userId)
      return reply.send({ success: true })
    } catch (error) {
      app.log.error(error, 'Failed to mark all notifications as read')
      throw new ApiError(500, 'Failed to mark all notifications as read', 'UPDATE_FAILED')
    }
  })

  // Issue a short-lived, single-use ticket for opening the SSE stream.
  // EventSource cannot send an Authorization header, so the web client
  // exchanges its JWT for a ticket and puts only the ticket in the URL
  // (URLs end up in proxy/access logs; a long-lived JWT must not).
  app.post('/notifications/stream-ticket', {
    preHandler: authenticateUser,
    config: { rateLimit: limits.sseTicket },
    schema: {
      description: 'Get a one-time ticket (valid 60s) for GET /notifications/stream',
      tags: ['notifications'],
      security: [{ bearerAuth: [] }, { cookieAuth: [] }],
    },
  }, async (req: FastifyRequest, reply) => {
    const user = req.user as JWTPayload
    const ticket = randomBytes(32).toString('base64url')
    await ephemeralStore.setWithTtl(sseTicketKey(ticket), user.userId, SSE_TICKET_TTL_SECONDS * 1000)
    return reply.send({ ticket, expiresIn: SSE_TICKET_TTL_SECONDS })
  })

  // Handle OPTIONS preflight for SSE endpoint
  app.options('/notifications/stream', async (req, reply) => {
    const origin = req.headers.origin
    const isDevelopment = process.env.NODE_ENV !== 'production'
    // Normalize origins by removing trailing slashes
    const allowedOrigins = process.env.CORS_ORIGIN?.split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean) || ['https://cira-frontend-nu.vercel.app']
    // Normalize incoming origin by removing trailing slash for comparison
    const normalizedOrigin: string = origin ? origin.replace(/\/$/, '') : ''
    
    if (isDevelopment || !origin || allowedOrigins.includes(normalizedOrigin)) {
      reply.header('Access-Control-Allow-Origin', origin || '*')
      reply.header('Access-Control-Allow-Credentials', 'true')
      reply.header('Access-Control-Allow-Methods', 'GET, OPTIONS')
      reply.header('Access-Control-Allow-Headers', 'Cache-Control')
    }
    return reply.code(204).send()
  })

  // SSE endpoint for real-time notifications
  app.get('/notifications/stream', {
    schema: {
      description: 'Server-Sent Events stream for real-time notifications',
      tags: ['notifications'],
      querystring: {
        type: 'object',
        properties: {
          ticket: { type: 'string', description: 'One-time ticket from POST /notifications/stream-ticket' },
        },
      },
    },
    // Without a ticket, falls back to the session cookie / Bearer header.
    preHandler: optionalAuthenticate,
  }, async (req: FastifyRequest<{ Querystring: { ticket?: string } }>, reply) => {
    let user: { userId: string } | null = null
    if (req.query.ticket) {
      const userId = await ephemeralStore.take(sseTicketKey(req.query.ticket))
      user = userId ? { userId } : null
    } else {
      const sessionUser = getAuthenticatedUser(req)
      user = sessionUser ? { userId: sessionUser.userId } : null
    }

    if (!user) {
      return reply.code(401).send({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
          requestId: req.id,
        },
      })
    }

    // Set SSE headers
    reply.raw.setHeader('Content-Type', 'text/event-stream')
    reply.raw.setHeader('Cache-Control', 'no-cache')
    reply.raw.setHeader('Connection', 'keep-alive')
    reply.raw.setHeader('X-Accel-Buffering', 'no') // Disable nginx buffering
    
    // Set CORS headers explicitly for SSE (EventSource requires these)
    const origin = req.headers.origin
    const isDevelopment = process.env.NODE_ENV !== 'production'
    // Normalize origins by removing trailing slashes
    const allowedOrigins = process.env.CORS_ORIGIN?.split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean) || ['https://cira-frontend-nu.vercel.app']
    // Normalize incoming origin by removing trailing slash for comparison
    const normalizedOrigin: string = origin ? origin.replace(/\/$/, '') : ''
    
    if (isDevelopment || !origin || allowedOrigins.includes(normalizedOrigin)) {
      reply.raw.setHeader('Access-Control-Allow-Origin', origin || '*')
      reply.raw.setHeader('Access-Control-Allow-Credentials', 'true')
      reply.raw.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
      reply.raw.setHeader('Access-Control-Allow-Headers', 'Cache-Control')
    }

    const connection = {
      send: (data: string) => {
        try {
          reply.raw.write(`data: ${data}\n\n`)
        } catch (error) {
          app.log.error(error, 'Failed to send SSE message')
        }
      },
      close: () => {
        try {
          reply.raw.end()
        } catch (error) {
          // Connection already closed
        }
      },
    }

    // Add connection to user's connections
    if (!sseConnections.has(user.userId)) {
      sseConnections.set(user.userId, new Set())
    }
    sseConnections.get(user.userId)!.add(connection)

    // Send initial connection message
    connection.send(JSON.stringify({ type: 'connected' }))

    // Handle client disconnect
    req.raw.on('close', () => {
      const userConnections = sseConnections.get(user.userId)
      if (userConnections) {
        userConnections.delete(connection)
        if (userConnections.size === 0) {
          sseConnections.delete(user.userId)
        }
      }
      connection.close()
    })

    // Keep connection alive with heartbeat
    const heartbeat = setInterval(() => {
      try {
        reply.raw.write(': heartbeat\n\n')
      } catch (error) {
        clearInterval(heartbeat)
        connection.close()
      }
    }, 30000) // Every 30 seconds

    req.raw.on('close', () => {
      clearInterval(heartbeat)
    })
  })
}

/**
 * Broadcast notification to user via SSE
 */
export function broadcastNotificationToUser(userId: string, notification: any) {
  const connections = sseConnections.get(userId)
  if (connections) {
    const message = JSON.stringify({
      type: 'notification',
      data: notification,
    })
    connections.forEach((conn) => {
      try {
        conn.send(message)
      } catch (error) {
        // Remove failed connection
        connections.delete(conn)
      }
    })
  }
}

