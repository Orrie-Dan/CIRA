import { getRedis } from './redis.js'

/**
 * Nominatim access with the two things its usage policy requires of us:
 * at most one request per second, and caching of results.
 * https://operations.osmfoundation.org/policies/nominatim/
 */
const USER_AGENT = 'CIRA-Infrastructure-Reporting/1.0'
const REQUEST_TIMEOUT_MS = 8_000
let minIntervalMs = 1_000

// ---------------------------------------------------------------------------
// Throttled fetch: requests are serialized process-wide and spaced >= 1s apart.
// ---------------------------------------------------------------------------
let queue: Promise<unknown> = Promise.resolve()
let lastRequestAt = 0

export function nominatimFetch(url: string): Promise<Response> {
  const run = async () => {
    const wait = lastRequestAt + minIntervalMs - Date.now()
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
    lastRequestAt = Date.now()
    return fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  }
  const result = queue.then(run, run)
  // Keep the chain going whether this request succeeds or fails.
  queue = result.catch(() => undefined)
  return result
}

// ---------------------------------------------------------------------------
// Cache: Redis when configured (shared across instances), otherwise a bounded
// in-process LRU. Cache failures are treated as misses: geocoding still works.
// ---------------------------------------------------------------------------
const MEMORY_MAX_ENTRIES = 5_000
const memory = new Map<string, { value: string; expiresAt: number }>()

function memoryGet(key: string): string | null {
  const entry = memory.get(key)
  if (!entry) return null
  if (entry.expiresAt <= Date.now()) {
    memory.delete(key)
    return null
  }
  // Refresh recency (Map keeps insertion order).
  memory.delete(key)
  memory.set(key, entry)
  return entry.value
}

function memorySet(key: string, value: string, ttlMs: number): void {
  memory.delete(key)
  memory.set(key, { value, expiresAt: Date.now() + ttlMs })
  while (memory.size > MEMORY_MAX_ENTRIES) {
    const oldest = memory.keys().next().value
    if (oldest === undefined) break
    memory.delete(oldest)
  }
}

export async function getCachedGeocode<T>(key: string): Promise<T | null> {
  try {
    const redis = getRedis()
    const raw = redis ? await redis.get(key) : memoryGet(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch (error) {
    console.error('Geocode cache read failed:', error)
    return null
  }
}

export async function setCachedGeocode(key: string, value: unknown, ttlMs: number): Promise<void> {
  try {
    const raw = JSON.stringify(value)
    const redis = getRedis()
    if (redis) {
      await redis.set(key, raw, 'PX', ttlMs)
    } else {
      memorySet(key, raw, ttlMs)
    }
  } catch (error) {
    console.error('Geocode cache write failed:', error)
  }
}

/** ~11 m precision: nearby clicks share a cache entry. */
export function reverseCacheKey(lat: number, lon: number): string {
  return `geo:rev:${lat.toFixed(4)},${lon.toFixed(4)}`
}

export function forwardCacheKey(query: string): string {
  return `geo:fwd:${query.trim().toLowerCase().replace(/\s+/g, ' ')}`
}

export const GEOCODE_TTL = {
  /** Administrative areas for a point rarely change. */
  reverse: 7 * 24 * 60 * 60 * 1000,
  forward: 24 * 60 * 60 * 1000,
  forwardEmpty: 60 * 60 * 1000,
}

export function resetNominatimForTesting(options: { minIntervalMs?: number } = {}): void {
  memory.clear()
  queue = Promise.resolve()
  lastRequestAt = 0
  minIntervalMs = options.minIntervalMs ?? 1_000
}
