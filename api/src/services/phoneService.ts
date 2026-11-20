import { Prisma } from '@prisma/client'
import { prisma } from '../prisma.js'
import { ApiError } from '../utils/errors.js'

/**
 * Phone numbers are unique per account (stored normalized, see utils/phone.ts).
 * A number only counts for phone login once its holder has verified it while
 * signed in (see `claimVerifiedPhone`).
 */

export function phoneInUseError(): ApiError {
  return new ApiError(409, 'This phone number is already linked to another account', 'PHONE_IN_USE')
}

/** True if a Prisma error is the unique constraint on user_account.phone. */
export function isPhoneUniqueViolation(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') return false
  const target = error.meta?.target
  return Array.isArray(target) ? target.includes('phone') : String(target ?? '').includes('phone')
}

/** Throws PHONE_IN_USE if another account already has this number. */
export async function assertPhoneAvailable(phone: string, exceptUserId?: string): Promise<void> {
  const holder = await prisma.userAccount.findUnique({ where: { phone }, select: { id: true } })
  if (holder && holder.id !== exceptUserId) {
    throw phoneInUseError()
  }
}

/**
 * Sets `phone` on the user as verified, after they proved they hold it.
 * Another account that has the number *unverified* loses it (so nobody can
 * block a number by typing it into their profile first); if another account
 * has it *verified*, PHONE_IN_USE.
 */
export async function claimVerifiedPhone(userId: string, phone: string) {
  try {
    return await prisma.$transaction(async (tx) => {
      const holder = await tx.userAccount.findUnique({
        where: { phone },
        select: { id: true, phoneVerified: true },
      })
      if (holder && holder.id !== userId) {
        if (holder.phoneVerified) throw phoneInUseError()
        await tx.userAccount.update({ where: { id: holder.id }, data: { phone: null, phoneVerified: false } })
      }
      const user = await tx.userAccount.update({
        where: { id: userId },
        data: { phone, phoneVerified: true },
        select: { id: true, email: true, fullName: true, phone: true, phoneVerified: true, role: true },
      })
      return { user, releasedFromUserId: holder && holder.id !== userId ? holder.id : null }
    })
  } catch (error) {
    // Lost a race with another claim or profile update for the same number.
    if (isPhoneUniqueViolation(error)) throw phoneInUseError()
    throw error
  }
}
