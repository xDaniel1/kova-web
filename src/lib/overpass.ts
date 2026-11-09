import type { Route, RouteStep } from './types'

// OpenStreetMap via Overpass, the same source the iOS SpeedLimitService and LaneGuidanceService
// use. Donated servers with a fair-use policy: one query per route, bounded boxes, short timeouts.

const ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter']

interface Way {
  id: number
  tags?: Record<string, string>
  geometry?: { lat: number; lon: number }[]
}

async function overpass(query: string, signal?: AbortSignal): Promise<Way[]> {
  let lastError: Error | null = null
  for (const endpoint of ENDPOINTS) {
    try {
      const res = await fetch(endpoint, { method: 'POST', body: 'data=' + encodeURIComponent(query), signal })
      if (!res.ok) throw new Error(`Overpass ${res.status}`)
      const json = (await res.json()) as { elements: Way[] }
      return json.elements.filter((e) => e.geometry && e.tags)
    } catch (e) {
      if (signal?.aborted) throw e
      lastError = e as Error
    }
  }
  throw lastError ?? new Error('Overpass unavailable')
}

function metersBetween(a: [number, number], b: { lat: number; lon: number }): number {
  const dLat = (b.lat - a[1]) * 111_320
  const dLon = (b.lon - a[0]) * 111_320 * Math.cos((a[1] * Math.PI) / 180)
  return Math.sqrt(dLat * dLat + dLon * dLon)
}

function nearestWay(ways: Way[], point: [number, number], within: number): Way | null {
  let best: Way | null = null
  let bestD = within
  for (const w of ways) {
    for (const g of w.geometry!) {
      const d = metersBetween(point, g)
      if (d < bestD) {
        bestD = d
        best = w
      }
    }
  }
  return best
}

/** "25 mph", "30", "50 km/h" → a short sign label. Implicit zone values are skipped. */
export function speedLabel(raw: string): string | null {
  const m = raw.match(/^(\d+)(?:\s*(mph|km\/h))?$/i)
  if (!m) return null
  return m[2]?.toLowerCase() === 'mph' ? `${m[1]} mph` : `${m[1]} km/h`
}

/** Splits "left|through|through;right" into one entry per lane. */
export function parseLanes(raw: string): string[] {
  return raw.split('|').map((l) => l.trim() || 'none')
}

/**
 * Annotates a driving route's steps with the posted speed limit on each step's road and the
 * turn:lanes at each maneuver point. One Overpass query for the whole route.
 */
export async function annotateRoute(route: Route, signal?: AbortSignal): Promise<Route> {
  if (route.mode === 'transit' || route.steps.length === 0) return route
  // Where each step starts, from the route geometry split by step distances.
  const coords = route.geometry.coordinates as [number, number][]
  const starts: [number, number][] = []
  let acc = 0
  let target = 0
  let ci = 0
  for (const step of route.steps) {
    while (ci < coords.length - 1 && acc < target) {
      acc += metersBetween(coords[ci], { lon: coords[ci + 1][0], lat: coords[ci + 1][1] })
      ci++
    }
    starts.push(coords[Math.min(ci, coords.length - 1)])
    target += step.distanceMeters
  }
  const boxes = starts.map((p) => {
    const d = 0.0006
    return `way(${(p[1] - d).toFixed(5)},${(p[0] - d).toFixed(5)},${(p[1] + d).toFixed(5)},${(p[0] + d).toFixed(5)})["highway"]["maxspeed"];way(${(p[1] - d).toFixed(5)},${(p[0] - d).toFixed(5)},${(p[1] + d).toFixed(5)},${(p[0] + d).toFixed(5)})["highway"][~"^turn:lanes"~"."];`
  })
  const query = `[out:json][timeout:20];(${boxes.join('')});out tags geom 400;`
  const ways = await overpass(query, signal)
  const speedWays = ways.filter((w) => w.tags!.maxspeed)
  const laneWays = ways.filter((w) => Object.keys(w.tags!).some((k) => k.startsWith('turn:lanes')))

  const steps: RouteStep[] = route.steps.map((step, i) => {
    const out = { ...step }
    // Speed: prefer the way whose name matches the step's road, else the nearest tagged way just after the maneuver.
    const after = starts[Math.min(i + 1, starts.length - 1)]
    const probe: [number, number] = [(starts[i][0] * 2 + after[0]) / 3, (starts[i][1] * 2 + after[1]) / 3]
    const named = step.name ? speedWays.filter((w) => w.tags!.name === step.name) : []
    const sw = nearestWay(named.length ? named : speedWays, probe, 40)
    if (sw) out.speedLimit = speedLabel(sw.tags!.maxspeed) ?? undefined
    // Lanes: a tagged way within 30 m of the maneuver point, as LaneGuidanceService does.
    if (i > 0) {
      const lw = nearestWay(laneWays, starts[i], 30)
      const raw = lw?.tags!['turn:lanes'] ?? lw?.tags!['turn:lanes:forward'] ?? lw?.tags!['turn:lanes:backward']
      if (raw) out.lanes = parseLanes(raw)
    }
    return out
  })
  // Keep legs in sync with the annotated steps.
  let k = 0
  const legs = route.legs.map((leg) => leg.map(() => steps[k++]))
  return { ...route, steps, legs }
}
