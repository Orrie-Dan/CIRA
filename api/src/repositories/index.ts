import { prisma } from '../prisma.js'
import type { Prisma } from '@prisma/client'
import { normalizeEmail } from '../utils/auth.js'

export const reportRepository = {
  findById(id: string) {
    return prisma.report.findUnique({ where: { id } })
  },

  create(data: Prisma.ReportCreateInput) {
    return prisma.report.create({ data })
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
  /**
   * Case-insensitive email lookup. New accounts are stored lowercased; the
   * insensitive fallback covers rows created before emails were normalized.
   */
  async findByEmail(email: string) {
    const normalized = normalizeEmail(email)
    const exact = await prisma.userAccount.findUnique({ where: { email: normalized } })
    if (exact) return exact
    return prisma.userAccount.findFirst({
      where: { email: { equals: normalized, mode: 'insensitive' } },
    })
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
