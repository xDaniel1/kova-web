import { afterEach, describe, expect, it, vi } from 'vitest'
vi.mock('./supabase', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'user-session' } } }) } } }))
import { BUNDLED_VENUES, loadVenues, parseVenueRows, storedVenues } from './venues'
const row = { short_name: 'NEW', name: 'New Airport', latitude: 28.4, longitude: -81.3, radius_m: 2000, kind: 'airport' }
const storage = new Map<string, string>()
vi.stubGlobal('localStorage', { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => storage.set(k, v) })
afterEach(() => { vi.unstubAllGlobals() })

describe('live venue cache', () => {
  it('rejects null coordinates instead of inventing a venue at 0,0', () => {
    expect(parseVenueRows([{ ...row, latitude: null }, { ...row, longitude: null }, { ...row, radius_m: false }, { ...row, radius_m: Infinity }])).toEqual([])
  })
  it('refreshes remote entries, uses the signed-in token, and clears stale remote rows on empty success', async () => {
    vi.stubGlobal('localStorage', { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => storage.set(k, v) })
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify([row]))).mockResolvedValueOnce(new Response('[]'))
    vi.stubGlobal('fetch', fetcher)
    expect((await loadVenues(true)).some(v => v.shortName === 'NEW')).toBe(true)
    expect(fetcher.mock.calls[0][1].headers.Authorization).toBe('Bearer user-session')
    expect(await loadVenues(true)).toEqual(BUNDLED_VENUES)
    expect(storedVenues()).toEqual(BUNDLED_VENUES)
  })
})
