import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import { geocodingRoutes } from '../routes/geocoding.js'
import { setRedisForTesting } from '../services/redis.js'
import {
  resetNominatimForTesting,
  nominatimFetch,
  getCachedGeocode,
  setCachedGeocode,
} from '../services/nominatim.js'

const KIGALI = { lat: -1.9441, lon: 30.0619 }

function nominatimReverse() {
  return {
    display_name: 'KG 7 Ave, Remera, Gasabo, Kigali City, Rwanda',
    address: { country_code: 'rw', road: 'KG 7 Ave', suburb: 'Remera', county: 'Gasabo', state: 'Kigali City' },
  }
}

describe('geocoding routes (caching + Nominatim throttle)', () => {
  let app: FastifyInstance
  const fetchMock = vi.fn()

  beforeEach(async () => {
    setRedisForTesting(null) // in-memory cache
    resetNominatimForTesting({ minIntervalMs: 30 })
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    app = Fastify()
    await app.register(geocodingRoutes)
    await app.ready()
  })

  afterEach(async () => {
    await app.close()
    vi.unstubAllGlobals()
    resetNominatimForTesting()
  })

  it('serves a repeated reverse lookup (same ~11 m cell) from cache', async () => {
    fetchMock.mockImplementation(async () => new Response(JSON.stringify(nominatimReverse())))

    const first = await app.inject({ method: 'GET', url: `/geocoding/reverse?lat=${KIGALI.lat}&lon=${KIGALI.lon}` })
    expect(first.statusCode).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(3) // three zoom levels

    const nearby = await app.inject({ method: 'GET', url: `/geocoding/reverse?lat=${KIGALI.lat + 0.00001}&lon=${KIGALI.lon}` })
    expect(nearby.statusCode).toBe(200)
    expect(nearby.json()).toEqual(first.json())
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('does not cache failures', async () => {
    fetchMock.mockResolvedValue(new Response('busy', { status: 503 }))

    const failed = await app.inject({ method: 'GET', url: `/geocoding/reverse?lat=${KIGALI.lat}&lon=${KIGALI.lon}` })
    expect(failed.statusCode).toBe(502)

    fetchMock.mockImplementation(async () => new Response(JSON.stringify(nominatimReverse())))
    const retry = await app.inject({ method: 'GET', url: `/geocoding/reverse?lat=${KIGALI.lat}&lon=${KIGALI.lon}` })
    expect(retry.statusCode).toBe(200)
  })

  it('caches forward lookups by normalized query, including empty results', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify([{ lat: String(KIGALI.lat), lon: String(KIGALI.lon), display_name: 'Remera', address: { suburb: 'Remera' } }]))
    )
    const first = await app.inject({ method: 'GET', url: '/geocoding/forward?q=Remera' })
    const again = await app.inject({ method: 'GET', url: '/geocoding/forward?q=%20%20remera%20' })
    expect(first.json().results).toHaveLength(1)
    expect(again.json()).toEqual(first.json())
    expect(fetchMock).toHaveBeenCalledTimes(1)

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify([])))
    await app.inject({ method: 'GET', url: '/geocoding/forward?q=nowhere' })
    const emptyAgain = await app.inject({ method: 'GET', url: '/geocoding/forward?q=nowhere' })
    expect(emptyAgain.json().results).toEqual([])
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('spaces Nominatim requests by the minimum interval, even when issued concurrently', async () => {
    const startedAt: number[] = []
    fetchMock.mockImplementation(async () => {
      startedAt.push(Date.now())
      return new Response('{}')
    })

    await Promise.all([nominatimFetch('u1'), nominatimFetch('u2'), nominatimFetch('u3')])

    expect(startedAt).toHaveLength(3)
    for (let i = 1; i < startedAt.length; i++) {
      // allow a couple of ms of timer jitter
      expect(startedAt[i] - startedAt[i - 1]).toBeGreaterThanOrEqual(28)
    }
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ headers: { 'User-Agent': expect.stringContaining('CIRA') } })
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal)
  })

  it('keeps going after a failed request', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(new Response('{}'))
    await expect(nominatimFetch('a')).rejects.toThrow('network')
    await expect(nominatimFetch('b')).resolves.toBeInstanceOf(Response)
  })

  it('bounds the in-memory cache', async () => {
    for (let i = 0; i <= 5_000; i++) {
      await setCachedGeocode(`k${i}`, i, 60_000)
    }
    expect(await getCachedGeocode('k0')).toBeNull() // oldest evicted
    expect(await getCachedGeocode('k5000')).toBe(5000)
  })
})
