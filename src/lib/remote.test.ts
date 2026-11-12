import { describe, expect, it } from 'vitest'
import { NORMAL, allows, announcementLive, isVersionBelow, parseConfig, parseMessages, requiresUpdate, updateAvailable, webURL } from './remote'

describe('version rules', () => {
  it('compares dotted integers', () => {
    expect(isVersionBelow('1.9', '1.10')).toBe(true)
    expect(isVersionBelow('1.2', '1.2.0')).toBe(false)
    expect(isVersionBelow('1.0.0', '1.0.1')).toBe(true)
    expect(isVersionBelow('2.0', '1.9.9')).toBe(false)
  })
  it('never blocks on garbage', () => {
    expect(isVersionBelow('1.0.0', 'abc')).toBe(false)
    expect(isVersionBelow('1.0.0', '1.0-beta')).toBe(false)
    expect(isVersionBelow('1.0.0', '')).toBe(false)
  })
  it('applies minimum and latest for the web platform only', () => {
    const c = parseConfig([
      { key: 'min_version', value: { ios: '9.0', web: '1.0.0', message: 'm' } },
      { key: 'latest_version', value: { web: '1.1.0', store_urls: { web: 'https://app.kovamaps.com' } } },
    ])!
    expect(requiresUpdate(c, '1.0.0')).toBe(false)
    expect(updateAvailable(c, '1.0.0')).toBe(true)
    expect(requiresUpdate(c, '0.9')).toBe(true)
    expect(updateAvailable(c, '0.9')).toBe(false)
    expect(c.latestVersion.storeURL).toBe('https://app.kovamaps.com/')
  })
})

describe('fail-safe parsing', () => {
  it('returns null for non-arrays and defaults for empty', () => {
    expect(parseConfig({})).toBeNull()
    expect(parseConfig([])).toEqual(NORMAL)
  })
  it('ignores unknown keys and wrongly typed values', () => {
    const c = parseConfig([
      { key: 'mystery', value: { x: 1 } },
      { key: 'maintenance', value: { enabled: 'yes' } },
      { key: 'features', value: { sync: 'no', indoor_maps: false } },
      { key: 'announcement', value: { enabled: true, title: 'Hi', level: 'shouty', url: 'javascript:alert(1)' } },
      { key: 'min_version', value: 'oops' },
    ])!
    expect(c.maintenance.enabled).toBe(false)
    expect(c.features.sync).toBe(true)
    expect(c.features.indoorMaps).toBe(false)
    expect(c.announcement.level).toBe('info')
    expect(c.announcement.url).toBeNull()
    expect(c.minimumVersion.web).toBeNull()
  })
  it('maintenance turns every feature off', () => {
    const c = parseConfig([{ key: 'maintenance', value: { enabled: true, message: 'Back soon' } }])!
    expect(allows(c, 'sync')).toBe(false)
    expect(allows(NORMAL, 'sync')).toBe(true)
  })
})

describe('announcement window', () => {
  const base = { enabled: true, title: 'T', body: '', level: 'info' as const, url: null, startsAt: null, endsAt: null }
  it('respects starts_at and ends_at', () => {
    const now = Date.parse('2026-11-09T12:00:00Z')
    expect(announcementLive(base, now)).toBe(true)
    expect(announcementLive({ ...base, startsAt: '2026-11-10T00:00:00Z' }, now)).toBe(false)
    expect(announcementLive({ ...base, endsAt: '2026-11-09T12:00:00Z' }, now)).toBe(false)
    expect(announcementLive({ ...base, title: '' }, now)).toBe(false)
  })
})

describe('messages', () => {
  it('drops malformed rows and sorts oldest first', () => {
    const m = parseMessages([
      { id: 'b', title: 'B', body: 'x', created_at: '2026-11-09T02:00:00Z' },
      { id: 'a', title: 'A', body: 'y', created_at: '2026-11-09T01:00:00Z', url: 'ftp://nope' },
      { title: 'no id' },
    ])
    expect(m.map((x) => x.id)).toEqual(['a', 'b'])
    expect(m[0].url).toBeNull()
  })
  it('only accepts http(s) links', () => {
    expect(webURL('https://kovamaps.com')).toBe('https://kovamaps.com/')
    expect(webURL('mailto:x@y.z')).toBeNull()
  })
})

describe('reportClient', () => {
  it('does not report from automated browsers', async () => {
    const { reportClient } = await import('./remote')
    const calls: unknown[] = []
    const realFetch = globalThis.fetch
    globalThis.fetch = (async (...a: unknown[]) => { calls.push(a); return new Response('{}') }) as typeof fetch
    Object.defineProperty(globalThis, 'navigator', { value: { webdriver: true, userAgent: 'HeadlessChrome' }, configurable: true })
    try { await reportClient() } finally { globalThis.fetch = realFetch }
    expect(calls).toHaveLength(0)
  })

  it('sends channel and the config keys this build honours', async () => {
    const { reportClient, CONFIG_KEYS } = await import('./remote')
    const bodies: Record<string, unknown>[] = []
    const realFetch = globalThis.fetch
    globalThis.fetch = (async (url: string, init?: RequestInit) => { if (String(url).includes('report_client')) bodies.push(JSON.parse(String(init?.body))); return new Response('{}') }) as typeof fetch
    Object.defineProperty(globalThis, 'navigator', { value: { webdriver: false, userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/130.0' }, configurable: true })
    try { await reportClient() } finally { globalThis.fetch = realFetch }
    expect(bodies).toHaveLength(1)
    expect(['production', 'beta', 'test', 'dev']).toContain(bodies[0].channel)
    expect(bodies[0].config_keys).toEqual(CONFIG_KEYS)
    for (const k of CONFIG_KEYS) expect(k).toMatch(/^[a-z0-9_.]+$/)
    expect(CONFIG_KEYS.length).toBeLessThanOrEqual(64)
  })
})

describe('web platform controls', () => {
  it('defaults new switches on and ignores malformed values and other platforms', () => {
    const c = parseConfig([{ key: 'features', value: { speed_limits: 'false', transit: null } },
      { key: 'platform_overrides', value: { ios: { features: { transit: false } }, web: 'bad' } }])!
    for (const feature of ['speedLimits', 'trafficColoring', 'transit', 'voiceGuidance'] as const) expect(allows(c, feature)).toBe(true)
  })
  it('applies global AND web switches regardless of row order', () => {
    const rows = [{ key: 'features', value: { speed_limits: false, traffic_coloring: true, transit: true, voice_guidance: false } },
      { key: 'platform_overrides', value: { web: { features: { speed_limits: true, traffic_coloring: false, transit: false, voice_guidance: true } } } }]
    for (const data of [rows, [...rows].reverse()]) {
      const c = parseConfig(data)!
      for (const feature of ['speedLimits', 'trafficColoring', 'transit', 'voiceGuidance'] as const) expect(allows(c, feature)).toBe(false)
    }
  })
  it('cannot override global maintenance off, and uses the web message when enabled', () => {
    const global = { key: 'maintenance', value: { enabled: true, message: 'Global' } }
    expect(parseConfig([global, { key: 'platform_overrides', value: { web: { maintenance: { enabled: false } } } }])!.maintenance.enabled).toBe(true)
    expect(parseConfig([global, { key: 'platform_overrides', value: { web: { maintenance: { enabled: true, message: 'Web' } } } }])!.maintenance.message).toBe('Web')
  })
  it('uses a live web announcement with global fallback outside its window', async () => {
    const { effectiveAnnouncement } = await import('./remote')
    const c = parseConfig([{ key: 'announcement', value: { enabled: true, title: 'Global' } },
      { key: 'platform_overrides', value: { web: { announcement: { enabled: true, title: 'Web', starts_at: '2026-11-11T10:00:00Z', ends_at: '2026-11-11T11:00:00Z' } } } }])!
    expect(effectiveAnnouncement(c, Date.parse('2026-11-11T10:30:00Z')).title).toBe('Web')
    expect(effectiveAnnouncement(c, Date.parse('2026-11-11T11:00:00Z')).title).toBe('Global')
  })
})
