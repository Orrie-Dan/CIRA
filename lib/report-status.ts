/**
 * Client-side mirror of the API's report status rules
 * (api/src/services/reportStatusService.ts). The API is the authority; this
 * only decides which actions the UI offers. Keep the two tables in sync.
 */
export type ReportStatus = 'new' | 'triaged' | 'assigned' | 'in_progress' | 'resolved' | 'rejected'

type Permission = 'staff' | 'owner' | 'admin'

// 'assigned' is never a manual target: it is set by assigning the report.
const STATUS_TRANSITIONS: Record<ReportStatus, Partial<Record<ReportStatus, Permission>>> = {
  new: { triaged: 'staff', rejected: 'staff' },
  triaged: { rejected: 'staff' },
  assigned: { in_progress: 'owner', rejected: 'admin' },
  in_progress: { resolved: 'owner', rejected: 'admin' },
  resolved: { triaged: 'admin' },
  rejected: { triaged: 'admin' },
}

const ALL_STATUSES: ReportStatus[] = ['new', 'triaged', 'assigned', 'in_progress', 'resolved', 'rejected']

/**
 * Statuses the given user may move a report to from `from`.
 * `isCurrentAssignee` = the user is the assignee on the report's latest assignment.
 */
export function allowedNextStatuses(
  from: string,
  role: string | undefined,
  isCurrentAssignee: boolean
): ReportStatus[] {
  if (role !== 'admin' && role !== 'officer') return []

  const rules = STATUS_TRANSITIONS[from as ReportStatus]
  if (!rules) {
    // Legacy status outside the current set: only admins may repair it.
    return role === 'admin' ? ALL_STATUSES.filter((s) => s !== 'assigned') : []
  }

  return (Object.entries(rules) as Array<[ReportStatus, Permission]>)
    .filter(([, permission]) => {
      if (role === 'admin') return true
      if (permission === 'admin') return false
      if (permission === 'owner') return isCurrentAssignee
      return true
    })
    .map(([to]) => to)
}

/** Assignee id on the most recent assignment, if any. */
export function currentAssigneeId(
  assignments: Array<{ createdAt: string; assignee?: { id: string } | null }> | undefined
): string | undefined {
  if (!assignments || assignments.length === 0) return undefined
  const latest = [...assignments].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )[0]
  return latest.assignee?.id
}

export const STATUS_LABELS: Record<ReportStatus, string> = {
  new: 'New',
  triaged: 'Triaged',
  assigned: 'Assigned',
  in_progress: 'In Progress',
  resolved: 'Resolved',
  rejected: 'Rejected',
}
