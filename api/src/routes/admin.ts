import type { FastifyInstance, FastifyRequest } from 'fastify'
import { parseOrThrow, assertUuid } from '../utils/validation.js'
import { z } from 'zod'
import { prisma } from '../prisma.js'
import { userRepository } from '../repositories/index.js'
import { assignReportSchema, addCommentSchema, adminListReportsQuerySchema, updateReportStatusSchema, createUserSchema, updatePasswordSchema } from '../schemas.js'
import { ApiError } from '../utils/errors.js'
import { hashPassword } from '../utils/auth.js'
import { authenticateUser, staffAuth, adminAuth, requireAuthenticatedUser } from '../utils/authMiddleware.js'
import { changeReportStatus, applyStatusChange, notifyStatusChange, staffReportVisibilityFilter, TRIAGE_QUEUE_STATUSES } from '../services/reportStatusService.js'
import { getReportNotificationRecipients } from '../utils/notifications.js'
import { enqueueNotification } from '../services/notificationDispatcher.js'
import { logAuditEvent, AuditActions, ResourceTypes } from '../utils/auditLogger.js'

export async function adminRoutes(app: FastifyInstance) {
  // Get detailed report with all history, comments, and assignments
  app.get('/admin/reports/:id', staffAuth, async (req: FastifyRequest<{ Params: { id: string } }>, reply) => {
    const { id } = req.params
    assertUuid(id, 'Invalid report ID format')

    const user = requireAuthenticatedUser(req)
    // Officers only see the triage queue and reports assigned to them; anything
    // else is reported as not found so we don't leak which reports exist.
    const visibility = staffReportVisibilityFilter({ userId: user.userId, role: user.role })

    try {
      const report = await prisma.report.findFirst({
        where: visibility ? { AND: [{ id }, visibility] } : { id },
        select: {
          id: true,
          title: true,
          description: true,
          type: true,
          severity: true,
          status: true,
          latitude: true,
          longitude: true,
          addressText: true,
          province: true,
          district: true,
          sector: true,
          createdAt: true,
          updatedAt: true,
          reporter: {
            select: { id: true, email: true, fullName: true, phone: true },
          },
          photos: {
            orderBy: { createdAt: 'asc' },
            select: {
              id: true,
              url: true,
              caption: true,
              createdAt: true,
            },
          },
          statusHistory: {
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              fromStatus: true,
              toStatus: true,
              note: true,
              createdAt: true,
              changedByUser: {
                select: { id: true, email: true, fullName: true },
              },
            },
          },
          comments: {
            orderBy: { createdAt: 'asc' },
            select: {
              id: true,
              body: true,
              createdAt: true,
              author: {
                select: { id: true, email: true, fullName: true },
              },
            },
          },
          assignments: {
            select: {
              id: true,
              dueAt: true,
              createdAt: true,
              assignee: {
                select: { id: true, email: true, fullName: true },
              },
              organization: {
                select: { id: true, name: true, contactEmail: true, contactPhone: true },
              },
            },
            orderBy: { createdAt: 'desc' },
          },
        },
      })

      if (!report) {
        return reply.code(404).send({
          error: {
            code: 'NOT_FOUND',
            message: 'Report not found',
            requestId: req.id,
          },
        })
      }

      return reply.send({
        id: report.id,
        title: report.title,
        description: report.description,
        type: report.type,
        severity: report.severity,
        status: report.status,
        latitude: Number(report.latitude),
        longitude: Number(report.longitude),
        addressText: report.addressText,
        province: report.province,
        district: report.district,
        sector: report.sector,
        createdAt: report.createdAt.toISOString(),
        updatedAt: report.updatedAt.toISOString(),
        reporter: report.reporter || null,
        photos: report.photos.map((p) => ({
          id: p.id,
          url: p.url,
          caption: p.caption || null,
          createdAt: p.createdAt.toISOString(),
        })),
        statusHistory: report.statusHistory.map((h) => ({
          id: h.id,
          fromStatus: h.fromStatus || null,
          toStatus: h.toStatus,
          note: h.note || null,
          changedBy: h.changedByUser || null,
          createdAt: h.createdAt.toISOString(),
        })),
        comments: report.comments.map((c) => ({
          id: c.id,
          body: c.body,
          author: c.author || null,
          createdAt: c.createdAt.toISOString(),
        })),
        assignments: report.assignments.map((a) => ({
          id: a.id,
          assignee: a.assignee || null,
          organization: a.organization || null,
          dueAt: a.dueAt ? a.dueAt.toISOString() : null,
          createdAt: a.createdAt.toISOString(),
        })),
      })
    } catch (error) {
      app.log.error(error, 'Failed to fetch report details')
      // Log more details for debugging
      if (error instanceof Error) {
        app.log.error({
          message: error.message,
          stack: error.stack,
          name: error.name,
        }, 'Error details for report fetch')
      }
      throw new ApiError(500, 'Failed to fetch report details', 'FETCH_FAILED')
    }
  })

  // List reports with admin filters
  app.get('/admin/reports', staffAuth, async (req: FastifyRequest, reply) => {
    app.log.info({ query: req.query }, 'Admin reports query:')
    const input = parseOrThrow(adminListReportsQuerySchema, req.query, 'Invalid query parameters')

    try {
      const where: any = {}
      
      if (input.bbox) {
        const [minLon, minLat, maxLon, maxLat] = input.bbox.split(',').map(Number)
        where.latitude = { gte: minLat, lte: maxLat }
        where.longitude = { gte: minLon, lte: maxLon }
      }

      if (input.status) {
        where.status = input.status
      }

      if (input.type) {
        where.type = input.type
      }

      if (input.severity) {
        where.severity = input.severity
      }

      if (input.assigneeId || input.organizationId) {
        where.assignments = {
          some: {
            ...(input.assigneeId && { assigneeId: input.assigneeId }),
            ...(input.organizationId && { organizationId: input.organizationId }),
          },
        }
      }

      const user = requireAuthenticatedUser(req)
      const visibility = staffReportVisibilityFilter({ userId: user.userId, role: user.role })
      if (visibility) {
        where.AND = [...(where.AND ?? []), visibility]
      }

      // Query reports with all necessary fields
      const [reports, total] = await Promise.all([
        prisma.report.findMany({
          where,
          take: input.limit,
          skip: input.offset,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            title: true,
            description: true,
            type: true,
            severity: true,
            status: true,
            latitude: true,
            longitude: true,
            district: true,
            sector: true,
            province: true,
            addressText: true,
            createdAt: true,
            updatedAt: true,
            reporter: {
              select: { id: true, email: true, fullName: true },
            },
            assignments: {
              include: {
                assignee: {
                  select: { id: true, email: true, fullName: true },
                },
                organization: {
                  select: { id: true, name: true },
                },
              },
              take: 1,
              orderBy: { createdAt: 'desc' },
            },
            photos: {
              select: {
                id: true,
                url: true,
                caption: true,
                createdAt: true,
              },
              orderBy: { createdAt: 'asc' },
              take: 3, // Limit to first 3 photos for list view
            },
          },
        }),
        prisma.report.count({ where }),
      ])
      
      app.log.info(`Fetched ${reports.length} reports (total: ${total})`)

      return reply.send({
        data: reports.map((r) => ({
          id: r.id,
          title: r.title,
          description: r.description,
          type: r.type,
          severity: r.severity,
          status: r.status,
          latitude: Number(r.latitude),
          longitude: Number(r.longitude),
          district: r.district,
          photos: r.photos.map((p) => ({
            id: p.id,
            url: p.url,
            caption: p.caption,
            createdAt: p.createdAt.toISOString(),
          })),
          sector: r.sector,
          province: r.province,
          createdAt: r.createdAt.toISOString(),
          updatedAt: r.updatedAt.toISOString(),
          reporter: r.reporter,
          currentAssignment: r.assignments[0] ? {
            assignee: r.assignments[0].assignee,
            organization: r.assignments[0].organization,
            dueAt: r.assignments[0].dueAt?.toISOString(),
            createdAt: r.assignments[0].createdAt.toISOString(),
          } : null,
        })),
        meta: {
          total,
          limit: input.limit,
          offset: input.offset,
        },
      })
    } catch (error) {
      if (error instanceof ApiError) throw error
      app.log.error(error, 'Failed to list reports')
      throw new ApiError(500, 'Failed to fetch reports', 'FETCH_FAILED')
    }
  })

  // Assign report to officer or organization
  app.post('/admin/reports/:id/assign', adminAuth, async (req: FastifyRequest<{ Params: { id: string }; Body: unknown }>, reply) => {
    const { id } = req.params
    app.log.info({ id, body: req.body }, 'Assign request:')
    
    assertUuid(id, 'Invalid report ID format')

    // Clean the body - remove undefined values and empty strings
    const cleanedBody: any = {}
    if (req.body && typeof req.body === 'object') {
      const body = req.body as any
      if (body.assigneeId && typeof body.assigneeId === 'string' && body.assigneeId.trim() !== '') {
        cleanedBody.assigneeId = body.assigneeId.trim()
      }
      if (body.organizationId && typeof body.organizationId === 'string' && body.organizationId.trim() !== '') {
        cleanedBody.organizationId = body.organizationId.trim()
      }
      if (body.dueAt && typeof body.dueAt === 'string' && body.dueAt.trim() !== '') {
        cleanedBody.dueAt = body.dueAt.trim()
      }
    }

    app.log.info('Cleaned body:', cleanedBody)

    const input = parseOrThrow(assignReportSchema.extend({ reportId: z.string().uuid() }).omit({ reportId: true }), cleanedBody)

    if (!input.assigneeId && !input.organizationId) {
      return reply.code(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Either assigneeId or organizationId must be provided',
          requestId: req.id,
        },
      })
    }

    try {
      const user = requireAuthenticatedUser(req)

      // Verify report exists
      const report = await prisma.report.findUnique({
        where: { id },
        select: { id: true, status: true, title: true },
      })

      if (!report) {
        return reply.code(404).send({
          error: {
            code: 'NOT_FOUND',
            message: 'Report not found',
            requestId: req.id,
          },
        })
      }

      // Create the assignment and, for reports still in the triage queue, move
      // them to 'assigned' — atomically, so we never keep one without the other.
      const assignment = await prisma.$transaction(async (tx) => {
        const created = await tx.reportAssignment.create({
          data: {
            reportId: id,
            assigneeId: input.assigneeId,
            organizationId: input.organizationId,
            dueAt: input.dueAt ? new Date(input.dueAt) : undefined,
          },
          include: {
            assignee: {
              select: { id: true, email: true, fullName: true },
            },
            organization: {
              select: { id: true, name: true, contactEmail: true, contactPhone: true },
            },
          },
        })

        if (TRIAGE_QUEUE_STATUSES.includes(report.status as (typeof TRIAGE_QUEUE_STATUSES)[number])) {
          await applyStatusChange(tx, {
            reportId: id,
            toStatus: 'assigned',
            note: `Report assigned${created.assignee ? ` to ${created.assignee.fullName || created.assignee.email}` : ''}${created.organization ? ` to ${created.organization.name}` : ''}`,
            actor: { userId: user.userId, role: user.role },
            source: 'assign',
          })
        }

        return created
      })

      // Log audit event
      await logAuditEvent({
        userId: user.userId,
        action: AuditActions.REPORT_ASSIGNED,
        resourceType: ResourceTypes.ASSIGNMENT,
        resourceId: assignment.id,
        details: { 
          reportId: id, 
          assigneeId: input.assigneeId,
          organizationId: input.organizationId,
        },
      })

      const reportWithTitle = { title: report.title }

      // Notify the assigned officer (after the response).
      if (assignment.assigneeId) {
        enqueueNotification({
          recipients: [assignment.assigneeId],
          type: 'report_assigned',
          title: 'Report Assigned to You',
          body: `Report "${reportWithTitle.title || 'Untitled'}" has been assigned to you`,
          data: {
            reportId: id,
            reportTitle: reportWithTitle.title,
            assigneeId: assignment.assigneeId,
            organizationId: assignment.organizationId || undefined,
          },
          push: {
            body: `"${reportWithTitle.title || 'Untitled'}"`,
            data: { reportId: id, type: 'report_assigned' },
          },
        }, app.log)
      }

      return reply.code(201).send({
        id: assignment.id,
        reportId: assignment.reportId,
        assignee: assignment.assignee,
        organization: assignment.organization,
        dueAt: assignment.dueAt?.toISOString(),
        createdAt: assignment.createdAt.toISOString(),
      })
    } catch (error) {
      if (error instanceof ApiError) throw error
      app.log.error(error, 'Failed to assign report')
      throw new ApiError(500, 'Failed to assign report', 'ASSIGN_FAILED')
    }
  })

  // Add comment to report
  app.post('/admin/reports/:id/comments', staffAuth, async (req: FastifyRequest<{ Params: { id: string }; Body: unknown }>, reply) => {
    const { id } = req.params
    assertUuid(id, 'Invalid report ID format')

    const input = parseOrThrow(addCommentSchema.extend({ reportId: z.string().uuid() }).omit({ reportId: true }), req.body)

    // The author is always the signed-in staff member, never a body field.
    const user = requireAuthenticatedUser(req)
    // Officers may only comment on reports they can see (same rule as the detail view).
    const visibility = staffReportVisibilityFilter({ userId: user.userId, role: user.role })

    try {
      const reportForComment = await prisma.report.findFirst({
        where: visibility ? { AND: [{ id }, visibility] } : { id },
        select: { id: true, title: true },
      })

      if (!reportForComment) {
        return reply.code(404).send({
          error: {
            code: 'NOT_FOUND',
            message: 'Report not found',
            requestId: req.id,
          },
        })
      }

      const comment = await prisma.reportComment.create({
        data: {
          reportId: id,
          body: input.body,
          authorId: user.userId,
        },
        include: {
          author: {
            select: { id: true, email: true, fullName: true },
          },
        },
      })

      // Log audit event
      await logAuditEvent({
        userId: user.userId,
        action: AuditActions.REPORT_COMMENT_ADDED,
        resourceType: ResourceTypes.COMMENT,
        resourceId: comment.id,
        details: { reportId: id },
      })

      // Notify reporter and assigned officer about the comment (after the response).
      const commenterName = comment.author?.fullName || comment.author?.email || 'Someone'
      enqueueNotification({
        recipients: () => getReportNotificationRecipients(id),
        excludeUserId: user.userId,
        type: 'report_commented',
        title: 'New Comment on Report',
        body: `${commenterName} commented on "${reportForComment?.title || 'Untitled'}"`,
        data: { reportId: id, reportTitle: reportForComment?.title, commentId: comment.id },
        push: { data: { reportId: id, type: 'report_commented', commentId: comment.id } },
      }, app.log)

      return reply.code(201).send({
        id: comment.id,
        body: comment.body,
        author: comment.author,
        createdAt: comment.createdAt.toISOString(),
      })
    } catch (error) {
      app.log.error(error, 'Failed to add comment')
      throw new ApiError(500, 'Failed to add comment', 'COMMENT_FAILED')
    }
  })

  // Update report status. The actor always comes from the session; transition
  // rules and officer ownership are enforced by the status service.
  app.patch('/admin/reports/:id/status', staffAuth, async (req: FastifyRequest<{ Params: { id: string }; Body: unknown }>, reply) => {
    const { id } = req.params
    assertUuid(id, 'Invalid report ID format')

    // Unknown keys (including a legacy client-sent changedBy) are stripped and ignored.
    const input = parseOrThrow(updateReportStatusSchema, req.body)

    const user = requireAuthenticatedUser(req)

    try {
      const { report } = await changeReportStatus({
        reportId: id,
        toStatus: input.status,
        note: input.note,
        actor: { userId: user.userId, role: user.role },
      })

      notifyStatusChange(report, report.status, app.log)

      return reply.send({
        id: report.id,
        title: report.title,
        status: report.status,
        updatedAt: report.updatedAt.toISOString(),
      })
    } catch (error) {
      if (error instanceof ApiError) throw error
      app.log.error(error, 'Failed to update report status')
      throw new ApiError(500, 'Failed to update report status', 'UPDATE_FAILED')
    }
  })

  // Get organizations list
  app.get('/admin/organizations', adminAuth, async (req: FastifyRequest, reply) => {
    try {
      const organizations = await prisma.organization.findMany({
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          contactEmail: true,
          contactPhone: true,
        },
      })

      return reply.send({ data: organizations })
    } catch (error) {
      app.log.error(error, 'Failed to fetch organizations')
      throw new ApiError(500, 'Failed to fetch organizations', 'FETCH_FAILED')
    }
  })

  // Get officers/users list
  app.get('/admin/users', adminAuth, async (req: FastifyRequest, reply) => {
    try {
      const role = (req.query as any).role as string | undefined
      app.log.info({ role }, 'Fetching users with role:')
      const where = role ? { role } : {}

      const users = await prisma.userAccount.findMany({
        where,
        orderBy: { fullName: 'asc' },
        select: {
          id: true,
          email: true,
          fullName: true,
          phone: true,
          role: true,
        },
      })

      app.log.info({ count: users.length, filter: where }, `Found ${users.length} users with role filter:`)
      app.log.info({ users: users.map(u => ({ id: u.id, email: u.email, role: u.role })) }, 'Users:')

      return reply.send({ data: users })
    } catch (error) {
      app.log.error(error, 'Failed to fetch users')
      throw new ApiError(500, 'Failed to fetch users', 'FETCH_FAILED')
    }
  })

  // Create user/officer
  app.post('/admin/users', adminAuth, async (req: FastifyRequest, reply) => {
    app.log.info({ body: req.body }, 'Creating user with data:')
    
    const input = parseOrThrow(createUserSchema, req.body)

    try {
      // Check if user with email already exists
      const existing = await userRepository.findByEmail(input.email)

      if (existing) {
        return reply.code(409).send({
          error: {
            code: 'DUPLICATE_EMAIL',
            message: 'User with this email already exists',
            requestId: req.id,
          },
        })
      }

      // Hash password
      const passwordHash = await hashPassword(input.password)

      // Prepare data - convert empty strings to null
      const userData: {
        email: string
        passwordHash: string
        fullName: string | null
        phone: string | null
        role: string
        emailVerified: boolean
      } = {
        email: input.email,
        passwordHash,
        fullName: (input.fullName && input.fullName.trim().length > 0) ? input.fullName.trim() : null,
        phone: (input.phone && input.phone.trim().length > 0) ? input.phone.trim() : null,
        role: input.role || 'officer',
        // Admin-provisioned accounts are vouched for; password login requires this.
        emailVerified: true,
      }

      app.log.info({ ...userData, passwordHash: '[HIDDEN]' }, 'Creating user with data:')

      const user = await prisma.userAccount.create({
        data: userData,
        select: {
          id: true,
          email: true,
          fullName: true,
          phone: true,
          role: true,
        },
      })

      app.log.info({ userId: user.id }, 'User created successfully:')

      // Log audit event
      const adminUserId = (req.user as any)?.userId
      await logAuditEvent({
        userId: adminUserId,
        action: AuditActions.USER_CREATED,
        resourceType: ResourceTypes.USER,
        resourceId: user.id,
        details: { email: user.email, role: user.role },
      })

      return reply.code(201).send({ data: user })
    } catch (error: any) {
      app.log.error({ error, stack: error.stack }, 'Failed to create user')
      if (error.code === 'P2002') {
        // Prisma unique constraint violation
        return reply.code(409).send({
          error: {
            code: 'DUPLICATE_EMAIL',
            message: 'User with this email already exists',
            requestId: req.id,
          },
        })
      }
      throw new ApiError(500, `Failed to create user: ${error.message}`, 'CREATE_FAILED')
    }
  })

  // Update user password
  app.put('/admin/users/:userId/password', { preHandler: authenticateUser }, async (req: FastifyRequest, reply) => {
    const input = parseOrThrow(updatePasswordSchema, req.body)

    try {
      const { userId } = req.params as { userId: string }

      // Check authentication
      if (!req.user) {
        return reply.code(401).send({
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required',
            requestId: req.id,
          },
        })
      }

      // Authorization: Users can only change their own password, unless they're an admin
      const currentUser = req.user as any
      if (currentUser.userId !== userId && currentUser.role !== 'admin') {
        return reply.code(403).send({
          error: {
            code: 'FORBIDDEN',
            message: 'You can only change your own password',
            requestId: req.id,
          },
        })
      }

      // Check if user exists
      const userToUpdate = await prisma.userAccount.findUnique({
        where: { id: userId },
      })

      if (!userToUpdate) {
        return reply.code(404).send({
          error: {
            code: 'USER_NOT_FOUND',
            message: 'User not found',
            requestId: req.id,
          },
        })
      }

      // Hash new password
      const passwordHash = await hashPassword(input.password)

      // Update password and revoke the user's existing sessions
      await prisma.userAccount.update({
        where: { id: userId },
        data: { passwordHash, tokenVersion: { increment: 1 } },
      })

      app.log.info({ userId }, 'Password updated successfully for user:')
      return reply.code(200).send({
        message: 'Password updated successfully',
      })
    } catch (error: any) {
      app.log.error({ error, stack: error.stack }, 'Failed to update password')
      throw new ApiError(500, `Failed to update password: ${error.message}`, 'UPDATE_FAILED')
    }
  })

  // Auto-assign reports to available officers
  app.post('/admin/reports/auto-assign', adminAuth, async (req: FastifyRequest, reply) => {
    try {
      // Check authentication (should be handled by middleware, but double-check)
      if (!req.user) {
        app.log.warn('Auto-assign: No user in request')
        return reply.code(401).send({
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required',
            requestId: req.id,
          },
        })
      }

      const currentUser = req.user as any
      app.log.info({ userId: currentUser?.userId, role: currentUser?.role }, 'Auto-assign request received')

      // Check if user is admin
      if (currentUser.role !== 'admin') {
        app.log.warn({ userId: currentUser.userId, role: currentUser.role }, 'Auto-assign: User is not admin')
        return reply.code(403).send({
          error: {
            code: 'FORBIDDEN',
            message: 'Only administrators can auto-assign reports',
            requestId: req.id,
          },
        })
      }

      // Get all officers
      const officers = await prisma.userAccount.findMany({
        where: { role: 'officer' },
        select: { id: true, email: true, fullName: true },
      })

      if (officers.length === 0) {
        return reply.code(200).send({
          message: 'No officers available for assignment. Please create officers first.',
          assigned: 0,
          data: [],
        })
      }

      // Get all unassigned reports (new or triaged status)
      const unassignedReports = await prisma.report.findMany({
        where: {
          status: { in: ['new', 'triaged'] },
          assignments: { none: {} }, // No assignments exist
        },
        select: { id: true, title: true, status: true },
        orderBy: { createdAt: 'asc' }, // Oldest first
      })

      if (unassignedReports.length === 0) {
        return reply.send({
          message: 'No unassigned reports to assign',
          assigned: 0,
          data: [],
        })
      }

      // Get current assignments to find officers with existing assignments
      const currentAssignments = await prisma.reportAssignment.findMany({
        where: {
          assigneeId: { in: officers.map(o => o.id) },
          report: {
            status: { notIn: ['resolved', 'rejected'] },
          },
        },
        select: { assigneeId: true },
      })

      // Count assignments per officer
      const assignmentCounts = new Map<string, number>()
      officers.forEach(officer => {
        assignmentCounts.set(officer.id, 0)
      })
      currentAssignments.forEach(assignment => {
        if (assignment.assigneeId) {
          assignmentCounts.set(
            assignment.assigneeId,
            (assignmentCounts.get(assignment.assigneeId) || 0) + 1
          )
        }
      })

      // Sort officers by assignment count (least assigned first)
      const availableOfficers = [...officers].sort((a, b) => {
        const countA = assignmentCounts.get(a.id) || 0
        const countB = assignmentCounts.get(b.id) || 0
        return countA - countB
      })

      // Assign reports to officers in round-robin fashion
      const assignments = []
      for (let i = 0; i < unassignedReports.length; i++) {
        const report = unassignedReports[i]
        const officer = availableOfficers[i % availableOfficers.length]

        try {
          // Create the assignment and move the report to 'assigned' atomically.
          const assignment = await prisma.$transaction(async (tx) => {
            const created = await tx.reportAssignment.create({
              data: {
                reportId: report.id,
                assigneeId: officer.id,
              },
              include: {
                assignee: {
                  select: { id: true, email: true, fullName: true },
                },
              },
            })

            await applyStatusChange(tx, {
              reportId: report.id,
              toStatus: 'assigned',
              note: `Auto-assigned to ${officer.fullName || officer.email}`,
              actor: { userId: currentUser.userId, role: currentUser.role },
              source: 'assign',
            })

            return created
          })

          assignments.push({
            reportId: assignment.reportId,
            assignee: assignment.assignee,
          })
        } catch (error) {
          app.log.error({ error, reportId: report.id, officerId: officer.id }, 'Failed to assign report')
          // Continue with next report
        }
      }

      app.log.info(`Auto-assigned ${assignments.length} reports to ${availableOfficers.length} officers`)

      return reply.code(200).send({
        message: `Successfully assigned ${assignments.length} reports`,
        assigned: assignments.length,
        data: assignments,
      })
    } catch (error: any) {
      app.log.error({ error, stack: error?.stack, message: error?.message }, 'Failed to auto-assign reports')
      
      // If it's already an ApiError, re-throw it
      if (error instanceof ApiError) {
        throw error
      }
      
      // If it's a known error with status code, preserve it
      if (error?.statusCode) {
        throw new ApiError(error.statusCode, error.message || 'Failed to auto-assign reports', 'AUTO_ASSIGN_FAILED', error)
      }
      
      // Otherwise, throw generic error
      throw new ApiError(500, error?.message || 'Failed to auto-assign reports', 'AUTO_ASSIGN_FAILED', error)
    }
  })

  // Get officer metrics (cases and success rate)
  app.get('/admin/officers/metrics', staffAuth, async (req: FastifyRequest, reply) => {
    try {
      // Get all officers
      const officers = await prisma.userAccount.findMany({
        where: { role: 'officer' },
        select: {
          id: true,
          email: true,
          fullName: true,
        },
        orderBy: { fullName: 'asc' },
      })

      // Get metrics for each officer
      const officerMetrics = await Promise.all(
        officers.map(async (officer) => {
          // Get all reports assigned to this officer (current assignments)
          const assignments = await prisma.reportAssignment.findMany({
            where: {
              assigneeId: officer.id,
            },
            include: {
              report: {
                select: {
                  id: true,
                  status: true,
                },
              },
            },
          })

          // Count total cases (unique reports assigned to this officer)
          const uniqueReportIds = new Set(assignments.map(a => a.reportId))
          const totalCases = uniqueReportIds.size

          // Count resolved cases (unique reports that are resolved)
          const resolvedReportIds = new Set(
            assignments
              .filter(a => a.report.status === 'resolved')
              .map(a => a.reportId)
          )
          const resolvedCases = resolvedReportIds.size

          // Calculate success rate (resolved / total, as percentage)
          const successRate = totalCases > 0 
            ? Math.round((resolvedCases / totalCases) * 100) 
            : 0

          return {
            officerId: officer.id,
            officerName: officer.fullName || officer.email,
            officerEmail: officer.email,
            totalCases,
            resolvedCases,
            successRate,
          }
        })
      )

      // Sort by total cases (descending) then by success rate (descending)
      officerMetrics.sort((a, b) => {
        if (b.totalCases !== a.totalCases) {
          return b.totalCases - a.totalCases
        }
        return b.successRate - a.successRate
      })

      return reply.send({
        data: officerMetrics,
      })
    } catch (error) {
      app.log.error(error, 'Failed to fetch officer metrics')
      throw new ApiError(500, 'Failed to fetch officer metrics', 'FETCH_METRICS_FAILED')
    }
  })
}

