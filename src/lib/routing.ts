import { config } from './config'
import { parseDuration, transitRoutes, type TransitStep } from './google'
import { decodePolyline } from './polyline'
import type { Route, RouteStep, TravelMode } from './types'

interface OSRMStep {
  distance: number
  name: string
  maneuver: { type: string; modifier?: string }
}
interface OSRMRoute {
  distance: number
  duration: number
  geometry: GeoJSON.LineString
  legs: { steps: OSRMStep[] }[]
}

const profile: Record<Exclude<TravelMode, 'transit'>, string> = { driving: 'driving', walking: 'foot', cycling: 'bike' }

function describe(step: OSRMStep): string {
  const { type, modifier } = step.maneuver
  const onto = step.name ? ` onto ${step.name}` : ''
  switch (type) {
    case 'depart':
      return `Head ${modifier ?? 'out'}${step.name ? ` on ${step.name}` : ''}`
    case 'arrive':
      return 'Arrive at your destination'
    case 'roundabout':
    case 'rotary':
      return `Take the roundabout${onto}`
    case 'merge':
      return `Merge${onto}`
    case 'on ramp':
      return `Take the ramp${onto}`
    case 'off ramp':
      return `Take the exit${onto}`
    case 'fork':
      return `Keep ${modifier ?? 'straight'}${onto}`
    case 'continue':
    case 'new name':
      return `Continue${onto}`
    default:
      return modifier ? `Turn ${modifier}${onto}` : `Continue${onto}`
  }
}

/** Routes through every point in order. Alternatives are only offered by OSRM for two-point trips. */
export async function fetchRoutes(
  points: { latitude: number; longitude: number }[],
  mode: TravelMode,
  signal?: AbortSignal,
): Promise<Route[]> {
  if (points.length < 2) throw new Error('Need at least two places')
  if (mode === 'transit') return fetchTransit(points)
  const coords = points.map((p) => `${p.longitude},${p.latitude}`).join(';')
  const url = new URL(`/route/v1/${profile[mode]}/${coords}`, config.router.baseURL)
  url.searchParams.set('overview', 'full')
  url.searchParams.set('geometries', 'geojson')
  url.searchParams.set('steps', 'true')
  if (points.length === 2) url.searchParams.set('alternatives', '2')
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(res.status === 400 ? 'No route between these places' : `Routing failed (${res.status})`)
  const json = (await res.json()) as { code: string; routes: OSRMRoute[] }
  if (json.code !== 'Ok' || !json.routes?.length) throw new Error('No route found')
  return json.routes.map((r) => ({
    mode,
    distanceMeters: r.distance,
    durationSeconds: r.duration,
    geometry: r.geometry,
    legs: r.legs.map((leg) => leg.steps.map((s) => ({ instruction: describe(s), distanceMeters: s.distance, name: s.name }))),
    steps: r.legs.flatMap((leg) =>
      leg.steps.map((s) => ({ instruction: describe(s), distanceMeters: s.distance, name: s.name })),
    ),
  }))
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
  return {
    instruction: step.navigationInstruction?.instructions?.split('\n')[0] || 'Walk',
    distanceMeters: step.distanceMeters ?? 0,
    name: '',
    durationSeconds: seconds,
    geometry,
  }
}

/** Google transit only routes between two points; the panel limits the Transit tab to that. */
async function fetchTransit(points: { latitude: number; longitude: number }[]): Promise<Route[]> {
  if (points.length !== 2) throw new Error('Transit directions work between two places. Remove the extra stops to see them.')
  const routes = await transitRoutes(points[0], points[1])
  if (!routes.length) throw new Error('No transit route found')
  return routes.map((r) => {
    const rawSteps = r.legs.flatMap((l) => l.steps)
    // Collapse consecutive short walking steps into one, as Apple and Google Maps do.
    const steps: RouteStep[] = []
    for (const raw of rawSteps) {
      const s = transitStep(raw)
      const prev = steps[steps.length - 1]
      if (!s.transit && prev && !prev.transit) {
        prev.distanceMeters += s.distanceMeters
        prev.durationSeconds = (prev.durationSeconds ?? 0) + (s.durationSeconds ?? 0)
        if (prev.geometry && s.geometry) prev.geometry.coordinates.push(...s.geometry.coordinates)
        continue
      }
      if (!s.transit) s.instruction = 'Walk'
      steps.push(s)
    }
    for (const s of steps) if (!s.transit) s.instruction = `Walk ${s.transit ? '' : 'to ' + (steps[steps.indexOf(s) + 1]?.transit?.from ?? 'your destination')}`
    const fare = r.travelAdvisory?.transitFare
    return {
      mode: 'transit',
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
