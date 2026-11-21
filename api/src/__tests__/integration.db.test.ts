import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'

/**
 * End-to-end flows through the real app (all plugins, routes, auth, rate
 * limiting, error handling) against a real, disposable Postgres. Only outbound
 * email and SMS are mocked, to capture OTP codes.
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
vi.mock('../utils/sms.js', () => ({
  sendOTPViaSMS: vi.fn(async (phone: string, code: string) => {
    sentCodes.set(phone, code)
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
    // Loading the whole app and opening the first DB connection takes ~9 s on
    // slower machines, close to vitest's default 10 s hook timeout.
  }, 30_000)

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
    type Inbox = Array<{ type: string; data?: { status?: string } }>
    const statusesSeen = (inbox: Inbox) =>
      inbox.filter((n) => n.type === 'report_status_changed').map((n) => n.data?.status).sort()
    // The reporter hears about every step, including the assignment.
    expect(statusesSeen(notifications.json().data)).toEqual(['assigned', 'in_progress', 'resolved', 'triaged'])
    // The officer gets "assigned to you" instead of a second 'assigned' status notification.
    const officerInbox = (await app.inject({ method: 'GET', url: '/notifications', headers: as('officer') })).json().data as Inbox
    expect(officerInbox.filter((n) => n.type === 'report_assigned')).toHaveLength(1)
    expect(statusesSeen(officerInbox)).not.toContain('assigned')
  })

  it('auto-assign notifies the officer and the reporter', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/reports',
      headers: as('citizen'),
      payload: { title: 'Blocked drain', description: 'Flooding after rain', type: 'drainage', severity: 'high', latitude: -1.95, longitude: 30.07 },
    })
    expect(created.statusCode).toBe(201)
    const autoReportId = created.json().id
    await drainNotifications()

    const auto = await app.inject({ method: 'POST', url: '/admin/reports/auto-assign', headers: as('admin') })
    expect(auto.statusCode).toBe(200)
    expect(auto.json().data.map((a: { reportId: string }) => a.reportId)).toContain(autoReportId)
    await drainNotifications()

    const forReport = async (who: 'citizen' | 'officer') =>
      ((await app.inject({ method: 'GET', url: '/notifications', headers: as(who) })).json().data as Array<{ type: string; data?: { reportId?: string; status?: string } }>)
        .filter((n) => n.data?.reportId === autoReportId)
        .map((n) => `${n.type}${n.data?.status ? `:${n.data.status}` : ''}`)
        .sort()

    expect(await forReport('citizen')).toEqual(['report_status_changed:assigned'])
    // Staff were already alerted when the report was filed (report_created).
    expect(await forReport('officer')).toEqual(['report_assigned', 'report_created'])
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

  it('keeps phone numbers unique and only lets verified numbers log in', async () => {
    const NUMBER = '+250788123456'
    const OTHER = '+250722000000'
    const post = (url: string, payload: object, who?: keyof typeof tokens) =>
      app.inject({ method: 'POST', url, payload, headers: who ? as(who) : {} })
    const setPhone = (who: keyof typeof tokens, phone: string) =>
      app.inject({ method: 'PUT', url: '/auth/profile', headers: as(who), payload: { phone } })

    // Stored normalized; a new number starts unverified.
    const set = await setPhone('citizen', '0788 123 456')
    expect(set.statusCode).toBe(200)
    expect(set.json().user).toMatchObject({ phone: NUMBER, phoneVerified: false })

    // Unique across accounts, whatever the spelling.
    expect((await setPhone('officer', '0788-123-456')).json().error.code).toBe('PHONE_IN_USE')
    const dupRegister = await post('/auth/register', { email: 'second@int.test', password: 'Second-pass-1', phone: '250788123456' })
    expect(dupRegister.statusCode).toBe(409)
    expect(dupRegister.json().error.code).toBe('PHONE_IN_USE')
    expect(await prisma.userAccount.count({ where: { email: 'second@int.test' } })).toBe(0)

    // An unverified number can't be used to log in: no code is sent.
    sentCodes.delete(NUMBER)
    expect((await post('/auth/send-otp', { phone: NUMBER })).statusCode).toBe(200)
    expect(sentCodes.has(NUMBER)).toBe(false)

    // Verifying requires the signed-in owner and the right code.
    expect((await post('/auth/phone/send-code', { phone: NUMBER })).statusCode).toBe(401)
    expect((await post('/auth/phone/send-code', { phone: NUMBER }, 'citizen')).statusCode).toBe(200)
    const code = sentCodes.get(NUMBER)!
    const wrongCode = code === '000000' ? '111111' : '000000'
    expect((await post('/auth/phone/verify', { phone: NUMBER, code: wrongCode }, 'citizen')).statusCode).toBe(400)
    const verified = await post('/auth/phone/verify', { phone: NUMBER, code }, 'citizen')
    expect(verified.statusCode).toBe(200)
    expect(verified.json().user).toMatchObject({ phone: NUMBER, phoneVerified: true })

    // Now the number logs in.
    sentCodes.delete(NUMBER)
    await post('/auth/send-otp', { phone: '0788123456' })
    const login = await post('/auth/verify-otp', { phone: NUMBER, code: sentCodes.get(NUMBER) })
    expect(login.statusCode).toBe(200)
    const me = await app.inject({ method: 'GET', url: '/auth/me', headers: { authorization: `Bearer ${login.json().token}` } })
    expect(me.json().user.email).toBe('citizen@int.test')

    // Squatting: the officer types OTHER into their profile (unverified); the
    // admin proves they hold it and takes it over. The officer can't take it back.
    expect((await setPhone('officer', OTHER)).statusCode).toBe(200)
    await post('/auth/phone/send-code', { phone: OTHER }, 'admin')
    const claim = await post('/auth/phone/verify', { phone: OTHER, code: sentCodes.get(OTHER) }, 'admin')
    expect(claim.statusCode).toBe(200)
    expect(await prisma.userAccount.findUniqueOrThrow({ where: { id: officerId }, select: { phone: true, phoneVerified: true } }))
      .toEqual({ phone: null, phoneVerified: false })
    expect((await post('/auth/phone/send-code', { phone: OTHER }, 'officer')).json().error.code).toBe('PHONE_IN_USE')

    // Changing the number drops verification; the old number no longer logs in.
    const changed = await setPhone('citizen', '0733000000')
    expect(changed.json().user).toMatchObject({ phone: '+250733000000', phoneVerified: false })
    sentCodes.delete(NUMBER)
    await post('/auth/send-otp', { phone: NUMBER })
    expect(sentCodes.has(NUMBER)).toBe(false)
  })

  it('revokes every session on logout-all', async () => {
    const out = await app.inject({ method: 'POST', url: '/auth/logout-all', headers: as('citizen') })
    expect(out.statusCode).toBe(200)
    const me = await app.inject({ method: 'GET', url: '/auth/me', headers: as('citizen') })
    expect(me.statusCode).toBe(401)
  })
})
