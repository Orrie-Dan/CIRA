import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../utils/notifications.js', () => ({ notifyUsers: vi.fn(async () => ({ count: 0 })) }))
vi.mock('../utils/pushNotifications.js', () => ({ sendPushNotificationsToUsers: vi.fn(async () => ({ sent: 0, failed: 0 })) }))
vi.mock('../routes/notifications.js', () => ({ broadcastNotificationToUser: vi.fn() }))

import { notifyUsers } from '../utils/notifications.js'
import { sendPushNotificationsToUsers } from '../utils/pushNotifications.js'
import { broadcastNotificationToUser } from '../routes/notifications.js'
import { enqueueNotification, drainNotifications, pendingNotificationCount } from '../services/notificationDispatcher.js'

const log = { error: vi.fn() }

describe('notification dispatcher', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not deliver synchronously, so the request is not held up', async () => {
    enqueueNotification({ recipients: ['u1'], type: 'report_assigned', title: 'T', body: 'B' }, log)

    expect(notifyUsers).not.toHaveBeenCalled()
    expect(pendingNotificationCount()).toBe(1)

    await drainNotifications()
    expect(notifyUsers).toHaveBeenCalledTimes(1)
    expect(pendingNotificationCount()).toBe(0)
  })

  it('delivers in-app, live and push with the push overrides', async () => {
    enqueueNotification({
      recipients: ['u1', 'u2'],
      type: 'report_status_changed',
      title: 'Report Status Updated',
      body: 'long body',
      data: { reportId: 'r1' },
      push: { body: 'short', data: { reportId: 'r1', type: 'report_status_changed' } },
    }, log)
    await drainNotifications()

    expect(notifyUsers).toHaveBeenCalledWith(['u1', 'u2'], 'report_status_changed', 'Report Status Updated', 'long body', { reportId: 'r1' })
    expect(broadcastNotificationToUser).toHaveBeenCalledTimes(2)
    expect(broadcastNotificationToUser).toHaveBeenCalledWith('u1', {
      type: 'report_status_changed',
      title: 'Report Status Updated',
      body: 'long body',
      data: { reportId: 'r1' },
    })
    expect(sendPushNotificationsToUsers).toHaveBeenCalledWith(
      ['u1', 'u2'],
      'Report Status Updated',
      'short',
      { reportId: 'r1', type: 'report_status_changed' }
    )
  })

  it('resolves recipients in the background, dedupes them and skips the actor', async () => {
    const resolver = vi.fn(async () => ['u1', 'actor', 'u1', 'u2'])
    enqueueNotification({ recipients: resolver, excludeUserId: 'actor', type: 'report_commented', title: 'T', body: 'B' }, log)

    expect(resolver).not.toHaveBeenCalled()
    await drainNotifications()

    expect(resolver).toHaveBeenCalledTimes(1)
    expect(vi.mocked(notifyUsers).mock.calls[0][0]).toEqual(['u1', 'u2'])
  })

  it('sends nothing when nobody is left to notify', async () => {
    enqueueNotification({ recipients: ['actor'], excludeUserId: 'actor', type: 'report_commented', title: 'T', body: 'B' }, log)
    await drainNotifications()

    expect(notifyUsers).not.toHaveBeenCalled()
    expect(sendPushNotificationsToUsers).not.toHaveBeenCalled()
  })

  it('logs delivery failures instead of throwing', async () => {
    vi.mocked(notifyUsers).mockRejectedValueOnce(new Error('db down'))

    expect(() =>
      enqueueNotification({ recipients: ['u1'], type: 'report_created', title: 'T', body: 'B' }, log)
    ).not.toThrow()
    await drainNotifications()

    expect(log.error).toHaveBeenCalledWith(expect.any(Error), 'Failed to deliver report_created notification')
    expect(sendPushNotificationsToUsers).not.toHaveBeenCalled()
  })

  it('can skip the live broadcast', async () => {
    enqueueNotification({ recipients: ['u1'], type: 'report_created', title: 'T', body: 'B', live: false }, log)
    await drainNotifications()
    expect(broadcastNotificationToUser).not.toHaveBeenCalled()
  })
})
