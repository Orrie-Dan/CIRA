import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'

/**
 * End-to-end flows through the real app (all plugins, routes, auth, rate
 * limiting, error handling) against a real, disposable Postgres. Only outbound
 * email is mocked, to capture OTP codes.
 *
 *   docker run -d --rm --name cira-test-pg -e POSTGRES_PASSWORD=test -e POSTGRES_DB=cira_test -p 55432:5432 postgres:16-alpine
 *   DATABASE_URL=postgresql://postgres:test@localhost:55432/cira_test npx prisma migrate deploy
 *   DATABASE_TEST_URL=postgresql://postgres:test@localhost:55432/cira_test pnpm test
 *
 * The test deletes all users and reports in that database.
 */
const url = vi.hoisted(() => {
  const testUrl = process.env.DATABASE_TEST_URL
  // The Prisma client reads DATABASE_URL when first imported.
  if (testUrl) process.env.DATABASE_URL = testUrl
  return testUrl
})

const sentCodes = vi.hoisted(() => new Map<string, string>())
vi.mock('../utils/email.js', () => ({
  sendOTPViaEmail: vi.fn(async (email: string, code: string) => {
    sentCodes.set(email, code)
  }),
  sendPasswordResetEmail: vi.fn(async (email: string, code: string) => {
    sentCodes.set(email, code)
  }),
}))

import type { FastifyInstance } from 'fastify'

describe.skipIf(!url)('API integration (postgres)', () => {
  let app: FastifyInstance
  let prisma: typeof import('../prisma.js').prisma
  let drainNotifications: typeof import('../services/notificationDispatcher.js').drainNotifications

  const tokens: Record<'citizen' | 'admin' | 'officer', string> = { citizen: '', admin: '', officer: '' }
  let officerId = ''
  let reportId = ''

  const as = (who: keyof typeof tokens) => ({ authorization: `Bearer ${tokens[who]}` })

  beforeAll(async () => {
    ;({ prisma } = await import('../prisma.js'))
    ;({ drainNotifications } = await import('../services/notificationDispatcher.js'))
    const { buildApp } = await import('../app.js')
    const { hashPassword } = await import('../utils/auth.js')
    const { setRedisForTesting } = await import('../services/redis.js')
    setRedisForTesting(null)

    await prisma.auditLog.deleteMany()
    await prisma.notification.deleteMany()
    await prisma.report.deleteMany()
    await prisma.userAccount.deleteMany()

    const passwordHash = await hashPassword('Staff-pass-123')
    await prisma.userAccount.create({ data: { email: 'admin@int.test', role: 'admin', passwordHash, emailVerified: true } })
    const officer = await prisma.userAccount.create({
      data: { email: 'officer@int.test', role: 'officer', passwordHash, emailVerified: true, fullName: 'Officer One' },
    })
    officerId = officer.id

    app = await buildApp({ logger: false })
    await app.ready()
  })

  afterAll(async () => {
    await app?.close()
    await prisma?.$disconnect()
  })

  it('registers a citizen and only issues a session after email verification', async () => {
    const register = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'Citizen@Int.Test', password: 'Citizen-pass-1', fullName: 'Citizen' },
    })
    expect(register.statusCode).toBeLessThan(300)
    expect(register.json().token).toBeUndefined()

    const unverifiedLogin = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'citizen@int.test', password: 'Citizen-pass-1' },
    })
    expect(unverifiedLogin.statusCode).toBeGreaterThanOrEqual(400)

    const code = sentCodes.get('citizen@int.test')
    expect(code).toMatch(/^\d{6}$/)

    const wrong = await app.inject({ method: 'POST', url: '/auth/verify-otp', payload: { email: 'citizen@int.test', code: code === '000000' ? '111111' : '000000' } })
    expect(wrong.statusCode).toBeGreaterThanOrEqual(400)

    const verify = await app.inject({ method: 'POST', url: '/auth/verify-otp', payload: { email: 'citizen@int.test', code } })
    expect(verify.statusCode).toBe(200)
    tokens.citizen = verify.json().token
    expect(tokens.citizen).toBeTruthy()

    const me = await app.inject({ method: 'GET', url: '/auth/me', headers: as('citizen') })
    expect(me.statusCode).toBe(200)
    expect(me.json().user).toMatchObject({ email: 'citizen@int.test', role: 'citizen' })
  })

  it('logs staff in with password', async () => {
    for (const who of ['admin', 'officer'] as const) {
      const res = await app.inject({ method: 'POST', url: '/auth/login', payload: { email: `${who}@int.test`, password: 'Staff-pass-123' } })
      expect(res.statusCode).toBe(200)
      tokens[who] = res.json().token
    }
  })

  it('creates a report attributed to the session user, not a body reporterId', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/reports',
      headers: as('citizen'),
      payload: {
        title: 'Broken streetlight',
        description: 'Out for a week on KG 7 Ave',
        type: 'streetlight',
        severity: 'medium',
        latitude: -1.9441,
        longitude: 30.0619,
        reporterId: officerId,
      },
    })
    expect(res.statusCode).toBe(201)
    reportId = res.json().id

    const stored = await prisma.report.findUniqueOrThrow({ where: { id: reportId }, include: { reporter: true } })
    expect(stored.reporter?.email).toBe('citizen@int.test')

    const mine = await app.inject({ method: 'GET', url: '/reports?myReports=true', headers: as('citizen') })
    expect(mine.json().data.map((r: { id: string }) => r.id)).toEqual([reportId])
    const anonMine = await app.inject({ method: 'GET', url: '/reports?myReports=true' })
    expect(anonMine.statusCode).toBe(401)
  })

  it('runs the status workflow with role rules, recorded actors and notifications', async () => {
    const citizenAttempt = await app.inject({ method: 'PATCH', url: `/admin/reports/${reportId}/status`, headers: as('citizen'), payload: { status: 'triaged' } })
    expect(citizenAttempt.statusCode).toBe(403)

    const triage = await app.inject({ method: 'PATCH', url: `/admin/reports/${reportId}/status`, headers: as('officer'), payload: { status: 'triaged' } })
    expect(triage.statusCode).toBe(200)

    const officerAssign = await app.inject({ method: 'POST', url: `/admin/reports/${reportId}/assign`, headers: as('officer'), payload: { assigneeId: officerId } })
    expect(officerAssign.statusCode).toBe(403)

    const assign = await app.inject({ method: 'POST', url: `/admin/reports/${reportId}/assign`, headers: as('admin'), payload: { assigneeId: officerId } })
    expect(assign.statusCode).toBe(201)

    const skipAhead = await app.inject({ method: 'PATCH', url: `/admin/reports/${reportId}/status`, headers: as('officer'), payload: { status: 'resolved' } })
    expect(skipAhead.statusCode).toBe(409)

    for (const status of ['in_progress', 'resolved']) {
      const res = await app.inject({ method: 'PATCH', url: `/admin/reports/${reportId}/status`, headers: as('officer'), payload: { status } })
      expect(res.statusCode).toBe(200)
    }

    const history = await prisma.reportStatusHistory.findMany({
      where: { reportId },
      orderBy: { createdAt: 'asc' },
      include: { changedByUser: { select: { email: true } } },
    })
    expect(history.map((h) => `${h.fromStatus ?? '-'}>${h.toStatus}:${h.changedByUser?.email ?? 'system'}`)).toEqual([
      '->new:system',
      'new>triaged:officer@int.test',
      'triaged>assigned:admin@int.test',
      'assigned>in_progress:officer@int.test',
      'in_progress>resolved:officer@int.test',
    ])
    expect(await prisma.auditLog.count({ where: { resourceId: reportId, action: 'report_status_changed' } })).toBe(4)

    // Notifications are delivered after the responses.
    await drainNotifications()
    const notifications = await app.inject({ method: 'GET', url: '/notifications', headers: as('citizen') })
    expect(notifications.statusCode).toBe(200)
    const types = (notifications.json().data as Array<{ type: string }>).map((n) => n.type)
    // triaged, in_progress, resolved. Assignment notifies the officer, not the
    // reporter (existing behaviour), so 'assigned' produces no reporter notification.
    expect(types.filter((t) => t === 'report_status_changed')).toHaveLength(3)
    const officerInbox = await app.inject({ method: 'GET', url: '/notifications', headers: as('officer') })
    expect((officerInbox.json().data as Array<{ type: string }>).some((n) => n.type === 'report_assigned')).toBe(true)
  })

  it('records the staff member as comment author and keeps officers out of other reports', async () => {
    const comment = await app.inject({
      method: 'POST',
      url: `/admin/reports/${reportId}/comments`,
      headers: as('admin'),
      payload: { body: 'Confirmed fixed', authorId: officerId },
    })
    expect(comment.statusCode).toBe(201)
    expect(comment.json().author.email).toBe('admin@int.test')

    const other = await prisma.report.create({
      data: { title: 'Not yours', description: 'Assigned elsewhere', type: 'roads', severity: 'low', status: 'in_progress', latitude: -1.95, longitude: 30.06 },
    })
    const detail = await app.inject({ method: 'GET', url: `/admin/reports/${other.id}`, headers: as('officer') })
    expect(detail.statusCode).toBe(404)
    const officerComment = await app.inject({ method: 'POST', url: `/admin/reports/${other.id}/comments`, headers: as('officer'), payload: { body: 'hi' } })
    expect(officerComment.statusCode).toBe(404)
  })

  it('returns the standard error envelope for validation failures', async () => {
    const res = await app.inject({ method: 'PATCH', url: '/admin/reports/not-a-uuid/status', headers: as('admin'), payload: { status: 'triaged' } })
    expect(res.statusCode).toBe(400)
    expect(res.json()).toEqual({ error: { code: 'INVALID_ID', message: 'Invalid report ID format', requestId: expect.any(String) } })
  })

  it('revokes every session on logout-all', async () => {
    const out = await app.inject({ method: 'POST', url: '/auth/logout-all', headers: as('citizen') })
    expect(out.statusCode).toBe(200)
    const me = await app.inject({ method: 'GET', url: '/auth/me', headers: as('citizen') })
    expect(me.statusCode).toBe(401)
  })
})
