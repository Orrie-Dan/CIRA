import { getRedis } from './redis.js'

/**
 * Small TTL key/value store used for OTPs and one-time tickets.
 * Uses Redis when REDIS_URL is set (shared across instances), otherwise an
 * in-process map. When Redis is configured, errors propagate rather than
 * silently falling back to memory: a memory fallback would split state
 * across instances (stored on one, verified on another).
 */
interface MemoryEntry {
  value: string
  expiresAt: number
}

const memory = new Map<string, MemoryEntry>()

function memoryGet(key: string): MemoryEntry | undefined {
  const entry = memory.get(key)
  if (!entry) return undefined
  if (entry.expiresAt <= Date.now()) {
    memory.delete(key)
    return undefined
  }
  return entry
}

function sweepMemory(): void {
  const now = Date.now()
  for (const [key, entry] of memory.entries()) {
    if (entry.expiresAt <= now) memory.delete(key)
  }
}

let sweepTimer: ReturnType<typeof setInterval> | undefined
function ensureSweeper(): void {
  if (sweepTimer) return
  sweepTimer = setInterval(sweepMemory, 60_000)
  sweepTimer.unref?.()
}

export async function setWithTtl(key: string, value: string, ttlMs: number): Promise<void> {
  const redis = getRedis()
  if (redis) {
    await redis.set(key, value, 'PX', ttlMs)
    return
  }
  ensureSweeper()
  memory.set(key, { value, expiresAt: Date.now() + ttlMs })
}

export async function get(key: string): Promise<string | null> {
  const redis = getRedis()
  if (redis) return redis.get(key)
  return memoryGet(key)?.value ?? null
}

/** Deletes the key; returns true only if it existed (first caller wins). */
export async function del(...keys: string[]): Promise<boolean> {
  const redis = getRedis()
  if (redis) return (await redis.del(...keys)) > 0
  let existed = false
  for (const key of keys) {
    if (memoryGet(key)) existed = true
    memory.delete(key)
  }
  return existed
}

/** Atomically reads and deletes a key (single-use values). */
export async function take(key: string): Promise<string | null> {
  const redis = getRedis()
  if (redis) {
    // Lua instead of GETDEL so this works on Redis < 6.2
    const value = await redis.eval(
      "local v = redis.call('GET', KEYS[1]); if v then redis.call('DEL', KEYS[1]) end; return v",
      1,
      key
    )
    return typeof value === 'string' ? value : null
  }
  const entry = memoryGet(key)
  memory.delete(key)
  return entry?.value ?? null
}

/** Increments a counter; sets its TTL when it is first created. */
export async function incrWithTtl(key: string, ttlMs: number): Promise<number> {
  const redis = getRedis()
  if (redis) {
    // Lua keeps INCR + first-time PEXPIRE atomic (PEXPIRE NX needs Redis 7)
    const count = await redis.eval(
      "local c = redis.call('INCR', KEYS[1]); if c == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end; return c",
      1,
      key,
      String(ttlMs)
    )
    return Number(count)
  }
  ensureSweeper()
  const entry = memoryGet(key)
  const count = (entry ? Number(entry.value) : 0) + 1
  memory.set(key, { value: String(count), expiresAt: entry?.expiresAt ?? Date.now() + ttlMs })
  return count
}

/** Test helper. */
export function clearMemoryStoreForTesting(): void {
  memory.clear()
}
