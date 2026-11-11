import { describe, expect, it } from 'vitest'
import { speedLabel } from './routing'

describe('speedLabel', () => {
  it('converts km/h to the US sign value', () => {
    expect(speedLabel({ speed: 40, unit: 'km/h' })).toBe('25 mph')
    expect(speedLabel({ speed: 80, unit: 'km/h' })).toBe('50 mph')
    expect(speedLabel({ speed: 105, unit: 'km/h' })).toBe('65 mph')
  })
  it('keeps mph and skips unknowns', () => {
    expect(speedLabel({ speed: 30, unit: 'mph' })).toBe('30 mph')
    expect(speedLabel(undefined)).toBeUndefined()
    expect(speedLabel({})).toBeUndefined()
  })
})

describe('route feature network gates', () => {
  it('does not call a provider when transit is disabled', async () => {
    const { fetchRoutes } = await import('./routing')
    await expect(fetchRoutes([{ latitude: 1, longitude: 1 }, { latitude: 2, longitude: 2 }], 'transit', undefined, { kind: 'now' }, { speedLimits: true, trafficColoring: true, transit: false })).rejects.toThrow('Transit is paused')
  })
  it('requests only enabled driving annotations', async () => {
    const { fetchRoutes } = await import('./routing')
    const original = globalThis.fetch
    const urls: URL[] = []
    globalThis.fetch = (async (url: string | URL | Request) => {
      urls.push(new URL(String(url)))
      return new Response(JSON.stringify({ routes: [] }), { status: 200 })
    }) as typeof fetch
    try {
      for (const features of [
        { speedLimits: false, trafficColoring: false, transit: true },
        { speedLimits: true, trafficColoring: false, transit: true },
        { speedLimits: false, trafficColoring: true, transit: true },
      ]) await fetchRoutes([{ latitude: 1, longitude: 1 }, { latitude: 2, longitude: 2 }], 'driving', undefined, { kind: 'now' }, features).catch(() => {})
      expect(urls.map((url) => url.searchParams.get('annotations'))).toEqual([null, 'maxspeed', 'congestion'])
    } finally { globalThis.fetch = original }
  })
})
