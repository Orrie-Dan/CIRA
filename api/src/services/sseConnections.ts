import { prisma } from '../prisma.js'

/**
 * Open SSE notification streams, per user, on this server instance.
 *
 * A stream is tied to the session version (`tokenVersion`) it was opened
 * with. When sessions are revoked (logout-all, password change/reset, OAuth
 * takeover protection), `closeUserStreams` closes that user's streams here at
 * once, and every heartbeat re-checks the version in the database, which also
 * catches revocations handled by another instance.
 */
export interface SseConnection {
  /** Session version the stream was authorized with. */
  tokenVersion: number
  send: (data: string) => void
  /** Ends the stream and removes it from the registry. Safe to call twice. */
  close: () => void
}

const connections = new Map<string, Set<SseConnection>>()

export function addSseConnection(userId: string, connection: SseConnection): void {
  let set = connections.get(userId)
  if (!set) {
    set = new Set()
    connections.set(userId, set)
  }
  set.add(connection)
}

export function removeSseConnection(userId: string, connection: SseConnection): void {
  const set = connections.get(userId)
  if (!set) return
  set.delete(connection)
  if (set.size === 0) connections.delete(userId)
}

export function sseConnectionCount(userId: string): number {
  return connections.get(userId)?.size ?? 0
}

/** Pushes a notification to every open stream of the user on this instance. */
export function broadcastNotificationToUser(userId: string, notification: unknown): void {
  const set = connections.get(userId)
  if (!set) return
  const message = JSON.stringify({ type: 'notification', data: notification })
  for (const connection of [...set]) {
    try {
      connection.send(message)
    } catch {
      connection.close()
    }
  }
}

export const SESSION_REVOKED_EVENT = JSON.stringify({ type: 'session_revoked' })

function revoke(connection: SseConnection): void {
  try {
    connection.send(SESSION_REVOKED_EVENT)
  } finally {
    connection.close()
  }
}

/** Closes every open stream of the user on this instance (after a session revocation). */
export function closeUserStreams(userId: string): void {
  const set = connections.get(userId)
  if (!set) return
  for (const connection of [...set]) revoke(connection)
}

/**
 * Heartbeat check: closes the stream if the user's sessions were revoked
 * since it opened (or the account is gone). Returns whether it is still open.
 * A database error keeps the stream open; the next heartbeat checks again.
 */
export async function closeIfRevoked(userId: string, connection: SseConnection): Promise<boolean> {
  const user = await prisma.userAccount.findUnique({ where: { id: userId }, select: { tokenVersion: true } })
  if (!user || user.tokenVersion !== connection.tokenVersion) {
    revoke(connection)
    return false
  }
  return true
}
