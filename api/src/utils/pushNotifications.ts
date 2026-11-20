import { prisma } from '../prisma.js'

const EXPO_PUSH_API_URL = 'https://exp.host/--/api/v2/push/send'

export interface PushNotificationPayload {
  to: string
  sound?: string
  title: string
  body: string
  data?: Record<string, unknown>
  badge?: number
}

/**
 * Register a device token for push notifications
 */
export async function registerDeviceToken(
  userId: string,
  token: string,
  platform: string
) {
  // Check if token already exists
  const existing = await prisma.deviceToken.findUnique({
    where: { token },
  })

  if (existing) {
    // Update existing token
    return await prisma.deviceToken.update({
      where: { token },
      data: {
        userId,
        platform,
        updatedAt: new Date(),
      },
    })
  }

  // Create new token
  return await prisma.deviceToken.create({
    data: {
      userId,
      token,
      platform,
    },
  })
}

/**
 * Unregister a device token
 */
export async function unregisterDeviceToken(token: string, userId?: string) {
  return await prisma.deviceToken.deleteMany({
    where: {
      token,
      ...(userId ? { userId } : {}),
    },
  })
}

/**
 * Get device tokens for a user
 */
export async function getUserDeviceTokens(userId: string) {
  return await prisma.deviceToken.findMany({
    where: { userId },
  })
}

const EXPO_MAX_MESSAGES_PER_REQUEST = 100
const PUSH_REQUEST_TIMEOUT_MS = 10_000

async function sendToExpo(messages: PushNotificationPayload[]): Promise<{ sent: number; failed: number }> {
  let sent = 0
  let failed = 0

  for (let i = 0; i < messages.length; i += EXPO_MAX_MESSAGES_PER_REQUEST) {
    const chunk = messages.slice(i, i + EXPO_MAX_MESSAGES_PER_REQUEST)
    try {
      const response = await fetch(EXPO_PUSH_API_URL, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(chunk),
        signal: AbortSignal.timeout(PUSH_REQUEST_TIMEOUT_MS),
      })
      const result: any = await response.json()
      // Expo answers { data: [{ status: 'ok' | 'error', ... }] }, one ticket per message.
      const tickets: any[] = Array.isArray(result?.data) ? result.data : Array.isArray(result) ? result : []
      const ok = tickets.filter((t) => t?.status === 'ok').length
      sent += ok
      failed += chunk.length - ok
    } catch (error) {
      console.error('Failed to send push notifications:', error)
      failed += chunk.length
    }
  }

  return { sent, failed }
}

/**
 * Send push notification via Expo
 */
export async function sendPushNotification(
  userId: string,
  title: string,
  body: string,
  data?: Record<string, unknown>
) {
  return sendPushNotificationsToUsers([userId], title, body, data)
}

/**
 * Send push notifications to multiple users: one token query, then batched
 * Expo requests (up to 100 messages each) with a timeout.
 */
export async function sendPushNotificationsToUsers(
  userIds: string[],
  title: string,
  body: string,
  data?: Record<string, unknown>
) {
  if (userIds.length === 0) return { sent: 0, failed: 0 }

  const tokens = await prisma.deviceToken.findMany({
    where: { userId: { in: userIds } },
    select: { token: true },
  })
  if (tokens.length === 0) return { sent: 0, failed: 0 }

  const messages: PushNotificationPayload[] = tokens.map(({ token }) => ({
    to: token,
    sound: 'default',
    title,
    body,
    data,
    badge: 1,
  }))

  return sendToExpo(messages)
}
