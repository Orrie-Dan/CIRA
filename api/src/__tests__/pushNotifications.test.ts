import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../prisma.js', () => ({
  prisma: { deviceToken: { findMany: vi.fn() } },
}))

import { prisma } from '../prisma.js'
import { sendPushNotificationsToUsers } from '../utils/pushNotifications.js'

const findMany = vi.mocked(prisma.deviceToken.findMany)

function expoOk(messages: unknown[]) {
  return new Response(JSON.stringify({ data: messages.map(() => ({ status: 'ok', id: 'x' })) }))
}

describe('sendPushNotificationsToUsers', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('looks tokens up once and batches Expo requests at 100 messages', async () => {
    findMany.mockResolvedValue(Array.from({ length: 250 }, (_, i) => ({ token: `ExponentPushToken[${i}]` })) as never)
    fetchMock.mockImplementation(async (_url: string, init: RequestInit) => expoOk(JSON.parse(init.body as string)))

    const result = await sendPushNotificationsToUsers(['u1', 'u2'], 'Title', 'Body', { reportId: 'r1' })

    expect(findMany).toHaveBeenCalledTimes(1)
    expect(findMany).toHaveBeenCalledWith({ where: { userId: { in: ['u1', 'u2'] } }, select: { token: true } })
    expect(fetchMock).toHaveBeenCalledTimes(3)
    const sizes = fetchMock.mock.calls.map(([, init]) => JSON.parse((init as RequestInit).body as string).length)
    expect(sizes).toEqual([100, 100, 50])
    expect((fetchMock.mock.calls[0][1] as RequestInit).signal).toBeInstanceOf(AbortSignal)
    expect(result).toEqual({ sent: 250, failed: 0 })
  })

  it('counts Expo error tickets and failed requests as failures', async () => {
    findMany.mockResolvedValue([{ token: 'a' }, { token: 'b' }] as never)
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [{ status: 'ok' }, { status: 'error', details: { error: 'DeviceNotRegistered' } }] }))
    )

    expect(await sendPushNotificationsToUsers(['u1'], 'T', 'B')).toEqual({ sent: 1, failed: 1 })

    fetchMock.mockRejectedValueOnce(new Error('timeout'))
    expect(await sendPushNotificationsToUsers(['u1'], 'T', 'B')).toEqual({ sent: 0, failed: 2 })
  })

  it('does nothing without recipients or tokens', async () => {
    expect(await sendPushNotificationsToUsers([], 'T', 'B')).toEqual({ sent: 0, failed: 0 })
    expect(findMany).not.toHaveBeenCalled()

    findMany.mockResolvedValue([] as never)
    expect(await sendPushNotificationsToUsers(['u1'], 'T', 'B')).toEqual({ sent: 0, failed: 0 })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
