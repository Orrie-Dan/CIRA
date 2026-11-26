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

describe('administrative units routes', () => {
  let app: FastifyInstance
  const fetchMock = vi.fn()

  beforeEach(async () => {
    setRedisForTesting(null)
    resetNominatimForTesting({ minIntervalMs: 0 })
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

  it('serves the province > cell tree, cacheable', async () => {
    const res = await app.inject({ method: 'GET', url: '/geocoding/admin-units' })
    expect(res.statusCode).toBe(200)
    expect(res.headers['cache-control']).toContain('max-age')
    const kigali = res.json().provinces.find((p: { name: string }) => p.name === 'Kigali City')
    const gasabo = kigali.districts.find((d: { name: string }) => d.name === 'Gasabo')
    const remera = gasabo.sectors.find((s: { name: string }) => s.name === 'Remera')
    expect(remera.cells).toEqual(expect.arrayContaining(['Nyabisindu', 'Nyarutarama']))
  })

  it('serves villages per cell and 404s an unknown path', async () => {
    const ok = await app.inject({ method: 'GET', url: '/geocoding/admin-units/villages?district=gasabo&sector=Remera&cell=Nyabisindu' })
    expect(ok.statusCode).toBe(200)
    expect(ok.json().villages).toContain('Amarembo I')

    const missing = await app.inject({ method: 'GET', url: '/geocoding/admin-units/villages?district=Huye&sector=Remera&cell=Nyabisindu' })
    expect(missing.statusCode).toBe(404)
    const invalid = await app.inject({ method: 'GET', url: '/geocoding/admin-units/villages?district=Gasabo' })
    expect(invalid.statusCode).toBe(400)
  })

  it('keeps the legacy sectors endpoint working from the new data', async () => {
    const res = await app.inject({ method: 'GET', url: '/geocoding/sectors?district=Rwamagana' })
    expect(res.statusCode).toBe(200)
    expect(res.json().sectors).toContain('Gishari')
    expect(res.json().count).toBe(14)
  })

  it('snaps reverse-geocoded names to official ones and drops unmatched levels', async () => {
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({
      display_name: 'KG 11 Ave, Nyabisindu, Remera, Gasabo, Kigali City, Rwanda',
      address: { country_code: 'rw', road: 'KG 11 Ave', suburb: 'Kisimenti', quarter: 'Nyabisindu', city_district: 'Remera', county: 'Gasabo', state: 'Kigali City' },
    })))
    const res = await app.inject({ method: 'GET', url: `/geocoding/reverse?lat=${KIGALI.lat}&lon=${KIGALI.lon}` })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ province: 'Kigali City', district: 'Gasabo', sector: 'Remera', cell: 'Nyabisindu' })
    expect(res.json().village).toBeUndefined()

    // A suburb that is not a sector of the district is not returned as one.
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({
      display_name: 'Somewhere, Huye, Southern Province, Rwanda',
      address: { country_code: 'rw', suburb: 'Remera', county: 'Huye' },
    })))
    const other = await app.inject({ method: 'GET', url: '/geocoding/reverse?lat=-2.6&lon=29.74' })
    expect(other.json()).toMatchObject({ province: 'Southern Province', district: 'Huye' })
    expect(other.json().sector).toBeUndefined()
  })
})
