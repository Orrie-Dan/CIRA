import 'dotenv/config'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import cookie from '@fastify/cookie'
import multipart from '@fastify/multipart'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import { reportsRoutes } from './routes/reports.js'
import { fastifyErrorHandler } from './utils/errors.js'
import { getRequiredSecret, validateProductionSecrets } from './utils/secrets.js'
import { registerRateLimit, parseTrustProxy } from './utils/rateLimit.js'
import { SESSION_TTL_SECONDS } from './utils/session.js'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const port = Number(process.env.PORT || 3001)

validateProductionSecrets()

declare module 'fastify' {
  interface FastifyRequest {
    startTime?: number
  }
}

const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
    serializers: {
      req(request) {
        const headers = { ...request.headers }
        if (headers.authorization) {
          headers.authorization = '[REDACTED]'
        }
        if (headers.cookie) {
          headers.cookie = '[REDACTED]'
        }
        return {
          method: request.method,
          url: request.url,
          headers,
        }
      },
    },
  },
  // Set TRUST_PROXY (e.g. 1 for one load balancer hop) so request.ip is the
  // real client IP for rate limiting. Never trust X-Forwarded-For by default.
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
  requestIdHeader: 'x-request-id',
  requestIdLogLabel: 'requestId',
  genReqId: () => crypto.randomUUID(),
  requestTimeout: 120000, // 120 seconds for file uploads
  bodyLimit: 10 * 1024 * 1024, // 10MB body limit
})

app.addHook('onRequest', async (request) => {
  request.startTime = Date.now()
})

app.addHook('onResponse', async (request, reply) => {
  const durationMs = request.startTime ? Date.now() - request.startTime : undefined
  request.log.info(
    { statusCode: reply.statusCode, durationMs, method: request.method, url: request.url },
    'request completed'
  )
})

// JWT
await app.register(jwt, {
  secret: getRequiredSecret('JWT_SECRET'),
  sign: { expiresIn: SESSION_TTL_SECONDS },
})

// Cookie
await app.register(cookie, {
  secret: getRequiredSecret('COOKIE_SECRET'),
})

// Swagger/OpenAPI Documentation
await app.register(swagger, {
  openapi: {
    openapi: '3.0.0',
    info: {
      title: 'CIRA API',
      description: 'Community Infrastructure Reporting API',
      version: '0.1.0',
    },
    servers: [
      {
        url: process.env.API_URL || `http://localhost:${port}`,
        description: 'Development server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
        cookieAuth: {
          type: 'apiKey',
          in: 'cookie',
          name: 'token',
        },
      },
    },
    tags: [
      { name: 'auth', description: 'Authentication endpoints' },
      { name: 'reports', description: 'Report management endpoints' },
      { name: 'admin', description: 'Admin endpoints' },
      { name: 'geocoding', description: 'Geocoding endpoints' },
      { name: 'photos', description: 'Photo upload endpoints' },
      { name: 'notifications', description: 'Notification endpoints' },
      { name: 'analytics', description: 'Analytics and reporting endpoints' },
    ],
  },
})

// Swagger UI
await app.register(swaggerUi, {
  routePrefix: '/docs',
  uiConfig: {
    docExpansion: 'list',
    deepLinking: false,
  },
  staticCSP: true,
})

// CORS
await app.register(cors, {
  origin: (origin, cb) => {
    // In development, allow all origins (including mobile Expo)
    const isDevelopment = process.env.NODE_ENV !== 'production'
    
    if (isDevelopment) {
      cb(null, true)
      return
    }
    
    const allowed = (process.env.CORS_ORIGIN?.split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean)) || [
      'https://cira-frontend-nu.vercel.app',
    ]

    const normalizedOrigin = origin?.replace(/\/$/, '') || ''
    if (!origin || allowed.includes(normalizedOrigin)) {
      cb(null, true)
    } else {
      cb(new Error('Not allowed'), false)
    }
  },
  credentials: true,
})

// Rate limiting (opt-in per route via config.rateLimit)
await registerRateLimit(app)

// Multipart support for file uploads
await app.register(multipart, {
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
})

// Error handler
app.setErrorHandler(fastifyErrorHandler)

// Health check
app.get('/health', {
  schema: {
    description: 'Health check endpoint',
    tags: [],
    response: {
      200: {
        type: 'object',
        properties: {
          status: { type: 'string' },
          timestamp: { type: 'string', format: 'date-time' },
        },
      },
    },
  },
}, async () => {
  return { status: 'ok', timestamp: new Date().toISOString() }
})

// Routes
const { authRoutes } = await import('./routes/auth.js')
await app.register(authRoutes)
await app.register(reportsRoutes)
const { adminRoutes } = await import('./routes/admin.js')
await app.register(adminRoutes)
const { geocodingRoutes } = await import('./routes/geocoding.js')
await app.register(geocodingRoutes)
const { photosRoutes } = await import('./routes/photos.js')
await app.register(photosRoutes)
const { notificationsRoutes } = await import('./routes/notifications.js')
await app.register(notificationsRoutes)
const { passwordResetRoutes } = await import('./routes/password-reset.js')
await app.register(passwordResetRoutes)
const { qcSlipRoutes } = await import('./routes/qc-slip.js')
await app.register(qcSlipRoutes)
const { analyticsRoutes } = await import('./routes/analytics.js')
await app.register(analyticsRoutes)

// Start server
const host = '0.0.0.0'

app.listen({ port, host }).catch((err) => {
  app.log.error(err)
  process.exit(1)
})
