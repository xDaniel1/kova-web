import { config } from './config'
import type { Place } from './types'

// Mapbox Search Box API (suggest → retrieve, billed per session) and Geocoding v6 reverse.

const API = 'https://api.mapbox.com'
const token = () => config.mapbox.token

let session = crypto.randomUUID()
/** Start a new billing session after a suggestion has been retrieved. */
function endSession() {
  session = crypto.randomUUID()
}

export interface Suggestion {
  id: string
  name: string
  address: string
  kind: string
  category?: string
}

export async function suggest(query: string, near?: { latitude: number; longitude: number }, signal?: AbortSignal): Promise<Suggestion[]> {
  const url = new URL('/search/searchbox/v1/suggest', API)
  url.searchParams.set('q', query)
  url.searchParams.set('limit', '8')
  url.searchParams.set('language', 'en')
  url.searchParams.set('session_token', session)
  url.searchParams.set('access_token', token())
  if (near) url.searchParams.set('proximity', `${near.longitude},${near.latitude}`)
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`Search failed (${res.status})`)
  const json = (await res.json()) as {
    suggestions: { mapbox_id: string; name: string; full_address?: string; place_formatted?: string; feature_type: string; poi_category?: string[] }[]
  }
  return json.suggestions.map((s) => ({
    id: s.mapbox_id,
    name: s.name,
    address: s.full_address ?? s.place_formatted ?? '',
    kind: s.feature_type,
    category: s.poi_category?.[0],
  }))
}

export async function retrieve(s: Suggestion): Promise<Place> {
  const url = new URL(`/search/searchbox/v1/retrieve/${encodeURIComponent(s.id)}`, API)
  url.searchParams.set('session_token', session)
  url.searchParams.set('access_token', token())
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Search failed (${res.status})`)
  endSession()
  const json = (await res.json()) as { features: { geometry: { coordinates: [number, number] } }[] }
  const [longitude, latitude] = json.features[0].geometry.coordinates
  return { title: s.name, subtitle: s.address, latitude, longitude, kind: s.category }
}

export async function reverseGeocode(latitude: number, longitude: number): Promise<Place> {
  const url = new URL('/search/geocode/v6/reverse', API)
  url.searchParams.set('longitude', String(longitude))
  url.searchParams.set('latitude', String(latitude))
  url.searchParams.set('limit', '1')
  url.searchParams.set('access_token', token())
  const fallback = { title: 'Dropped pin', subtitle: `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`, latitude, longitude }
  try {
    const res = await fetch(url)
    if (!res.ok) return fallback
    const json = (await res.json()) as { features: { properties: { name?: string; full_address?: string; place_formatted?: string } }[] }
    const p = json.features[0]?.properties
    if (!p) return fallback
    return { title: p.name ?? 'Dropped pin', subtitle: p.place_formatted ?? p.full_address ?? '', latitude, longitude }
  } catch {
    return fallback
  }
}
