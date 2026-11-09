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

export async function fetchRoute(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
  mode: TravelMode,
  signal?: AbortSignal,
): Promise<Route> {
  const coords = `${from.longitude},${from.latitude};${to.longitude},${to.latitude}`
  const url = new URL(`/route/v1/${profile[mode]}/${coords}`, config.router.baseURL)
  url.searchParams.set('overview', 'full')
  url.searchParams.set('geometries', 'geojson')
  url.searchParams.set('steps', 'true')
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`Routing failed (${res.status})`)
  const json = (await res.json()) as { code: string; routes: OSRMRoute[] }
  const first = json.routes?.[0]
  if (json.code !== 'Ok' || !first) throw new Error('No route found')
  return {
    mode,
    distanceMeters: first.distance,
    durationSeconds: first.duration,
    geometry: first.geometry,
    steps: first.legs.flatMap((leg) =>
      leg.steps.map((s) => ({ instruction: describe(s), distanceMeters: s.distance, name: s.name })),
    ),
  }
}
