import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// One user whose session version lives in `db.tokenVersion`.
const db = vi.hoisted(() => ({ tokenVersion: 0, failNextLookup: false }))

vi.mock('../prisma.js', () => ({
  prisma: {
    userAccount: {
      findUnique: vi.fn(async () => {
        if (db.failNextLookup) {
          db.failNextLookup = false
          throw new Error('db down')
        }
        return { id: 'user-1', email: 'user@test.com', role: 'citizen', tokenVersion: db.tokenVersion }
      }),
      update: vi.fn(async (args: { data: { tokenVersion?: { increment: number } } }) => {
        if (args.data.tokenVersion) db.tokenVersion += args.data.tokenVersion.increment
        return { id: 'user-1' }
      }),
    },
  },
}))
vi.mock('../utils/auditLogger.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../utils/auditLogger.js')>()),
  logAuditEvent: vi.fn(async () => undefined),
}))

import http from 'node:http'
import type { AddressInfo } from 'node:net'
import Fastify, { type FastifyInstance } from 'fastify'
import jwt from '@fastify/jwt'
import cookie from '@fastify/cookie'
import { authRoutes } from '../routes/auth.js'
import { notificationsRoutes, setSseHeartbeatMsForTesting, broadcastNotificationToUser } from '../routes/notifications.js'
import { registerRateLimit } from '../utils/rateLimit.js'
import { getRequiredSecret } from '../utils/secrets.js'
import { fastifyErrorHandler } from '../utils/errors.js'
import { setRedisForTesting } from '../services/redis.js'
import { clearMemoryStoreForTesting } from '../services/ephemeralStore.js'
import { sseConnectionCount } from '../services/sseConnections.js'

interface Stream {
  status: number
  /** Parsed `data:` payloads received so far. */
  events: Array<{ type: string }>
  /** Resolves when the server ends the stream. */
  ended: Promise<void>
  destroy: () => void
}

describe('SSE streams and session revocation', () => {
  let app: FastifyInstance
  let baseUrl: string
  let token: string

  beforeEach(async () => {
    db.tokenVersion = 0
    db.failNextLookup = false
    setRedisForTesting(null)
    clearMemoryStoreForTesting()
    setSseHeartbeatMsForTesting(50)

    app = Fastify()
    app.setErrorHandler(fastifyErrorHandler)
    await app.register(jwt, { secret: getRequiredSecret('JWT_SECRET') })
    await app.register(cookie, { secret: getRequiredSecret('COOKIE_SECRET') })
    await registerRateLimit(app)
    await app.register(authRoutes)
    await app.register(notificationsRoutes)
    await app.listen({ port: 0, host: '127.0.0.1' })
    baseUrl = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`
    token = app.jwt.sign({ userId: 'user-1', email: 'user@test.com', role: 'citizen', tv: 0 })
  })

  const opened: Stream[] = []

  afterEach(async () => {
    setSseHeartbeatMsForTesting(30_000)
    // A failed test can leave a stream open; don't let it hang the next one.
    opened.splice(0).forEach((s) => s.destroy())
    app.server.closeAllConnections()
    await app.close()
  })

  const auth = () => ({ authorization: `Bearer ${token}` })

  /** Opens the stream and waits for the response headers (and, if 200, the 'connected' event). */
  function openStream(path: string, headers: Record<string, string> = {}): Promise<Stream> {
    return new Promise((resolve, reject) => {
      const req = http.get(`${baseUrl}${path}`, { headers }, (res) => {
        const events: Array<{ type: string }> = []
        let buffer = ''
        let resolveEnded!: () => void
        const ended = new Promise<void>((r) => (resolveEnded = r))
        const stream: Stream = { status: res.statusCode ?? 0, events, ended, destroy: () => req.destroy() }
        opened.push(stream)
        res.setEncoding('utf8')
        res.on('data', (chunk: string) => {
          buffer += chunk
          let idx
          while ((idx = buffer.indexOf('\n\n')) !== -1) {
            const block = buffer.slice(0, idx)
            buffer = buffer.slice(idx + 2)
            if (block.startsWith('data: ')) events.push(JSON.parse(block.slice(6)))
          }
          if (events.some((e) => e.type === 'connected')) resolve(stream)
        })
        res.on('end', resolveEnded)
        res.on('close', resolveEnded)
        if (stream.status !== 200) resolve(stream)
      })
      req.on('error', reject)
    })
  }

  const within = <T>(promise: Promise<T>, ms: number, what: string) =>
    Promise.race([promise, new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`timed out: ${what}`)), ms))])

  it('logout-all closes the open stream at once, with a session_revoked event', async () => {
    setSseHeartbeatMsForTesting(60_000) // rule out the heartbeat check
    const stream = await openStream('/notifications/stream', auth())
    expect(stream.status).toBe(200)
    expect(sseConnectionCount('user-1')).toBe(1)

    const res = await app.inject({ method: 'POST', url: '/auth/logout-all', headers: auth() })
    expect(res.statusCode).toBe(200)

    await within(stream.ended, 2000, 'stream to end after logout-all')
    expect(stream.events.map((e) => e.type)).toEqual(['connected', 'session_revoked'])
    expect(sseConnectionCount('user-1')).toBe(0)
  })

  it('closes the stream on the next heartbeat when sessions were revoked elsewhere', async () => {
    const stream = await openStream('/notifications/stream', auth())
    db.tokenVersion += 1 // e.g. revoked by another instance: no in-process close

    await within(stream.ended, 2000, 'heartbeat to close the stream')
    expect(stream.events.at(-1)?.type).toBe('session_revoked')
    expect(sseConnectionCount('user-1')).toBe(0)
  })

  it('keeps a valid stream open across heartbeats and delivers notifications', async () => {
    const stream = await openStream('/notifications/stream', auth())
    await new Promise((r) => setTimeout(r, 200)) // several heartbeats
    broadcastNotificationToUser('user-1', { title: 'Hi' })
    await new Promise((r) => setTimeout(r, 50))

    expect(stream.events.map((e) => e.type)).toEqual(['connected', 'notification'])
    expect(sseConnectionCount('user-1')).toBe(1)
    stream.destroy()
  })

  it('keeps the stream open when the session check fails, and checks again next heartbeat', async () => {
    const stream = await openStream('/notifications/stream', auth())
    db.failNextLookup = true
    await new Promise((r) => setTimeout(r, 120))
    expect(sseConnectionCount('user-1')).toBe(1)

    db.tokenVersion += 1
    await within(stream.ended, 2000, 'stream to close after the check recovers')
    expect(stream.events.at(-1)?.type).toBe('session_revoked')
  })

  it('a ticket taken before a revocation cannot open a stream after it', async () => {
    const ticketRes = await app.inject({ method: 'POST', url: '/notifications/stream-ticket', headers: auth() })
    expect(ticketRes.statusCode).toBe(200)
    const { ticket } = ticketRes.json() as { ticket: string }

    db.tokenVersion += 1
    const stream = await openStream(`/notifications/stream?ticket=${ticket}`)
    expect(stream.status).toBe(401)
    expect(sseConnectionCount('user-1')).toBe(0)
  })

  it('a fresh ticket opens a stream, once', async () => {
    const { ticket } = (await app.inject({ method: 'POST', url: '/notifications/stream-ticket', headers: auth() })).json() as { ticket: string }
    const stream = await openStream(`/notifications/stream?ticket=${ticket}`)
    expect(stream.status).toBe(200)
    stream.destroy()

    const reuse = await openStream(`/notifications/stream?ticket=${ticket}`)
    expect(reuse.status).toBe(401)
  })
})
