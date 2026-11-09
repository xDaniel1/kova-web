import { config } from './config'
import { parseDuration, transitRoutes, type TransitStep } from './google'
import { decodePolyline } from './polyline'
import type { Lane, Route, RouteStep, TravelMode } from './types'

// Mapbox Directions for drive (live traffic), walk and bike; Google Routes (via the Edge
// Function) for transit. Mapbox annotations give per-segment congestion and posted speed limits,
// and intersections carry lane indications, so no separate lookups are needed.

const profile: Record<Exclude<TravelMode, 'transit'>, string> = {
  driving: 'mapbox/driving-traffic',
  walking: 'mapbox/walking',
  cycling: 'mapbox/cycling',
}

interface MBStep {
  distance: number
  duration: number
  name: string
  geometry: GeoJSON.LineString
  maneuver: { instruction: string; type: string; modifier?: string }
  intersections?: { lanes?: { valid: boolean; indications: string[] }[] }[]
}
interface MBLeg {
  steps: MBStep[]
  annotation?: { congestion?: string[]; maxspeed?: ({ speed: number; unit: string } | { unknown: true } | { none: true })[] }
}
interface MBRoute {
  distance: number
  duration: number
  geometry: GeoJSON.LineString
  legs: MBLeg[]
}

/** Posted limit as a sign shows it. Mapbox reports km/h; US signs are in mph (5 mph steps). */
export function speedLabel(m: { speed?: number; unit?: string } | undefined): string | undefined {
  if (!m || m.speed === undefined) return undefined
  if (m.unit === 'mph') return `${m.speed} mph`
  return `${Math.round((m.speed * 0.621371) / 5) * 5} mph`
}

function legSteps(leg: MBLeg): { steps: RouteStep[]; congestion: string[] } {
  const maxspeed = leg.annotation?.maxspeed ?? []
  const congestion = leg.annotation?.congestion ?? []
  let seg = 0
  const steps: RouteStep[] = leg.steps.map((s) => {
    const n = Math.max(0, s.geometry.coordinates.length - 1)
    // Most common posted limit along this step.
    const counts = new Map<string, number>()
    for (let i = seg; i < seg + n; i++) {
      const label = speedLabel(maxspeed[i] as { speed?: number; unit?: string })
      if (label) counts.set(label, (counts.get(label) ?? 0) + 1)
    }
    seg += n
    const speedLimit = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
    return {
      instruction: s.maneuver.instruction.replace(/\.$/, ''),
      distanceMeters: s.distance,
      durationSeconds: s.duration,
      name: s.name,
      geometry: s.geometry,
      speedLimit,
      maneuver: { type: s.maneuver.type, modifier: s.maneuver.modifier },
    }
  })
  // Lanes for a maneuver are reported on the last intersection of the step before it.
  leg.steps.forEach((s, i) => {
    const withLanes = (s.intersections ?? []).filter((x) => x.lanes?.length)
    const last = withLanes[withLanes.length - 1]
    if (last && steps[i + 1]) steps[i + 1].lanes = last.lanes!.map((l): Lane => ({ directions: l.indications, valid: l.valid }))
  })
  return { steps, congestion }
}

export type RouteTime = { kind: 'now' } | { kind: 'depart' | 'arrive'; at: string }

export async function fetchRoutes(points: { latitude: number; longitude: number }[], mode: TravelMode, signal?: AbortSignal, when: RouteTime = { kind: 'now' }): Promise<Route[]> {
  if (points.length < 2) throw new Error('Need at least two places')
  if (mode === 'transit') return fetchTransit(points, when)
  if (points.length > 25) throw new Error('Up to 25 stops are supported')
  const coords = points.map((p) => `${p.longitude.toFixed(6)},${p.latitude.toFixed(6)}`).join(';')
  const url = new URL(`https://api.mapbox.com/directions/v5/${profile[mode]}/${coords}`)
  url.searchParams.set('alternatives', points.length === 2 ? 'true' : 'false')
  url.searchParams.set('geometries', 'geojson')
  url.searchParams.set('overview', 'full')
  url.searchParams.set('steps', 'true')
  url.searchParams.set('language', 'en')
  if (mode === 'driving') url.searchParams.set('annotations', 'congestion,maxspeed')
  // Typical traffic for a future time (local time at the origin, no zone).
  if (mode === 'driving' && when.kind === 'depart') url.searchParams.set('depart_at', when.at.slice(0, 16))
  if (mode === 'driving' && when.kind === 'arrive') url.searchParams.set('arrive_by', when.at.slice(0, 16))
  url.searchParams.set('access_token', config.mapbox.token)
  const res = await fetch(url, { signal })
  const json = (await res.json()) as { code: string; message?: string; routes?: MBRoute[] }
  if (!res.ok || json.code !== 'Ok' || !json.routes?.length) {
    throw new Error(json.code === 'NoRoute' ? 'No route between these places' : json.message ?? `Routing failed (${res.status})`)
  }
  return json.routes.map((r) => {
    const legs = r.legs.map(legSteps)
    return {
      mode,
      distanceMeters: r.distance,
      durationSeconds: r.duration,
      geometry: r.geometry,
      legs: legs.map((l) => l.steps),
      steps: legs.flatMap((l) => l.steps),
      congestion: mode === 'driving' ? legs.flatMap((l) => l.congestion) : undefined,
    }
  })
}

function vehicleName(step: TransitStep): string {
  const v = step.transitDetails?.transitLine.vehicle
  return v?.name?.text ?? (v?.type ? v.type.charAt(0) + v.type.slice(1).toLowerCase().replace('_', ' ') : 'Transit')
}

function transitStep(step: TransitStep): RouteStep {
  const seconds = parseDuration(step.staticDuration)
  const geometry = step.polyline?.encodedPolyline
    ? ({ type: 'LineString', coordinates: decodePolyline(step.polyline.encodedPolyline) } as GeoJSON.LineString)
    : undefined
  if (step.travelMode === 'TRANSIT' && step.transitDetails) {
    const td = step.transitDetails
    const line = td.transitLine.nameShort ?? td.transitLine.name ?? vehicleName(step)
    return {
      instruction: `Take the ${line} ${vehicleName(step).toLowerCase()} from ${td.stopDetails.departureStop.name} to ${td.stopDetails.arrivalStop.name}`,
      distanceMeters: step.distanceMeters ?? 0,
      name: line,
      durationSeconds: seconds,
      geometry,
      transit: {
        line,
        color: td.transitLine.color ?? '#6b7280',
        textColor: td.transitLine.textColor ?? '#ffffff',
        vehicle: vehicleName(step),
        from: td.stopDetails.departureStop.name,
        to: td.stopDetails.arrivalStop.name,
        stops: td.stopCount,
        headsign: td.headsign,
        departureTime: td.stopDetails.departureTime,
        arrivalTime: td.stopDetails.arrivalTime,
      },
    }
  }
  return { instruction: 'Walk', distanceMeters: step.distanceMeters ?? 0, name: '', durationSeconds: seconds, geometry }
}

/** Google transit routes between two points only; the panel says so when there are stops. */
async function fetchTransit(points: { latitude: number; longitude: number }[], when: RouteTime): Promise<Route[]> {
  if (points.length !== 2) throw new Error('Transit directions work between two places. Remove the extra stops to see them.')
  const iso = when.kind === 'now' ? undefined : new Date(when.at).toISOString()
  const routes = await transitRoutes(points[0], points[1], when.kind === 'depart' ? { departureTime: iso } : when.kind === 'arrive' ? { arrivalTime: iso } : undefined)
  if (!routes.length) throw new Error('No transit route found')
  return routes.map((r) => {
    const steps: RouteStep[] = []
    for (const raw of r.legs.flatMap((l) => l.steps)) {
      const s = transitStep(raw)
      const prev = steps[steps.length - 1]
      // Merge consecutive walking steps into one "Walk to …" row, as Google Maps shows it.
      if (!s.transit && prev && !prev.transit) {
        prev.distanceMeters += s.distanceMeters
        prev.durationSeconds = (prev.durationSeconds ?? 0) + (s.durationSeconds ?? 0)
        if (prev.geometry && s.geometry) prev.geometry.coordinates.push(...s.geometry.coordinates)
        continue
      }
      steps.push(s)
    }
    steps.forEach((s, i) => {
      if (!s.transit) s.instruction = `Walk to ${steps[i + 1]?.transit?.from ?? 'your destination'}`
    })
    const fare = r.travelAdvisory?.transitFare
    return {
      mode: 'transit' as const,
      distanceMeters: r.distanceMeters,
      durationSeconds: parseDuration(r.duration),
      geometry: { type: 'LineString', coordinates: r.polyline ? decodePolyline(r.polyline.encodedPolyline) : [] },
      legs: [steps],
      steps,
      description: r.description,
      fare: fare?.units ? `${fare.currencyCode === 'USD' ? '$' : fare.currencyCode + ' '}${fare.units}${fare.nanos ? '.' + String(Math.round(fare.nanos / 1e7)).padStart(2, '0') : ''}` : undefined,
    }
  })
}
