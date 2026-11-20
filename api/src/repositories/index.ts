import { prisma } from '../prisma.js'
import type { Prisma } from '@prisma/client'

export const reportRepository = {
  findById(id: string) {
    return prisma.report.findUnique({ where: { id } })
  },

  create(data: Prisma.ReportCreateInput) {
    return prisma.report.create({ data })
  },

  updateStatus(id: string, status: string) {
    return prisma.report.update({
      where: { id },
      data: { status },
    })
  },

  list(where: Prisma.ReportWhereInput, skip: number, take: number) {
    return prisma.report.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
    })
  },

  count(where: Prisma.ReportWhereInput) {
    return prisma.report.count({ where })
  },
}

export const userRepository = {
  findByEmail(email: string) {
    return prisma.userAccount.findUnique({ where: { email } })
  },

  findById(id: string) {
    return prisma.userAccount.findUnique({ where: { id } })
  },

  listByRole(role: string) {
    return prisma.userAccount.findMany({ where: { role } })
  },

  create(data: Prisma.UserAccountCreateInput) {
    return prisma.userAccount.create({ data })
  },
}
