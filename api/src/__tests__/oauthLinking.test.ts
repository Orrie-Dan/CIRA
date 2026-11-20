import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../prisma.js', () => ({
  prisma: {
    userAccount: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(async ({ data }: { data: unknown }) => ({ id: 'existing', ...(data as object) })),
      create: vi.fn(async ({ data }: { data: unknown }) => ({ id: 'new', ...(data as object) })),
    },
  },
}))

import { prisma } from '../prisma.js'
import { findOrCreateOAuthUser } from '../utils/oauth.js'

const m = vi.mocked(prisma.userAccount)

describe('findOrCreateOAuthUser', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    m.findFirst.mockResolvedValue(null)
    m.findUnique.mockResolvedValue(null)
  })

  it('returns the already-linked account', async () => {
    m.findFirst.mockResolvedValueOnce({ id: 'linked' } as never)
    const user = await findOrCreateOAuthUser('google', 'g-1', 'a@test.com')
    expect(user).toEqual({ id: 'linked' })
    expect(m.update).not.toHaveBeenCalled()
  })

  it('links a verified email account without touching its password', async () => {
    m.findUnique.mockResolvedValueOnce({ id: 'existing', emailVerified: true, passwordHash: 'hash' } as never)
    await findOrCreateOAuthUser('google', 'g-1', 'A@Test.com')
    expect(m.update).toHaveBeenCalledWith({
      where: { id: 'existing' },
      data: { provider: 'google', providerId: 'g-1' },
    })
  })

  it('takes over an unverified (possibly squatted) account: clears password and phone, revokes sessions', async () => {
    m.findUnique.mockResolvedValueOnce({
      id: 'existing',
      emailVerified: false,
      passwordHash: 'attacker-hash',
      phone: '+250700000000',
      fullName: 'Attacker',
    } as never)
    await findOrCreateOAuthUser('google', 'g-1', 'victim@test.com', 'Victim')
    const data = m.update.mock.calls[0][0].data as Record<string, unknown>
    expect(data).toMatchObject({
      provider: 'google',
      providerId: 'g-1',
      emailVerified: true,
      passwordHash: null,
      phone: null,
      phoneVerified: false,
      fullName: 'Victim',
      tokenVersion: { increment: 1 },
    })
  })

  it('finds legacy mixed-case email rows case-insensitively', async () => {
    m.findFirst
      .mockResolvedValueOnce(null) // provider lookup
      .mockResolvedValueOnce({ id: 'legacy', emailVerified: true } as never) // insensitive email lookup
    await findOrCreateOAuthUser('apple', 'a-1', 'Legacy@Test.com')
    expect(m.findUnique).toHaveBeenCalledWith({ where: { email: 'legacy@test.com' } })
    expect(m.update).toHaveBeenCalledWith({
      where: { id: 'legacy' },
      data: { provider: 'apple', providerId: 'a-1' },
    })
  })

  it('creates new accounts with a lowercased email', async () => {
    await findOrCreateOAuthUser('google', 'g-2', 'New@Test.com', 'New')
    expect(m.create.mock.calls[0][0].data).toMatchObject({ email: 'new@test.com', emailVerified: true })
  })
})
