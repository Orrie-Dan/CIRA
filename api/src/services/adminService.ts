import { userRepository } from '../repositories/index.js'
import { hashPassword } from '../utils/auth.js'
import { prisma } from '../prisma.js'

export async function createStaffUser(input: {
  email: string
  password: string
  fullName?: string
  phone?: string
  role: 'officer' | 'admin'
}) {
  const passwordHash = await hashPassword(input.password)

  return userRepository.create({
    email: input.email,
    passwordHash,
    fullName: input.fullName ?? null,
    phone: input.phone ?? null,
    role: input.role,
    emailVerified: true,
  })
}

export async function listStaffUsers() {
  return prisma.userAccount.findMany({
    where: { role: { in: ['admin', 'officer'] } },
    select: {
      id: true,
      email: true,
      fullName: true,
      phone: true,
      role: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  })
}
