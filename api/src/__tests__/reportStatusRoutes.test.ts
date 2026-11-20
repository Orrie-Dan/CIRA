import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../prisma.js', async () => {
  const { createFakeReportDb } = await import('./helpers/fakeReportDb.js')
  const fake = createFakeReportDb()
  const prisma = {
    __fake: fake,
    userAccount: { findUnique: vi.fn() },
    report: {
      ...fake.tx.report,
      findMany: vi.fn(async () => []),
      count: vi.fn(async () => 0),
      findFirst: vi.fn(async () => null),
    },
    reportAssignment: fake.tx.reportAssignment,
    reportStatusHistory: fake.tx.reportStatusHistory,
    auditLog: fake.tx.auditLog,
    reportConfirmation: { count: vi.fn(async () => 0), findUnique: vi.fn(async () => null) },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(fake.tx)),
  }
  return { prisma }
})
vi.mock('../utils/notifications.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../utils/notifications.js')>()),
  notifyUsers: vi.fn(async () => []),
  getReportNotificationRecipients: vi.fn(async () => []),
  getOfficersAndAdmins: vi.fn(async () => []),
}))
vi.mock('../utils/pushNotifications.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../utils/pushNotifications.js')>()),
  sendPushNotificationsToUsers: vi.fn(async () => undefined),
}))

import Fastify, { type FastifyInstance } from 'fastify'
import jwt from '@fastify/jwt'
import cookie from '@fastify/cookie'
import { prisma } from '../prisma.js'
import { reportsRoutes } from '../routes/reports.js'
import { adminRoutes } from '../routes/admin.js'
import { getRequiredSecret } from '../utils/secrets.js'
import { fastifyErrorHandler } from '../utils/errors.js'
import type { createFakeReportDb } from './helpers/fakeReportDb.js'

const mocked = prisma as unknown as {
  __fake: ReturnType<typeof createFakeReportDb>
  userAccount: { findUnique: ReturnType<typeof vi.fn> }
  report: { findMany: ReturnType<typeof vi.fn>; count: ReturnType<typeof vi.fn>; findFirst: ReturnType<typeof vi.fn> }
  reportConfirmation: { count: ReturnType<typeof vi.fn>; findUnique: ReturnType<typeof vi.fn> }
}

const USERS = {
  admin: { id: '00000000-0000-4000-8000-00000000000a', email: 'admin@test.com', role: 'admin' },
  officer: { id: '00000000-0000-4000-8000-00000000000b', email: 'officer@test.com', role: 'officer' },
  otherOfficer: { id: '00000000-0000-4000-8000-00000000000c', email: 'officer2@test.com', role: 'officer' },
  citizen: { id: '00000000-0000-4000-8000-00000000000d', email: 'citizen@test.com', role: 'citizen' },
}
const REPORT_ID = '00000000-0000-4000-8000-000000000001'

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify()
  app.setErrorHandler(fastifyErrorHandler)
  await app.register(jwt, { secret: getRequiredSecret('JWT_SECRET') })
  await app.register(cookie, { secret: getRequiredSecret('COOKIE_SECRET') })
  await app.register(reportsRoutes)
  await app.register(adminRoutes)
  await app.ready()
  return app
}

describe('report status and visibility routes', () => {
  let app: FastifyInstance
  let fake: ReturnType<typeof createFakeReportDb>

  const tokenFor = (user: (typeof USERS)[keyof typeof USERS]) =>
    app.jwt.sign({ userId: user.id, email: user.email, role: user.role, tv: 0 })
  const auth = (user: (typeof USERS)[keyof typeof USERS]) => ({ authorization: `Bearer ${tokenFor(user)}` })

  beforeEach(async () => {
    vi.clearAllMocks()
    fake = mocked.__fake
    fake.state.reports.clear()
    fake.state.assignments.length = 0
    fake.state.history.length = 0
    fake.state.audit.length = 0
    mocked.userAccount.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => {
      const user = Object.values(USERS).find((u) => u.id === where.id)
      return user ? { ...user, tokenVersion: 0 } : null
    })
    app = await buildApp()
  })

  afterEach(async () => {
    await app.close()
  })

  describe.each(['/admin/reports', '/reports'])('PATCH %s/:id/status', (base) => {
    const url = `${base}/${REPORT_ID}/status`

    it('takes changedBy from the session and ignores a client-supplied one', async () => {
      fake.addReport(REPORT_ID, 'new')

      const res = await app.inject({
        method: 'PATCH',
        url,
        headers: auth(USERS.admin),
        payload: { status: 'triaged', changedBy: USERS.citizen.id },
      })

      expect(res.statusCode).toBe(200)
      expect(res.json()).toMatchObject({ id: REPORT_ID, status: 'triaged' })
      expect(fake.state.history).toHaveLength(1)
      expect(fake.state.history[0].changedBy).toBe(USERS.admin.id)
      expect(fake.state.audit).toEqual([
        expect.objectContaining({ userId: USERS.admin.id, action: 'report_status_changed', resourceId: REPORT_ID }),
      ])
    })

    it("refuses an officer changing another officer's report", async () => {
      fake.addReport(REPORT_ID, 'assigned')
      fake.assign(REPORT_ID, USERS.otherOfficer.id)

      const res = await app.inject({
        method: 'PATCH',
        url,
        headers: auth(USERS.officer),
        payload: { status: 'in_progress' },
      })

      expect(res.statusCode).toBe(403)
      expect(res.json().error.code).toBe('NOT_ASSIGNED')
      expect(fake.state.reports.get(REPORT_ID)!.status).toBe('assigned')
      expect(fake.state.history).toHaveLength(0)
    })

    it('lets the assigned officer start work', async () => {
      fake.addReport(REPORT_ID, 'assigned')
      fake.assign(REPORT_ID, USERS.officer.id)

      const res = await app.inject({
        method: 'PATCH',
        url,
        headers: auth(USERS.officer),
        payload: { status: 'in_progress' },
      })

      expect(res.statusCode).toBe(200)
      expect(fake.state.history[0].changedBy).toBe(USERS.officer.id)
    })

    it('rejects a disallowed transition with 409', async () => {
      fake.addReport(REPORT_ID, 'resolved')

      const res = await app.inject({
        method: 'PATCH',
        url,
        headers: auth(USERS.admin),
        payload: { status: 'new' },
      })

      expect(res.statusCode).toBe(409)
      expect(res.json().error.code).toBe('INVALID_TRANSITION')
    })

    it('refuses citizens', async () => {
      fake.addReport(REPORT_ID, 'new')
      const res = await app.inject({ method: 'PATCH', url, headers: auth(USERS.citizen), payload: { status: 'triaged' } })
      expect(res.statusCode).toBe(403)
      expect(fake.state.history).toHaveLength(0)
    })

    it('refuses anonymous callers', async () => {
      fake.addReport(REPORT_ID, 'new')
      const res = await app.inject({ method: 'PATCH', url, payload: { status: 'triaged' } })
      expect(res.statusCode).toBe(401)
    })

    it('returns 404 for a missing report', async () => {
      const res = await app.inject({ method: 'PATCH', url, headers: auth(USERS.admin), payload: { status: 'triaged' } })
      expect(res.statusCode).toBe(404)
    })
  })

  describe('POST /admin/reports/:id/assign', () => {
    it('moves a new report to assigned and records the admin as the actor', async () => {
      fake.addReport(REPORT_ID, 'new')
      const created = { id: 'a1', reportId: REPORT_ID, assigneeId: USERS.officer.id, organizationId: null, dueAt: null, createdAt: new Date(), assignee: { id: USERS.officer.id, email: USERS.officer.email, fullName: 'Officer' }, organization: null }
      ;(fake.tx as Record<string, unknown>).reportAssignment = {
        ...fake.tx.reportAssignment,
        create: vi.fn(async () => created),
      }

      const res = await app.inject({
        method: 'POST',
        url: `/admin/reports/${REPORT_ID}/assign`,
        headers: auth(USERS.admin),
        payload: { assigneeId: USERS.officer.id },
      })

      expect(res.statusCode).toBe(201)
      expect(fake.state.reports.get(REPORT_ID)!.status).toBe('assigned')
      expect(fake.state.history[0]).toMatchObject({ fromStatus: 'new', toStatus: 'assigned', changedBy: USERS.admin.id })
    })
  })

  describe('GET /reports (public, optional auth)', () => {
    it('serves anonymous callers without a reporter filter', async () => {
      const res = await app.inject({ method: 'GET', url: '/reports' })
      expect(res.statusCode).toBe(200)
      expect(mocked.report.findMany.mock.calls[0][0].where.reporterId).toBeUndefined()
    })

    it('rejects myReports=true without a session instead of returning everything', async () => {
      const res = await app.inject({ method: 'GET', url: '/reports?myReports=true' })
      expect(res.statusCode).toBe(401)
      expect(mocked.report.findMany).not.toHaveBeenCalled()
    })

    it("limits myReports=true to the caller's reports", async () => {
      const res = await app.inject({ method: 'GET', url: '/reports?myReports=true', headers: auth(USERS.citizen) })
      expect(res.statusCode).toBe(200)
      expect(mocked.report.findMany.mock.calls[0][0].where.reporterId).toBe(USERS.citizen.id)
    })

    it('treats an invalid token as anonymous on the public list', async () => {
      const res = await app.inject({ method: 'GET', url: '/reports', headers: { authorization: 'Bearer not-a-token' } })
      expect(res.statusCode).toBe(200)
    })
  })

  describe('GET /reports/:id/confirmations', () => {
    it('reports userConfirmed for a signed-in user who confirmed', async () => {
      mocked.reportConfirmation.count.mockResolvedValue(3)
      mocked.reportConfirmation.findUnique.mockResolvedValue({ id: 'c1' })

      const res = await app.inject({ method: 'GET', url: `/reports/${REPORT_ID}/confirmations`, headers: auth(USERS.citizen) })

      expect(res.statusCode).toBe(200)
      expect(res.json()).toEqual({ reportId: REPORT_ID, count: 3, userConfirmed: true })
      expect(mocked.reportConfirmation.findUnique.mock.calls[0][0].where.reportId_userId.userId).toBe(USERS.citizen.id)
    })

    it('still works anonymously', async () => {
      const res = await app.inject({ method: 'GET', url: `/reports/${REPORT_ID}/confirmations` })
      expect(res.statusCode).toBe(200)
      expect(res.json().userConfirmed).toBe(false)
    })
  })

  describe('staff report visibility', () => {
    const officerScope = {
      OR: [
        { status: { in: ['new', 'triaged'] } },
        { assignments: { some: { assigneeId: USERS.officer.id } } },
      ],
    }

    it('scopes the officer list to the triage queue and their assignments', async () => {
      const res = await app.inject({ method: 'GET', url: '/admin/reports', headers: auth(USERS.officer) })
      expect(res.statusCode).toBe(200)
      const where = mocked.report.findMany.mock.calls[0][0].where
      expect(where.AND).toEqual([officerScope])
      expect(mocked.report.count.mock.calls[0][0].where.AND).toEqual([officerScope])
    })

    it('keeps the officer scope even when another assigneeId is requested', async () => {
      await app.inject({
        method: 'GET',
        url: `/admin/reports?assigneeId=${USERS.otherOfficer.id}`,
        headers: auth(USERS.officer),
      })
      expect(mocked.report.findMany.mock.calls[0][0].where.AND).toEqual([officerScope])
    })

    it('does not scope admins', async () => {
      await app.inject({ method: 'GET', url: '/admin/reports', headers: auth(USERS.admin) })
      expect(mocked.report.findMany.mock.calls[0][0].where.AND).toBeUndefined()
    })

    it('returns 404 to an officer for a report outside their scope', async () => {
      const res = await app.inject({ method: 'GET', url: `/admin/reports/${REPORT_ID}`, headers: auth(USERS.officer) })
      expect(res.statusCode).toBe(404)
      expect(mocked.report.findFirst.mock.calls[0][0].where).toEqual({ AND: [{ id: REPORT_ID }, officerScope] })
    })

    it('looks up admins by id only', async () => {
      await app.inject({ method: 'GET', url: `/admin/reports/${REPORT_ID}`, headers: auth(USERS.admin) })
      expect(mocked.report.findFirst.mock.calls[0][0].where).toEqual({ id: REPORT_ID })
    })
  })
})
