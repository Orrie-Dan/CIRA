/**
 * Minimal in-memory stand-in for the Prisma calls the report status code makes.
 * Only implements the filters those calls actually use.
 */
export interface FakeReport {
  id: string
  title: string
  status: string
  reporterId: string | null
  updatedAt: Date
}

export interface FakeAssignment {
  reportId: string
  assigneeId: string | null
  organizationId?: string | null
  createdAt: Date
}

export function createFakeReportDb() {
  const state = {
    reports: new Map<string, FakeReport>(),
    assignments: [] as FakeAssignment[],
    history: [] as Array<Record<string, unknown>>,
    audit: [] as Array<Record<string, unknown>>,
  }

  const tx = {
    report: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const r = state.reports.get(where.id)
        return r ? { ...r } : null
      },
      findUniqueOrThrow: async ({ where }: { where: { id: string } }) => {
        const r = state.reports.get(where.id)
        if (!r) throw new Error('not found')
        return { id: r.id, title: r.title, status: r.status, updatedAt: r.updatedAt }
      },
      updateMany: async ({ where, data }: { where: { id: string; status: string }; data: { status: string; updatedAt: Date } }) => {
        const r = state.reports.get(where.id)
        if (!r || r.status !== where.status) return { count: 0 }
        r.status = data.status
        r.updatedAt = data.updatedAt
        return { count: 1 }
      },
    },
    reportAssignment: {
      findFirst: async ({ where }: { where: { reportId: string } }) => {
        const rows = state.assignments
          .filter((a) => a.reportId === where.reportId)
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        return rows[0] ? { assigneeId: rows[0].assigneeId } : null
      },
    },
    reportStatusHistory: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        state.history.push(data)
        return data
      },
    },
    auditLog: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        state.audit.push(data)
        return data
      },
    },
  }

  function addReport(id: string, status: string, extra: Partial<FakeReport> = {}) {
    state.reports.set(id, { id, title: `Report ${id}`, status, reporterId: null, updatedAt: new Date(0), ...extra })
  }

  function assign(reportId: string, assigneeId: string | null, createdAt = new Date(), organizationId: string | null = null) {
    state.assignments.push({ reportId, assigneeId, organizationId, createdAt })
  }

  return { state, tx, addReport, assign }
}
