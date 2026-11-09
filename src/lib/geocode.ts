import { config } from './config'
import type { Place } from './types'

interface PhotonFeature {
  geometry: { coordinates: [number, number] }
  properties: Record<string, string | undefined>
}

function toPlace(f: PhotonFeature): Place {
  const p = f.properties
  const title = p.name ?? [p.housenumber, p.street].filter(Boolean).join(' ') ?? 'Unnamed place'
  const subtitle = [p.street && p.name ? [p.housenumber, p.street].filter(Boolean).join(' ') : null, p.city ?? p.county, p.state, p.country]
    .filter(Boolean)
    .join(', ')
  return {
    title,
    subtitle,
    longitude: f.geometry.coordinates[0],
    latitude: f.geometry.coordinates[1],
    kind: p.osm_value,
  }
}

export async function searchPlaces(
  query: string,
  near?: { latitude: number; longitude: number },
  signal?: AbortSignal,
): Promise<Place[]> {
  const url = new URL('/api', config.geocoder.baseURL)
  url.searchParams.set('q', query)
  url.searchParams.set('limit', '8')
  url.searchParams.set('lang', 'en')
  if (near) {
    url.searchParams.set('lat', String(near.latitude))
    url.searchParams.set('lon', String(near.longitude))
  }
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`Search failed (${res.status})`)
  const json = (await res.json()) as { features: PhotonFeature[] }
  return json.features.map(toPlace)
}

export async function reverseGeocode(latitude: number, longitude: number): Promise<Place> {
  const url = new URL('/reverse', config.geocoder.baseURL)
  url.searchParams.set('lat', String(latitude))
  url.searchParams.set('lon', String(longitude))
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Reverse geocode failed (${res.status})`)
  const json = (await res.json()) as { features: PhotonFeature[] }
  const first = json.features[0]
  if (!first) return { title: 'Dropped pin', subtitle: `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`, latitude, longitude }
  return { ...toPlace(first), latitude, longitude }
}
