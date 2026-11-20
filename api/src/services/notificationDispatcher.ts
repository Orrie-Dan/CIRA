import { notifyUsers, type NotificationType, type NotificationData } from '../utils/notifications.js'
import { sendPushNotificationsToUsers } from '../utils/pushNotifications.js'
import { broadcastNotificationToUser } from '../routes/notifications.js'

/**
 * Fans a notification out to in-app (DB), push (Expo) and live (SSE) channels
 * after the HTTP response, so requests never wait on — or fail because of —
 * notification delivery.
 *
 * Delivery is best-effort and in-process: a crash loses queued jobs, as it
 * did before when failures were caught and logged. Shutdown waits for pending
 * jobs via `drainNotifications()`.
 */
export interface NotificationJob {
  /** User ids, or a resolver run in the background (e.g. report recipients). */
  recipients: string[] | (() => Promise<string[]>)
  /** Never notify this user (e.g. the person who made the change). */
  excludeUserId?: string
  type: NotificationType
  title: string
  body: string
  data?: NotificationData
  /** Push notifications use shorter text; defaults to title/body. */
  push?: { title?: string; body?: string; data?: Record<string, unknown> }
  /** Set to false to skip the SSE broadcast. */
  live?: boolean
}

interface Logger {
  error: (obj: unknown, msg?: string) => void
}

const pending = new Set<Promise<void>>()

async function deliver(job: NotificationJob): Promise<void> {
  const resolved = typeof job.recipients === 'function' ? await job.recipients() : job.recipients
  const recipients = [...new Set(resolved)].filter((id) => id && id !== job.excludeUserId)
  if (recipients.length === 0) return

  await notifyUsers(recipients, job.type, job.title, job.body, job.data)

  if (job.live !== false) {
    const payload = { type: job.type, title: job.title, body: job.body, data: job.data }
    recipients.forEach((userId) => broadcastNotificationToUser(userId, payload))
  }

  await sendPushNotificationsToUsers(
    recipients,
    job.push?.title ?? job.title,
    job.push?.body ?? job.body,
    job.push?.data ?? { ...job.data, type: job.type }
  )
}

/** Queue a notification to be delivered after the current request. Never throws. */
export function enqueueNotification(job: NotificationJob, log: Logger): void {
  const task: Promise<void> = new Promise<void>((resolve) => setImmediate(resolve))
    .then(() => deliver(job))
    .catch((error) => log.error(error, `Failed to deliver ${job.type} notification`))
    .finally(() => pending.delete(task))
  pending.add(task)
}

/** Resolves once every queued notification has been delivered or has failed. */
export async function drainNotifications(): Promise<void> {
  while (pending.size > 0) {
    await Promise.allSettled([...pending])
  }
}

export function pendingNotificationCount(): number {
  return pending.size
}
