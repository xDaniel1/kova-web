import { describe, expect, it, vi } from 'vitest'
import {
  OVERPASS_ENDPOINTS, PER_SERVER_MS, blockOf, blockQuery, cameraKind, camerasOnRoute, covers, mergeTollLanes, overpass, parseCameras,
  parseDirections, parseMaxspeed, parseNYCCameras, parseSignals, sampleRoute, signalsOnRoute, warningDetail, warningTitle,
  webcamsNearRoute, type RoadCamera,
} from './roadCameras'

const node = (id: number, lat: number, lon: number, tags: Record<string, string> = {}) => ({ type: 'node', id, lat, lon, tags })

describe('enforcement kinds', () => {
  it('maps OSM enforcement values like iPhone', () => {
    expect(cameraKind(undefined)).toBe('fixedRadar')
    expect(cameraKind('maxspeed')).toBe('fixedRadar')
    expect(cameraKind('traffic_signals')).toBe('redLight')
    expect(cameraKind('average_speed')).toBe('averageSpeed')
    expect(cameraKind('toll')).toBe('tollGantry')
    expect(cameraKind('check')).toBeNull()
  })
  it('reads directions and limits', () => {
    expect(parseDirections('90;NW')).toEqual([90, 315])
    expect(parseDirections('forward')).toEqual([])
    expect(parseDirections('-90')).toEqual([270])
    expect(parseMaxspeed('30 mph')).toBe(48)
    expect(parseMaxspeed('50')).toBe(50)
    expect(parseMaxspeed('signals')).toBeUndefined()
  })
})

describe('parsing cameras and tolls', () => {
  it('merges the seven Verrazzano gantry nodes into one toll, keeping a name', () => {
    const gantry = Array.from({ length: 7 }, (_, i) => node(100 + i, 40.6066 + i * 0.0001, -74.0447 + i * 0.0001, { highway: 'toll_gantry', ...(i === 3 ? { name: 'Verrazzano-Narrows Bridge' } : {}) }))
    const cams = parseCameras(gantry)
    expect(cams).toHaveLength(1)
    expect(cams[0]).toMatchObject({ kind: 'tollGantry', name: 'Verrazzano-Narrows Bridge', headings: [] })
    expect(cams[0].maxSpeedKph).toBeUndefined()
  })
  it('keeps tolls of different kinds, or farther than 150 m apart, separate', () => {
    const cams = mergeTollLanes([
      { id: 'a', lat: 40, lon: -74, kind: 'tollGantry', headings: [] },
      { id: 'b', lat: 40.0005, lon: -74, kind: 'tollBooth', headings: [] },
      { id: 'c', lat: 40.002, lon: -74, kind: 'tollGantry', headings: [] },
    ])
    expect(cams.map((c) => c.id)).toEqual(['a', 'b', 'c'])
  })
  it('takes toll plazas drawn as ways at their centre, and enforcement=toll devices', () => {
    const els = [
      { type: 'way', id: 9, center: { lat: 40.8, lon: -73.9 }, tags: { barrier: 'toll_booth', operator: 'MTA' } },
      { type: 'relation', id: 5, tags: { type: 'enforcement', enforcement: 'toll', maxspeed: '50' }, members: [{ type: 'node', ref: 77, role: 'device' }] },
      node(77, 40.5, -74.2),
    ]
    const cams = parseCameras(els as Parameters<typeof parseCameras>[0])
    expect(cams.find((c) => c.id === 'w9')).toMatchObject({ kind: 'tollBooth', name: 'MTA' })
    const gantry = cams.find((c) => c.id === 'n77')!
    expect(gantry.kind).toBe('tollGantry')
    expect(gantry.maxSpeedKph).toBeUndefined() // no speed limit on tolls
  })
  it('reads speed and red-light cameras, from relations and bare nodes', () => {
    const els = [
      { type: 'relation', id: 1, tags: { type: 'enforcement', enforcement: 'traffic_signals' }, members: [{ type: 'node', ref: 10, role: 'device' }] },
      node(10, 40.7, -73.9, { direction: 'N' }),
      node(11, 40.71, -73.9, { highway: 'speed_camera', maxspeed: '25 mph', direction: '180' }),
      node(12, 40.72, -73.9, { highway: 'speed_camera', enforcement: 'check' }),
    ]
    const cams = parseCameras(els as Parameters<typeof parseCameras>[0])
    expect(cams.map((c) => [c.id, c.kind])).toEqual([['n10', 'redLight'], ['n11', 'fixedRadar']])
    expect(cams[1].maxSpeedKph).toBe(40)
  })
  it('reads lights and stop signs', () => {
    expect(parseSignals([node(1, 1, 1, { highway: 'traffic_signals' }), node(2, 1, 1, { highway: 'stop' }), node(3, 1, 1, { highway: 'crossing' })]).map((s) => s.kind)).toEqual(['light', 'stop'])
  })
  it('keeps only online NYC cameras with an https picture', () => {
    const list = [
      { id: 'a', name: 'QBB @ Crescent St', latitude: 40.75, longitude: -73.94, isOnline: 'true', imageUrl: 'https://webcams.nyctmc.org/api/cameras/a/image' },
      { id: 'b', latitude: 40.75, longitude: -73.94, isOnline: 'false', imageUrl: 'https://x/image' },
      { id: 'c', latitude: 40.75, longitude: -73.94, isOnline: 'true', imageUrl: 'http://x/image' },
    ]
    expect(parseNYCCameras(list).map((c) => c.id)).toEqual(['nyc-a'])
    expect(parseNYCCameras({})).toEqual([])
  })
})

describe('coverage and the route', () => {
  const line = [[-74, 40], [-74, 40.01]] // ~1.1 km due north
  const samples = sampleRoute(line)
  it('a cone only covers the way it faces', () => {
    const cam: RoadCamera = { id: 'x', lat: 40.005, lon: -74, kind: 'fixedRadar', headings: [180], maxSpeedKph: 50 }
    expect(covers(cam, { lat: 40.0045, lon: -74 })).toBe(true) // south of it, in the cone
    expect(covers(cam, { lat: 40.0055, lon: -74 })).toBe(false) // north, behind it
  })
  it('lists cameras the route drives into, in order, never traffic cameras', () => {
    const cams: RoadCamera[] = [
      { id: 'toll', lat: 40.008, lon: -74, kind: 'tollGantry', headings: [] },
      { id: 'radar', lat: 40.003, lon: -74.0003, kind: 'fixedRadar', headings: [], maxSpeedKph: 64 },
      { id: 'side', lat: 40.005, lon: -74.002, kind: 'redLight', headings: [] }, // ~170 m off the road
      { id: 'web', lat: 40.004, lon: -74, kind: 'trafficCamera', headings: [], imageUrl: 'https://x' },
    ]
    const on = camerasOnRoute(samples, cams)
    expect(on.map((o) => o.item.id)).toEqual(['radar', 'toll'])
    expect(on[1].alongMeters).toBeGreaterThan(800)
    expect(webcamsNearRoute(samples, cams).map((c) => c.id)).toEqual(['web'])
  })
  it('keeps lights and stop signs on the route only', () => {
    const sig = signalsOnRoute(samples, [
      { id: 'on', lat: 40.002, lon: -74.0001, kind: 'light' },
      { id: 'off', lat: 40.002, lon: -74.001, kind: 'stop' },
    ])
    expect(sig.map((s) => s.id)).toEqual(['on'])
  })
  it('words the warnings like iPhone', () => {
    const toll: RoadCamera = { id: 't', lat: 0, lon: 0, kind: 'tollGantry', headings: [] }
    expect(warningTitle(toll)).toBe('Toll Camera ahead')
    expect(warningDetail(toll)).toBe('Billed by tag or plate')
    expect(warningDetail({ ...toll, name: 'Verrazzano-Narrows Bridge' })).toBe('Verrazzano-Narrows Bridge')
    expect(warningDetail({ id: 'r', lat: 0, lon: 0, kind: 'fixedRadar', headings: [], maxSpeedKph: 40 })).toBe('25 mph')
    expect(warningDetail({ id: 'r', lat: 0, lon: 0, kind: 'redLight', headings: [] })).toBeUndefined()
  })
})

describe('Overpass', () => {
  it('tries each server in turn and treats a non-JSON 200 as a miss', async () => {
    const calls: string[] = []
    const fetcher = vi.fn(async (url: string) => {
      calls.push(url)
      if (url === OVERPASS_ENDPOINTS[0]) return new Response('busy', { status: 429 })
      if (url === OVERPASS_ENDPOINTS[1]) return new Response('<html>error</html>', { status: 200 })
      if (url === OVERPASS_ENDPOINTS[2]) return new Response('{"elements":[],"remark":"runtime error: timeout"}', { status: 200 })
      return new Response('{"elements":[{"type":"node","id":1,"lat":1,"lon":1}]}', { status: 200 })
    }) as unknown as typeof fetch
    const els = await overpass('[out:json];', undefined, fetcher)
    expect(els).toHaveLength(1)
    expect(calls).toEqual(OVERPASS_ENDPOINTS)
  })
  it('moves on from a server that never answers', async () => {
    vi.useFakeTimers()
    try {
      const fetcher = vi.fn((url: string, init?: RequestInit) => url === OVERPASS_ENDPOINTS[0]
        ? new Promise<Response>((_, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))))
        : Promise.resolve(new Response('{"elements":[{"type":"node","id":2,"lat":1,"lon":1}]}', { status: 200 }))) as unknown as typeof fetch
      const pending = overpass('q', undefined, fetcher)
      await vi.advanceTimersByTimeAsync(PER_SERVER_MS + 1)
      expect(await pending).toHaveLength(1)
    } finally {
      vi.useRealTimers()
    }
  })
  it('returns null when every server fails', async () => {
    const fetcher = (async () => new Response('x', { status: 504 })) as unknown as typeof fetch
    expect(await overpass('q', undefined, fetcher)).toBeNull()
  })
  it('asks for tolls, toll ways with centres, cameras and signals in one block', () => {
    const q = blockQuery(blockOf(40.6, -74.05))
    for (const part of ['toll_gantry', 'toll_booth', 'way["barrier"="toll_booth"]', 'speed_camera', 'r.r:"device"', 'traffic_signals|stop', 'out body center']) expect(q).toContain(part)
  })
})
