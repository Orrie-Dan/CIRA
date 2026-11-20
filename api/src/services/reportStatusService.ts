import type { Prisma } from '@prisma/client'
import { prisma } from '../prisma.js'
import { ApiError } from '../utils/errors.js'
import { AuditActions, ResourceTypes } from '../utils/auditLogger.js'
import { getReportNotificationRecipients } from '../utils/notifications.js'
import { enqueueNotification } from './notificationDispatcher.js'

export const REPORT_STATUSES = ['new', 'triaged', 'assigned', 'in_progress', 'resolved', 'rejected'] as const
export type ReportStatus = (typeof REPORT_STATUSES)[number]

/** Statuses an unassigned report sits in while waiting for triage/assignment. */
export const TRIAGE_QUEUE_STATUSES: ReportStatus[] = ['new', 'triaged']

/**
 * Who may perform a transition:
 * - staff: any admin or officer
 * - owner: an admin, or the officer on the report's latest assignment
 * - admin: admins only
 */
type Permission = 'staff' | 'owner' | 'admin'

/**
 * Allowed manual transitions. 'assigned' is deliberately absent: it can only be
 * reached through the assign flow (see `source: 'assign'`), so a report is never
 * "assigned" to nobody.
 */
export const STATUS_TRANSITIONS: Record<ReportStatus, Partial<Record<ReportStatus, Permission>>> = {
  new: { triaged: 'staff', rejected: 'staff' },
  triaged: { rejected: 'staff' },
  assigned: { in_progress: 'owner', rejected: 'admin' },
  in_progress: { resolved: 'owner', rejected: 'admin' },
  resolved: { triaged: 'admin' },
  rejected: { triaged: 'admin' },
}

export interface StatusActor {
  userId: string
  role: string
}

export interface ChangeReportStatusParams {
  reportId: string
  toStatus: ReportStatus
  note?: string
  actor: StatusActor
  /** 'assign' is only used by the assignment flows to move a report into 'assigned'. */
  source?: 'manual' | 'assign'
}

export interface StatusChangeResult {
  report: { id: string; title: string; status: string; updatedAt: Date }
  fromStatus: string
}

function isReportStatus(value: string): value is ReportStatus {
  return (REPORT_STATUSES as readonly string[]).includes(value)
}

function isStaff(role: string) {
  return role === 'admin' || role === 'officer'
}

/** The assignee of the report's most recent assignment, if any. */
export async function getCurrentAssigneeId(
  db: Prisma.TransactionClient,
  reportId: string
): Promise<string | null> {
  const latest = await db.reportAssignment.findFirst({
    where: { reportId },
    orderBy: { createdAt: 'desc' },
    select: { assigneeId: true },
  })
  return latest?.assigneeId ?? null
}

/**
 * Prisma filter for the reports an officer may read on the staff endpoints:
 * the triage queue plus anything that has ever been assigned to them.
 * Returns undefined for admins (no restriction).
 */
export function staffReportVisibilityFilter(actor: StatusActor): Prisma.ReportWhereInput | undefined {
  if (actor.role === 'admin') return undefined
  return {
    OR: [
      { status: { in: TRIAGE_QUEUE_STATUSES } },
      { assignments: { some: { assigneeId: actor.userId } } },
    ],
  }
}

async function assertAllowed(
  db: Prisma.TransactionClient,
  reportId: string,
  from: string,
  to: ReportStatus,
  actor: StatusActor,
  source: 'manual' | 'assign'
) {
  if (!isStaff(actor.role)) {
    throw new ApiError(403, 'Insufficient permissions', 'FORBIDDEN')
  }

  if (from === to) {
    throw new ApiError(409, `Report is already ${to}`, 'INVALID_TRANSITION')
  }

  if (to === 'assigned' || source === 'assign') {
    if (source !== 'assign' || to !== 'assigned') {
      throw new ApiError(409, 'Reports can only be moved to assigned by assigning them', 'INVALID_TRANSITION')
    }
    if (actor.role !== 'admin') {
      throw new ApiError(403, 'Only administrators can assign reports', 'FORBIDDEN_TRANSITION')
    }
    if (!TRIAGE_QUEUE_STATUSES.includes(from as ReportStatus)) {
      throw new ApiError(409, `Cannot assign a report that is ${from}`, 'INVALID_TRANSITION')
    }
    return
  }

  // Legacy rows may hold a status outside the current set; only admins may repair them.
  if (!isReportStatus(from)) {
    if (actor.role !== 'admin') {
      throw new ApiError(403, `Only administrators can change a report with status "${from}"`, 'FORBIDDEN_TRANSITION')
    }
    return
  }

  const permission = STATUS_TRANSITIONS[from][to]
  if (!permission) {
    throw new ApiError(409, `Cannot change status from ${from} to ${to}`, 'INVALID_TRANSITION')
  }

  if (actor.role === 'admin') return

  if (permission === 'admin') {
    throw new ApiError(403, `Only administrators can change status from ${from} to ${to}`, 'FORBIDDEN_TRANSITION')
  }

  if (permission === 'owner') {
    const assigneeId = await getCurrentAssigneeId(db, reportId)
    if (assigneeId !== actor.userId) {
      throw new ApiError(403, 'This report is not assigned to you', 'NOT_ASSIGNED')
    }
  }
}

/**
 * Applies a status change inside an existing transaction: checks the transition
 * rules, updates the report (guarded against concurrent changes), and writes the
 * history row and audit entry. The actor always comes from the verified session.
 */
export async function applyStatusChange(
  tx: Prisma.TransactionClient,
  params: ChangeReportStatusParams
): Promise<StatusChangeResult> {
  const { reportId, toStatus, actor } = params
  const source = params.source ?? 'manual'

  const current = await tx.report.findUnique({
    where: { id: reportId },
    select: { status: true },
  })
  if (!current) {
    throw new ApiError(404, 'Report not found', 'NOT_FOUND')
  }

  const fromStatus = current.status
  await assertAllowed(tx, reportId, fromStatus, toStatus, actor, source)

  // Only apply if nobody changed the status since we read it.
  const updated = await tx.report.updateMany({
    where: { id: reportId, status: fromStatus },
    data: { status: toStatus, updatedAt: new Date() },
  })
  if (updated.count === 0) {
    throw new ApiError(409, 'The report status was changed by someone else. Reload and try again.', 'STATUS_CONFLICT')
  }

  await tx.reportStatusHistory.create({
    data: {
      reportId,
      fromStatus,
      toStatus,
      note: params.note || `Status changed to ${toStatus}`,
      changedBy: actor.userId,
    },
  })

  await tx.auditLog.create({
    data: {
      userId: actor.userId,
      action: AuditActions.REPORT_STATUS_CHANGED,
      resourceType: ResourceTypes.REPORT,
      resourceId: reportId,
      details: { fromStatus, toStatus, source } as Prisma.InputJsonValue,
    },
  })

  const report = await tx.report.findUniqueOrThrow({
    where: { id: reportId },
    select: { id: true, title: true, status: true, updatedAt: true },
  })

  return { report, fromStatus }
}

/** Runs `applyStatusChange` in its own transaction. */
export function changeReportStatus(params: ChangeReportStatusParams): Promise<StatusChangeResult> {
  return prisma.$transaction((tx) => applyStatusChange(tx, params))
}

/**
 * Tells the reporter and assigned officer about a status change (in-app,
 * push, SSE) after the response. Never throws: a notification failure must
 * not fail the change.
 */
export function notifyStatusChange(
  report: { id: string; title: string },
  status: string,
  log: { error: (obj: unknown, msg?: string) => void },
  options: { excludeUserId?: string } = {}
): void {
  enqueueNotification({
    recipients: () => getReportNotificationRecipients(report.id),
    excludeUserId: options.excludeUserId,
    type: 'report_status_changed',
    title: 'Report Status Updated',
    body: `Report "${report.title}" status changed to ${status}`,
    data: { reportId: report.id, reportTitle: report.title, status },
    push: {
      body: `"${report.title}" is now ${status}`,
      data: { reportId: report.id, type: 'report_status_changed', status },
    },
  }, log)
}

/**
 * Notifications for a new assignment (manual or auto), after the response:
 * the assigned officer gets "assigned to you", and when the assignment moved
 * the report into 'assigned', the reporter gets the usual status-change
 * notification. The assignee is left out of the latter so they aren't told twice.
 * Re-assigning a report that is already past triage changes no status, so the
 * reporter is not notified.
 */
export function notifyAssignment(
  assignment: { reportId: string; reportTitle: string; assigneeId: string | null; organizationId: string | null },
  statusChanged: boolean,
  log: { error: (obj: unknown, msg?: string) => void }
): void {
  const { reportId, reportTitle, assigneeId, organizationId } = assignment
  const title = reportTitle || 'Untitled'

  if (assigneeId) {
    enqueueNotification({
      recipients: [assigneeId],
      type: 'report_assigned',
      title: 'Report Assigned to You',
      body: `Report "${title}" has been assigned to you`,
      data: { reportId, reportTitle, assigneeId, organizationId: organizationId || undefined },
      push: {
        body: `"${title}"`,
        data: { reportId, type: 'report_assigned' },
      },
    }, log)
  }

  if (statusChanged) {
    notifyStatusChange({ id: reportId, title: reportTitle }, 'assigned', log, { excludeUserId: assigneeId ?? undefined })
  }
}
