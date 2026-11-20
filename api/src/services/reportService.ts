import type { ReportType, ReportSeverity } from '@prisma/client'
import { reportRepository } from '../repositories/index.js'
import { prisma } from '../prisma.js'

export interface CreateReportInput {
  title: string
  description: string
  type: ReportType
  severity: ReportSeverity
  latitude: number
  longitude: number
  addressText?: string
  province?: string
  district?: string
  sector?: string
  reporterId?: string
}

export async function createReportWithHistory(input: CreateReportInput) {
  const report = await reportRepository.create({
    title: input.title,
    description: input.description,
    type: input.type,
    severity: input.severity,
    status: 'new',
    latitude: input.latitude,
    longitude: input.longitude,
    addressText: input.addressText,
    province: input.province,
    district: input.district,
    sector: input.sector,
    ...(input.reporterId ? { reporter: { connect: { id: input.reporterId } } } : {}),
  })

  await prisma.reportStatusHistory.create({
    data: {
      reportId: report.id,
      fromStatus: null,
      toStatus: 'new',
      note: 'Report created',
    },
  })

  return report
}
