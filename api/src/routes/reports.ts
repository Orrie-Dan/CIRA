import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { prisma } from '../prisma.js'
import { createReportSchema, updateReportStatusSchema, listReportsQuerySchema } from '../schemas.js'
import { ApiError } from '../utils/errors.js'
import { limits } from '../utils/rateLimit.js'
import { zodToJsonSchemaFastify } from '../utils/swagger.js'
import { notifyUsers, getReportNotificationRecipients } from '../utils/notifications.js'
import { getOfficersAndAdmins } from '../utils/notifications.js'
import { sendPushNotificationsToUsers } from '../utils/pushNotifications.js'
import { broadcastNotificationToUser } from './notifications.js'
import { authenticateUser, optionalAuthenticate, getAuthenticatedUser, requireAuthenticatedUser, reportMutationAuth } from '../utils/authMiddleware.js'
import { changeReportStatus, notifyStatusChange } from '../services/reportStatusService.js'
import { logAuditEvent, AuditActions, ResourceTypes } from '../utils/auditLogger.js'
import { createReportWithHistory } from '../services/reportService.js'

export async function reportsRoutes(app: FastifyInstance) {
  // Create report
  app.post('/reports', {
    preHandler: optionalAuthenticate,
    config: { rateLimit: limits.createReport },
    schema: {
      description: 'Create a new infrastructure report',
      tags: ['reports'],
      body: zodToJsonSchemaFastify(createReportSchema),
      response: {
        201: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            title: { type: 'string' },
            description: { type: 'string' },
            type: { type: 'string' },
            severity: { type: 'string', enum: ['low', 'medium', 'high'] },
            status: { type: 'string' },
            latitude: { type: 'number' },
            longitude: { type: 'number' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        400: {
          type: 'object',
          properties: {
            error: {
              type: 'object',
              properties: {
                code: { type: 'string' },
                message: { type: 'string' },
                details: { type: 'object' },
                requestId: { type: 'string' },
              },
            },
          },
        },
        429: {
          type: 'object',
          properties: {
            error: {
              type: 'object',
              properties: {
                code: { type: 'string' },
                message: { type: 'string' },
                details: { type: 'object', properties: { retryAfter: { type: 'string' } } },
                requestId: { type: 'string' },
              },
            },
          },
        },
      },
    },
  }, async (req: FastifyRequest, reply) => {
    app.log.info({ body: req.body }, 'Creating report with data:')
    const parsed = createReportSchema.safeParse(req.body)
    if (!parsed.success) {
      app.log.warn({ error: parsed.error.flatten() }, 'Validation failed:')
      return reply.code(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request data',
          details: parsed.error.flatten(),
          requestId: req.id,
        },
      })
    }

    try {
      const authenticatedUser = getAuthenticatedUser(req)
      const reporterId = authenticatedUser?.userId

      const report = await createReportWithHistory({
        title: parsed.data.title,
        description: parsed.data.description,
        type: parsed.data.type,
        severity: parsed.data.severity,
        latitude: parsed.data.latitude,
        longitude: parsed.data.longitude,
        addressText: parsed.data.addressText,
        province: parsed.data.province,
        district: parsed.data.district,
        sector: parsed.data.sector,
        reporterId,
      })

      // Log audit event
      await logAuditEvent({
        userId: reporterId || undefined,
        action: AuditActions.REPORT_CREATED,
        resourceType: ResourceTypes.REPORT,
        resourceId: report.id,
        details: { type: report.type, severity: report.severity },
      })

      // Notify officers and admins about new report
      try {
        const officersAndAdmins = await getOfficersAndAdmins()
        const userIds = officersAndAdmins.map((u) => u.id)
        
        if (userIds.length > 0) {
          await notifyUsers(
            userIds,
            'report_created',
            'New Report Created',
            `A new ${report.type} report has been created: ${report.title}`,
            {
              reportId: report.id,
              reportTitle: report.title,
            }
          )

          // Send push notifications
          await sendPushNotificationsToUsers(
            userIds,
            'New Report Created',
            `${report.title}`,
            { reportId: report.id, type: 'report_created' }
          )

          // Broadcast via SSE
          userIds.forEach((userId) => {
            broadcastNotificationToUser(userId, {
              type: 'report_created',
              title: 'New Report Created',
              body: `A new ${report.type} report has been created: ${report.title}`,
              data: { reportId: report.id, reportTitle: report.title },
            })
          })
        }
      } catch (notifError) {
        app.log.error(notifError, 'Failed to send notifications for new report')
        // Don't fail the request if notifications fail
      }

      return reply.code(201).send({
        id: report.id,
        title: report.title,
        description: report.description,
        type: report.type,
        severity: report.severity,
        status: report.status,
        latitude: Number(report.latitude),
        longitude: Number(report.longitude),
        createdAt: report.createdAt.toISOString(),
      })
    } catch (error) {
      app.log.error(error, 'Failed to create report')
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      const errorStack = error instanceof Error ? error.stack : undefined
      app.log.error({ errorMessage, errorStack, body: req.body }, 'Error details:')
      return reply.code(500).send({
        error: {
          code: 'CREATE_FAILED',
          message: 'Failed to create report',
          details: errorMessage,
          requestId: req.id,
        },
      })
    }
  })

  // List reports with filters
  app.get('/reports', {
    // Public, but recognises the caller when a token is sent (needed for myReports).
    preHandler: optionalAuthenticate,
    schema: {
      description: 'List reports with optional filters (bbox, status, type)',
      tags: ['reports'],
      querystring: zodToJsonSchemaFastify(listReportsQuerySchema),
      response: {
        200: {
          type: 'object',
          properties: {
            data: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  title: { type: 'string' },
                  description: { type: 'string' },
                  type: { type: 'string' },
                  severity: { type: 'string' },
                  status: { type: 'string' },
                  latitude: { type: 'number' },
                  longitude: { type: 'number' },
                  addressText: { type: 'string', nullable: true },
                  province: { type: 'string', nullable: true },
                  district: { type: 'string', nullable: true },
                  sector: { type: 'string', nullable: true },
                  createdAt: { type: 'string', format: 'date-time' },
                  reporterId: { type: 'string', format: 'uuid', nullable: true },
                  photos: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        id: { type: 'string', format: 'uuid' },
                        url: { type: 'string' },
                        caption: { type: 'string', nullable: true },
                        createdAt: { type: 'string', format: 'date-time' },
                      },
                      required: ['id', 'url', 'createdAt'],
                    },
                  },
                },
                required: ['id', 'title', 'description', 'type', 'severity', 'status', 'latitude', 'longitude', 'createdAt', 'photos'],
              },
            },
            meta: {
              type: 'object',
              properties: {
                total: { type: 'number' },
                limit: { type: 'number' },
                offset: { type: 'number' },
              },
            },
          },
        },
        400: {
          type: 'object',
          properties: {
            error: {
              type: 'object',
              properties: {
                code: { type: 'string' },
                message: { type: 'string' },
                details: { type: 'object' },
                requestId: { type: 'string' },
              },
            },
          },
        },
      },
    },
  }, async (req: FastifyRequest, reply) => {
    const parsed = listReportsQuerySchema.safeParse(req.query)
    if (!parsed.success) {
      return reply.code(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid query parameters',
          details: parsed.error.flatten(),
          requestId: req.id,
        },
      })
    }

    try {
      const where: any = {}
      
      // Bounding box filter
      if (parsed.data.bbox) {
        const [minLon, minLat, maxLon, maxLat] = parsed.data.bbox.split(',').map(Number)
        where.latitude = { gte: minLat, lte: maxLat }
        where.longitude = { gte: minLon, lte: maxLon }
      }

      if (parsed.data.status) {
        where.status = parsed.data.status
      }

      if (parsed.data.type) {
        where.type = parsed.data.type
      }

      // "My Reports": only the caller's own reports. Without a valid session this
      // must fail rather than silently return everyone's reports.
      // Fastify may already have coerced the querystring value to a boolean.
      const myReports = (req.query as any).myReports
      if (myReports === true || myReports === 'true') {
        const sessionUser = getAuthenticatedUser(req)
        if (!sessionUser) {
          throw new ApiError(401, 'Authentication required to list your reports', 'UNAUTHORIZED')
        }
        where.reporterId = sessionUser.userId
      }

      const orderBy = { createdAt: 'desc' as const }
      const paginationArgs: {
        take: number
        skip: number
        cursor?: { id: string }
        orderBy: typeof orderBy
      } = parsed.data.cursor
        ? {
            take: parsed.data.limit,
            cursor: { id: parsed.data.cursor },
            skip: 1,
            orderBy,
          }
        : {
            take: parsed.data.limit,
            skip: parsed.data.offset,
            orderBy,
          }

      const [reports, total] = await Promise.all([
        prisma.report.findMany({
          where,
          ...paginationArgs,
          include: {
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

      // Log first report's photos for debugging
      if (reports.length > 0) {
        const firstReport = reports[0]
        app.log.info({ 
          reportId: firstReport.id,
          hasPhotos: 'photos' in firstReport,
          photosType: typeof firstReport.photos,
          photosIsArray: Array.isArray(firstReport.photos),
          photosCount: firstReport.photos?.length || 0,
          photos: firstReport.photos,
          allKeys: Object.keys(firstReport)
        }, 'First report photos check - detailed')
      }

      const responseData = {
        data: reports.map((r: any) => {
          // Ensure photos is always an array
          const photos = Array.isArray(r.photos) ? r.photos : []
          
          const reportData: any = {
            id: r.id,
            title: r.title,
            description: r.description,
            type: r.type,
            severity: r.severity,
            status: r.status,
            latitude: Number(r.latitude),
            longitude: Number(r.longitude),
            addressText: r.addressText,
            province: r.province,
            district: r.district,
            sector: r.sector,
            createdAt: r.createdAt.toISOString(),
            reporterId: r.reporterId,
            photos: photos.map((p: any) => ({
              id: p.id,
              url: p.url,
              caption: p.caption,
              createdAt: p.createdAt.toISOString(),
            })),
          }
          
          // Debug log for first report
          if (r.id === reports[0]?.id) {
            app.log.info({ 
              rawPhotos: r.photos,
              mappedPhotos: reportData.photos,
              photosLength: reportData.photos.length
            }, 'First report response data - photos mapping')
          }
          
          return reportData
        }),
          meta: {
            total,
            limit: parsed.data.limit,
            offset: parsed.data.offset,
            nextCursor:
              reports.length === parsed.data.limit
                ? reports[reports.length - 1]?.id
                : null,
          },
      }
      
      // Log the response to verify photos are included
      if (responseData.data.length > 0) {
        app.log.info({ 
          firstReportPhotos: responseData.data[0].photos,
          photosCount: responseData.data[0].photos?.length 
        }, 'Response data photos check')
      }
      
      return reply.send(responseData)
    } catch (error) {
      if (error instanceof ApiError) throw error
      app.log.error(error, 'Failed to list reports')
      throw new ApiError(500, 'Failed to fetch reports', 'FETCH_FAILED')
    }
  })

  // Get single report with photos and latest status
  app.get('/reports/:id', {
    schema: {
      description: 'Get a single report by ID with photos and status history',
      tags: ['reports'],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
        },
        required: ['id'],
      },
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            title: { type: 'string' },
            description: { type: 'string' },
            type: { type: 'string' },
            severity: { type: 'string' },
            status: { type: 'string' },
            latitude: { type: 'number' },
            longitude: { type: 'number' },
            addressText: { type: 'string', nullable: true },
            province: { type: 'string', nullable: true },
            district: { type: 'string', nullable: true },
            sector: { type: 'string', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
            photos: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  url: { type: 'string' },
                  caption: { type: 'string', nullable: true },
                  createdAt: { type: 'string', format: 'date-time' },
                },
              },
            },
            latestStatus: {
              type: 'object',
              nullable: true,
              properties: {
                status: { type: 'string' },
                note: { type: 'string', nullable: true },
                changedAt: { type: 'string', format: 'date-time' },
              },
            },
          },
        },
        400: {
          type: 'object',
          properties: {
            error: {
              type: 'object',
              properties: {
                code: { type: 'string' },
                message: { type: 'string' },
                requestId: { type: 'string' },
              },
            },
          },
        },
        404: {
          type: 'object',
          properties: {
            error: {
              type: 'object',
              properties: {
                code: { type: 'string' },
                message: { type: 'string' },
                requestId: { type: 'string' },
              },
            },
          },
        },
      },
    },
  }, async (req: FastifyRequest<{ Params: { id: string } }>, reply) => {
    const { id } = req.params
    if (!z.string().uuid().safeParse(id).success) {
      return reply.code(400).send({
        error: {
          code: 'INVALID_ID',
          message: 'Invalid report ID format',
          requestId: req.id,
        },
      })
    }

    try {
      const report = await prisma.report.findUnique({
        where: { id },
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
          photos: {
            orderBy: { createdAt: 'asc' },
            select: { id: true, url: true, caption: true, createdAt: true },
          },
          statusHistory: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { toStatus: true, note: true, createdAt: true },
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
        photos: report.photos.map((p) => ({
          id: p.id,
          url: p.url,
          caption: p.caption || null,
          createdAt: p.createdAt.toISOString(),
        })),
        latestStatus: report.statusHistory[0]
          ? {
              status: report.statusHistory[0].toStatus,
              note: report.statusHistory[0].note || null,
              changedAt: report.statusHistory[0].createdAt.toISOString(),
            }
          : null,
      })
    } catch (error) {
      app.log.error(error, 'Failed to fetch report')
      // Log more details for debugging
      if (error instanceof Error) {
        app.log.error({
          message: error.message,
          stack: error.stack,
          name: error.name,
        }, 'Error details for report fetch')
      }
      throw new ApiError(500, 'Failed to fetch report', 'FETCH_FAILED')
    }
  })

  // Update report status (creates history entry)
  app.patch('/reports/:id/status', {
    ...reportMutationAuth,
    schema: {
      description: 'Update the status of a report',
      tags: ['reports'],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
        },
        required: ['id'],
      },
      body: zodToJsonSchemaFastify(updateReportStatusSchema),
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            title: { type: 'string' },
            status: { type: 'string' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        400: {
          type: 'object',
          properties: {
            error: {
              type: 'object',
              properties: {
                code: { type: 'string' },
                message: { type: 'string' },
                details: { type: 'object' },
                requestId: { type: 'string' },
              },
            },
          },
        },
        404: {
          type: 'object',
          properties: {
            error: {
              type: 'object',
              properties: {
                code: { type: 'string' },
                message: { type: 'string' },
                requestId: { type: 'string' },
              },
            },
          },
        },
      },
    },
  }, async (req: FastifyRequest<{ Params: { id: string }; Body: unknown }>, reply) => {
    const { id } = req.params
    if (!z.string().uuid().safeParse(id).success) {
      return reply.code(400).send({
        error: {
          code: 'INVALID_ID',
          message: 'Invalid report ID format',
          requestId: req.id,
        },
      })
    }

    const parsed = updateReportStatusSchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.code(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request data',
          details: parsed.error.flatten(),
          requestId: req.id,
        },
      })
    }

    const user = requireAuthenticatedUser(req)

    try {
      const { report } = await changeReportStatus({
        reportId: id,
        toStatus: parsed.data.status,
        note: parsed.data.note,
        actor: { userId: user.userId, role: user.role },
      })

      await notifyStatusChange(report, report.status, app.log)

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

  // Add comment to report (for citizens)
  app.post('/reports/:id/comments', {
    preHandler: authenticateUser,
    schema: {
      description: 'Add a comment to a report (citizens)',
      tags: ['reports'],
      body: zodToJsonSchemaFastify(z.object({
        body: z.string().min(1).max(2000),
      })),
    },
  }, async (req: FastifyRequest<{ Params: { id: string }; Body: { body: string } }>, reply) => {
    const { id } = req.params
    if (!z.string().uuid().safeParse(id).success) {
      return reply.code(400).send({
        error: {
          code: 'INVALID_ID',
          message: 'Invalid report ID format',
          requestId: req.id,
        },
      })
    }

    const parsed = z.object({
      body: z.string().min(1).max(2000),
    }).safeParse(req.body)

    if (!parsed.success) {
      return reply.code(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request data',
          details: parsed.error.flatten(),
          requestId: req.id,
        },
      })
    }

    try {
      const userId = (req.user as any).userId

      // Verify report exists
      const report = await prisma.report.findUnique({
        where: { id },
        select: { id: true, title: true },
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

      // Create comment
      const comment = await prisma.reportComment.create({
        data: {
          reportId: id,
          body: parsed.data.body,
          authorId: userId,
        },
        include: {
          author: {
            select: { id: true, email: true, fullName: true },
          },
        },
      })

      // Log audit event
      await logAuditEvent({
        userId: userId,
        action: AuditActions.REPORT_COMMENT_ADDED,
        resourceType: ResourceTypes.COMMENT,
        resourceId: comment.id,
        details: { reportId: id },
      })

      // Notify reporter and assigned officers about comment
      try {
        const recipients = await getReportNotificationRecipients(id)
        
        // Remove the comment author from recipients
        const filteredRecipients = recipients.filter((rId) => rId !== userId)
        
        if (filteredRecipients.length > 0) {
          await notifyUsers(
            filteredRecipients,
            'report_commented',
            'New Comment on Report',
            `A new comment was added to report "${report.title}"`,
            {
              reportId: id,
              reportTitle: report.title,
              commentId: comment.id,
            }
          )

          await sendPushNotificationsToUsers(
            filteredRecipients,
            'New Comment',
            `New comment on "${report.title}"`,
            { reportId: id, type: 'report_comment', commentId: comment.id }
          )
        }
      } catch (notifError) {
        app.log.error(notifError, 'Failed to send notifications for comment')
        // Don't fail the request if notifications fail
      }

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

  // Confirm/upvote report (for citizens)
  app.post('/reports/:id/confirm', {
    preHandler: authenticateUser,
    schema: {
      description: 'Confirm/upvote a report (citizens)',
      tags: ['reports'],
    },
  }, async (req: FastifyRequest<{ Params: { id: string } }>, reply) => {
    const { id } = req.params
    if (!z.string().uuid().safeParse(id).success) {
      return reply.code(400).send({
        error: {
          code: 'INVALID_ID',
          message: 'Invalid report ID format',
          requestId: req.id,
        },
      })
    }

    try {
      const userId = (req.user as any).userId

      // Verify report exists
      const report = await prisma.report.findUnique({
        where: { id },
        select: { id: true, title: true },
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

      // Check if user already confirmed this report
      const existing = await prisma.reportConfirmation.findUnique({
        where: {
          reportId_userId: {
            reportId: id,
            userId: userId,
          },
        },
      })

      if (existing) {
        return reply.code(409).send({
          error: {
            code: 'ALREADY_CONFIRMED',
            message: 'You have already confirmed this report',
            requestId: req.id,
          },
        })
      }

      // Create confirmation
      const confirmation = await prisma.reportConfirmation.create({
        data: {
          reportId: id,
          userId: userId,
        },
      })

      // Get confirmation count
      const count = await prisma.reportConfirmation.count({
        where: { reportId: id },
      })

      // Log audit event
      await logAuditEvent({
        userId: userId,
        action: AuditActions.REPORT_CONFIRMED,
        resourceType: ResourceTypes.REPORT,
        resourceId: id,
        details: { confirmationCount: count },
      })

      return reply.code(201).send({
        id: confirmation.id,
        reportId: confirmation.reportId,
        userId: confirmation.userId,
        confirmationCount: count,
        createdAt: confirmation.createdAt.toISOString(),
      })
    } catch (error: any) {
      if (error.code === 'P2002') {
        // Unique constraint violation
        return reply.code(409).send({
          error: {
            code: 'ALREADY_CONFIRMED',
            message: 'You have already confirmed this report',
            requestId: req.id,
          },
        })
      }
      app.log.error(error, 'Failed to confirm report')
      throw new ApiError(500, 'Failed to confirm report', 'CONFIRMATION_FAILED')
    }
  })

  // Get confirmation count for a report
  app.get('/reports/:id/confirmations', {
    // Public, but recognises the caller so userConfirmed is accurate.
    preHandler: optionalAuthenticate,
    schema: {
      description: 'Get confirmation count for a report',
      tags: ['reports'],
    },
  }, async (req: FastifyRequest<{ Params: { id: string } }>, reply) => {
    const { id } = req.params
    if (!z.string().uuid().safeParse(id).success) {
      return reply.code(400).send({
        error: {
          code: 'INVALID_ID',
          message: 'Invalid report ID format',
          requestId: req.id,
        },
      })
    }

    try {
      const count = await prisma.reportConfirmation.count({
        where: { reportId: id },
      })

      // Check if user has confirmed (if authenticated)
      let userConfirmed = false
      if (req.user) {
        const userId = (req.user as any).userId
        const confirmation = await prisma.reportConfirmation.findUnique({
          where: {
            reportId_userId: {
              reportId: id,
              userId: userId,
            },
          },
        })
        userConfirmed = !!confirmation
      }

      return reply.send({
        reportId: id,
        count,
        userConfirmed,
      })
    } catch (error) {
      app.log.error(error, 'Failed to get confirmation count')
      throw new ApiError(500, 'Failed to get confirmation count', 'FETCH_FAILED')
    }
  })
}
