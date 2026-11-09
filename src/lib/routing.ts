import { config } from './config'
import type { Route, TravelMode } from './types'

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

const profile: Record<TravelMode, string> = { driving: 'driving', walking: 'foot', cycling: 'bike' }

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
