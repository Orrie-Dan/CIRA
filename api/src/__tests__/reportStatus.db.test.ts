import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import { PrismaClient, type Prisma } from '@prisma/client'

/**
 * Runs against a real, disposable Postgres when DATABASE_TEST_URL is set, e.g.
 *   docker run -d --rm --name cira-test-pg -e POSTGRES_PASSWORD=test -e POSTGRES_DB=cira_test -p 55432:5432 postgres:16-alpine
 *   DATABASE_URL=postgresql://postgres:test@localhost:55432/cira_test npx prisma migrate deploy
 *   DATABASE_TEST_URL=postgresql://postgres:test@localhost:55432/cira_test pnpm test
 * The test deletes all reports, users and audit rows in that database.
 */
const url = process.env.DATABASE_TEST_URL

const holder = vi.hoisted(() => ({ client: undefined as unknown }))
vi.mock('../prisma.js', () => ({
  get prisma() {
    return holder.client
  },
}))
vi.mock('../utils/notifications.js', () => ({
  notifyUsers: vi.fn(),
  getReportNotificationRecipients: vi.fn(async () => []),
}))
vi.mock('../utils/pushNotifications.js', () => ({ sendPushNotificationsToUsers: vi.fn() }))
vi.mock('../routes/notifications.js', () => ({ broadcastNotificationToUser: vi.fn() }))

import { applyStatusChange, changeReportStatus } from '../services/reportStatusService.js'
import { ApiError } from '../utils/errors.js'

describe.skipIf(!url)('report status service (postgres)', () => {
  let db: PrismaClient
  let admin: { id: string }
  let officer: { id: string }
  let reportId: string

  beforeAll(async () => {
    db = new PrismaClient({ datasourceUrl: url })
    holder.client = db
  })

  afterAll(async () => {
    await db.$disconnect()
  })

  beforeEach(async () => {
    await db.auditLog.deleteMany()
    await db.report.deleteMany()
    await db.userAccount.deleteMany()
    admin = await db.userAccount.create({ data: { email: 'admin@test.com', role: 'admin' } })
    officer = await db.userAccount.create({ data: { email: 'officer@test.com', role: 'officer' } })
    const report = await db.report.create({
      data: { title: 'Pothole', description: 'Big one', type: 'pothole', severity: 'high', status: 'in_progress', latitude: -1.95, longitude: 30.06 },
    })
    reportId = report.id
    await db.reportAssignment.create({ data: { reportId, assigneeId: officer.id } })
  })

  it('writes the status, history (with FK to the actor) and audit row together', async () => {
    const { report, fromStatus } = await changeReportStatus({
      reportId,
      toStatus: 'resolved',
      actor: { userId: officer.id, role: 'officer' },
    })

    expect(fromStatus).toBe('in_progress')
    expect(report.status).toBe('resolved')
    const history = await db.reportStatusHistory.findMany({ where: { reportId }, include: { changedByUser: true } })
    expect(history).toHaveLength(1)
    expect(history[0].changedByUser?.email).toBe('officer@test.com')
    expect(await db.auditLog.count({ where: { resourceId: reportId, userId: officer.id } })).toBe(1)
  })

  it('rolls everything back if the surrounding transaction fails', async () => {
    await expect(
      db.$transaction(async (tx) => {
        await applyStatusChange(tx, { reportId, toStatus: 'resolved', actor: { userId: officer.id, role: 'officer' } })
        throw new Error('later step failed')
      })
    ).rejects.toThrow('later step failed')

    expect((await db.report.findUniqueOrThrow({ where: { id: reportId } })).status).toBe('in_progress')
    expect(await db.reportStatusHistory.count({ where: { reportId } })).toBe(0)
    expect(await db.auditLog.count({ where: { resourceId: reportId } })).toBe(0)
  })

  it('lets exactly one of two concurrent changes win', async () => {
    // Both transactions read 'in_progress' before either writes.
    let arrived = 0
    let release!: () => void
    const bothRead = new Promise<void>((resolve) => (release = resolve))

    const withBarrier = (tx: Prisma.TransactionClient) =>
      new Proxy(tx, {
        get(target, prop) {
          if (prop !== 'report') return Reflect.get(target, prop)
          const report = target.report
          return new Proxy(report, {
            get(r, p) {
              if (p !== 'updateMany') return Reflect.get(r, p)
              return async (args: Prisma.ReportUpdateManyArgs) => {
                arrived += 1
                if (arrived === 2) release()
                await bothRead
                return r.updateMany(args)
              }
            },
          })
        },
      })

    const run = (toStatus: 'resolved' | 'rejected', actor: { userId: string; role: string }) =>
      db.$transaction((tx) => applyStatusChange(withBarrier(tx), { reportId, toStatus, actor }), { timeout: 10000 })

    const results = await Promise.allSettled([
      run('resolved', { userId: officer.id, role: 'officer' }),
      run('rejected', { userId: admin.id, role: 'admin' }),
    ])

    const fulfilled = results.filter((r) => r.status === 'fulfilled')
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
    expect(fulfilled).toHaveLength(1)
    expect(rejected).toHaveLength(1)
    expect(rejected[0].reason).toBeInstanceOf(ApiError)
    expect((rejected[0].reason as ApiError).code).toBe('STATUS_CONFLICT')

    const final = await db.report.findUniqueOrThrow({ where: { id: reportId } })
    const history = await db.reportStatusHistory.findMany({ where: { reportId } })
    expect(history).toHaveLength(1)
    expect(history[0].toStatus).toBe(final.status)
    expect(await db.auditLog.count({ where: { resourceId: reportId } })).toBe(1)
  })
})
