import 'dotenv/config'
import { prisma } from '../src/prisma.js'
import { hashPassword } from '../src/utils/auth.js'

async function main() {
  const email = process.argv[2] || process.env.ADMIN_EMAIL
  const password = process.argv[3] || process.env.ADMIN_PASSWORD
  const fullName = process.argv[4] || 'System Administrator'

  if (!email || !password) {
    console.error(
      'Usage: pnpm create-admin <email> <password> [fullName]\n' +
        'Or set ADMIN_EMAIL and ADMIN_PASSWORD environment variables.'
    )
    process.exit(1)
  }

  if (password.length < 8) {
    console.error('Password must be at least 8 characters.')
    process.exit(1)
  }

  const passwordHash = await hashPassword(password)

  const user = await prisma.userAccount.upsert({
    where: { email },
    update: {
      passwordHash,
      role: 'admin',
      emailVerified: true,
      fullName,
    },
    create: {
      email,
      passwordHash,
      role: 'admin',
      emailVerified: true,
      fullName,
    },
    select: { id: true, email: true, role: true, fullName: true },
  })

  console.log('Admin user ready:', user)
}

main()
  .catch((error) => {
    console.error('Failed to create admin user:', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
