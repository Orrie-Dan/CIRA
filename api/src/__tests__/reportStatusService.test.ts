import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../prisma.js', () => ({ prisma: {} }))
vi.mock('../utils/notifications.js', () => ({
  notifyUsers: vi.fn(),
  getReportNotificationRecipients: vi.fn(async () => []),
}))
vi.mock('../utils/pushNotifications.js', () => ({ sendPushNotificationsToUsers: vi.fn() }))
vi.mock('../routes/notifications.js', () => ({ broadcastNotificationToUser: vi.fn() }))

import type { Prisma } from '@prisma/client'
import {
  applyStatusChange,
  staffReportVisibilityFilter,
  REPORT_STATUSES,
  type ReportStatus,
} from '../services/reportStatusService.js'
import { ApiError } from '../utils/errors.js'
import { createFakeReportDb } from './helpers/fakeReportDb.js'

const ADMIN = { userId: 'admin-1', role: 'admin' }
const OWNER = { userId: 'officer-1', role: 'officer' }
const OTHER_OFFICER = { userId: 'officer-2', role: 'officer' }
const CITIZEN = { userId: 'citizen-1', role: 'citizen' }

type Who = 'staff' | 'owner' | 'admin'

/**
 * The approved transition rules, written out independently of the service's
 * table so a change to one without the other fails here.
 */
const ALLOWED: Array<[ReportStatus, ReportStatus, Who]> = [
  ['new', 'triaged', 'staff'],
  ['new', 'rejected', 'staff'],
  ['triaged', 'rejected', 'staff'],
  ['assigned', 'in_progress', 'owner'],
  ['assigned', 'rejected', 'admin'],
  ['in_progress', 'resolved', 'owner'],
  ['in_progress', 'rejected', 'admin'],
  ['resolved', 'triaged', 'admin'],
  ['rejected', 'triaged', 'admin'],
]

function expectedOutcome(from: ReportStatus, to: ReportStatus, actor: { role: string; userId: string }) {
  if (actor.role === 'citizen') return 403
  if (from === to) return 409
  const rule = ALLOWED.find(([f, t]) => f === from && t === to)
  if (!rule) return 409
  if (actor.role === 'admin') return 200
  const who = rule[2]
  if (who === 'admin') return 403
  if (who === 'owner') return actor.userId === OWNER.userId ? 200 : 403
  return 200
}

async function attempt(
  db: ReturnType<typeof createFakeReportDb>,
  params: Parameters<typeof applyStatusChange>[1]
): Promise<number> {
  try {
    await applyStatusChange(db.tx as unknown as Prisma.TransactionClient, params)
    return 200
  } catch (error) {
    if (error instanceof ApiError) return error.statusCode
    throw error
  }
}

describe('report status service', () => {
  let db: ReturnType<typeof createFakeReportDb>

  beforeEach(() => {
    db = createFakeReportDb()
  })

  describe('transition matrix (manual changes)', () => {
    const actors = { admin: ADMIN, owner: OWNER, otherOfficer: OTHER_OFFICER, citizen: CITIZEN }
    for (const from of REPORT_STATUSES) {
      for (const to of REPORT_STATUSES) {
        if (to === 'assigned') continue // covered by the assign-only tests
        for (const [label, actor] of Object.entries(actors)) {
          const expected = expectedOutcome(from, to, actor)
          it(`${from} -> ${to} by ${label}: ${expected}`, async () => {
            db.addReport('r1', from)
            db.assign('r1', OWNER.userId)

            const status = await attempt(db, { reportId: 'r1', toStatus: to, actor })

            expect(status).toBe(expected)
            const report = db.state.reports.get('r1')!
            if (expected === 200) {
              expect(report.status).toBe(to)
              expect(db.state.history).toHaveLength(1)
              expect(db.state.audit).toHaveLength(1)
            } else {
              expect(report.status).toBe(from)
              expect(db.state.history).toHaveLength(0)
              expect(db.state.audit).toHaveLength(0)
            }
          })
        }
      }
    }
  })

  it('records the actor from the session in history and audit', async () => {
    db.addReport('r1', 'new')

    await applyStatusChange(db.tx as unknown as Prisma.TransactionClient, {
      reportId: 'r1',
      toStatus: 'triaged',
      note: 'looked at it',
      actor: OWNER,
    })

    expect(db.state.history[0]).toMatchObject({
      reportId: 'r1',
      fromStatus: 'new',
      toStatus: 'triaged',
      note: 'looked at it',
      changedBy: OWNER.userId,
    })
    expect(db.state.audit[0]).toMatchObject({
      userId: OWNER.userId,
      action: 'report_status_changed',
      resourceType: 'report',
      resourceId: 'r1',
      details: { fromStatus: 'new', toStatus: 'triaged', source: 'manual' },
    })
  })

  it('uses the latest assignment to decide ownership', async () => {
    db.addReport('r1', 'assigned')
    db.assign('r1', OWNER.userId, new Date('2026-01-01'))
    db.assign('r1', OTHER_OFFICER.userId, new Date('2026-02-01'))

    expect(await attempt(db, { reportId: 'r1', toStatus: 'in_progress', actor: OWNER })).toBe(403)
    expect(await attempt(db, { reportId: 'r1', toStatus: 'in_progress', actor: OTHER_OFFICER })).toBe(200)
  })

  it('lets only admins progress a report assigned only to an organization', async () => {
    db.addReport('r1', 'assigned')
    db.assign('r1', null, new Date(), 'org-1')

    expect(await attempt(db, { reportId: 'r1', toStatus: 'in_progress', actor: OWNER })).toBe(403)
    expect(await attempt(db, { reportId: 'r1', toStatus: 'in_progress', actor: ADMIN })).toBe(200)
  })

  it('returns 404 for a missing report', async () => {
    expect(await attempt(db, { reportId: 'missing', toStatus: 'triaged', actor: ADMIN })).toBe(404)
  })

  it('rejects a change when the status moved since it was read', async () => {
    db.addReport('r1', 'new')
    // Simulate another transaction committing between our read and our update.
    const realFind = db.tx.report.findUnique
    db.tx.report.findUnique = async (args) => {
      const row = await realFind(args)
      db.state.reports.get('r1')!.status = 'rejected'
      return row
    }

    let caught: unknown
    try {
      await applyStatusChange(db.tx as unknown as Prisma.TransactionClient, { reportId: 'r1', toStatus: 'triaged', actor: ADMIN })
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(ApiError)
    expect((caught as ApiError).code).toBe('STATUS_CONFLICT')
    expect(db.state.history).toHaveLength(0)
  })

  describe("'assigned' only via the assign flow", () => {
    it('rejects a manual change to assigned, even for admins', async () => {
      db.addReport('r1', 'new')
      expect(await attempt(db, { reportId: 'r1', toStatus: 'assigned', actor: ADMIN })).toBe(409)
    })

    it.each(['new', 'triaged'] as const)('allows an admin to assign a %s report', async (from) => {
      db.addReport('r1', from)
      expect(await attempt(db, { reportId: 'r1', toStatus: 'assigned', actor: ADMIN, source: 'assign' })).toBe(200)
      expect(db.state.audit[0]).toMatchObject({ details: { source: 'assign' } })
    })

    it.each(['in_progress', 'resolved', 'rejected'] as const)('refuses to assign a %s report', async (from) => {
      db.addReport('r1', from)
      expect(await attempt(db, { reportId: 'r1', toStatus: 'assigned', actor: ADMIN, source: 'assign' })).toBe(409)
    })

    it('refuses the assign flow for officers', async () => {
      db.addReport('r1', 'new')
      expect(await attempt(db, { reportId: 'r1', toStatus: 'assigned', actor: OWNER, source: 'assign' })).toBe(403)
    })

    it('refuses the assign source for any other target status', async () => {
      db.addReport('r1', 'new')
      expect(await attempt(db, { reportId: 'r1', toStatus: 'triaged', actor: ADMIN, source: 'assign' })).toBe(409)
    })
  })

  describe('legacy statuses outside the current set', () => {
    it('lets admins repair them', async () => {
      db.addReport('r1', 'pending')
      expect(await attempt(db, { reportId: 'r1', toStatus: 'triaged', actor: ADMIN })).toBe(200)
    })

    it('blocks officers', async () => {
      db.addReport('r1', 'pending')
      expect(await attempt(db, { reportId: 'r1', toStatus: 'triaged', actor: OWNER })).toBe(403)
    })
  })

  describe('staff visibility filter', () => {
    it('does not restrict admins', () => {
      expect(staffReportVisibilityFilter(ADMIN)).toBeUndefined()
    })

    it('limits officers to the triage queue and their own assignments', () => {
      expect(staffReportVisibilityFilter(OWNER)).toEqual({
        OR: [
          { status: { in: ['new', 'triaged'] } },
          { assignments: { some: { assigneeId: OWNER.userId } } },
        ],
      })
    })
  })
})
