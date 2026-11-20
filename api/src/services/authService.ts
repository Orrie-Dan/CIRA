import { hashPassword, verifyPassword } from '../utils/auth.js'
import { userRepository } from '../repositories/index.js'

export async function registerCitizenUser(input: {
  email: string
  password: string
  fullName?: string | null
  phone?: string | null
}) {
  const passwordHash = await hashPassword(input.password)

  return userRepository.create({
    email: input.email.trim(),
    passwordHash,
    fullName: input.fullName,
    phone: input.phone,
    role: 'citizen',
  })
}

export async function authenticateWithPassword(email: string, password: string) {
  const user = await userRepository.findByEmail(email)
  if (!user?.passwordHash) return null

  const valid = await verifyPassword(password, user.passwordHash)
  if (!valid) return null

  return user
}
