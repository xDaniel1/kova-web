import { config } from './config'
import type { Place } from './types'

// Everything here goes through the Supabase Edge Function in supabase/functions/google, which
// holds the Google key. The browser only ever sees the publishable Supabase key.

const BASE = `${config.supabase.url}/functions/v1/google`

async function call<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: config.supabase.anonKey },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message ?? err?.error ?? `Google request failed (${res.status})`)
  }
  return (await res.json()) as T
}

export interface PlacePhoto {
  name: string
  widthPx: number
  heightPx: number
  authorAttributions?: { displayName: string; uri?: string }[]
}

export interface PlaceReview {
  rating: number
  relativePublishTimeDescription: string
  text?: { text: string }
  authorAttribution?: { displayName: string; photoUri?: string }
}

export interface PlaceDetails {
  id: string
  displayName?: { text: string }
  primaryTypeDisplayName?: { text: string }
  formattedAddress?: string
  location?: { latitude: number; longitude: number }
  internationalPhoneNumber?: string
  websiteUri?: string
  googleMapsUri?: string
  rating?: number
  userRatingCount?: number
  priceLevel?: string
  businessStatus?: string
  currentOpeningHours?: { openNow?: boolean; weekdayDescriptions?: string[] }
  photos?: PlacePhoto[]
  reviews?: PlaceReview[]
  editorialSummary?: { text: string }
}

export async function lookupPlace(place: Place): Promise<PlaceDetails | null> {
  const query = place.subtitle ? `${place.title}, ${place.subtitle}` : place.title
  const data = await call<{ places?: PlaceDetails[] }>('/places/search', { query, near: { latitude: place.latitude, longitude: place.longitude } })
  const first = data.places?.[0]
  if (!first?.location) return null
  // Reject matches that landed somewhere else entirely (a same-named shop across town).
  const dLat = first.location.latitude - place.latitude
  const dLng = (first.location.longitude - place.longitude) * Math.cos((place.latitude * Math.PI) / 180)
  const meters = Math.sqrt(dLat * dLat + dLng * dLng) * 111_320
  return meters < 400 ? first : null
}

export function photoURL(photo: PlacePhoto, maxWidth = 800): string {
  const q = new URLSearchParams({ name: photo.name, maxWidth: String(maxWidth), apikey: config.supabase.anonKey })
  return `${BASE}/places/photo?${q}`
}

export interface NearbyPlace {
  id: string
  displayName?: { text: string }
  formattedAddress?: string
  location: { latitude: number; longitude: number }
  rating?: number
  userRatingCount?: number
  photos?: PlacePhoto[]
  primaryTypeDisplayName?: { text: string }
}

export async function nearbyPlaces(center: { latitude: number; longitude: number }, types: string[], radius = 3000): Promise<NearbyPlace[]> {
  const data = await call<{ places?: NearbyPlace[] }>('/places/nearby', { latitude: center.latitude, longitude: center.longitude, radius, types })
  return (data.places ?? []).filter((p) => p.location && (p.userRatingCount ?? 0) >= 20).sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
}

export function toPlace(p: NearbyPlace | PlaceDetails): Place {
  return {
    title: p.displayName?.text ?? 'Place',
    subtitle: p.formattedAddress ?? '',
    latitude: p.location!.latitude,
    longitude: p.location!.longitude,
    kind: p.primaryTypeDisplayName?.text,
  }
}

// Transit (Google Routes API). Shapes trimmed to what the panel draws.
export interface TransitStep {
  travelMode: 'WALK' | 'TRANSIT'
  staticDuration?: string
  distanceMeters?: number
  polyline?: { encodedPolyline: string }
  navigationInstruction?: { instructions?: string }
  transitDetails?: {
    stopDetails: { departureStop: { name: string }; arrivalStop: { name: string }; departureTime?: string; arrivalTime?: string }
    headsign?: string
    stopCount?: number
    transitLine: { name?: string; nameShort?: string; color?: string; textColor?: string; vehicle?: { type?: string; name?: { text: string } } }
  }
}
export interface TransitRoute {
  duration: string
  distanceMeters: number
  description?: string
  polyline?: { encodedPolyline: string }
  legs: { steps: TransitStep[] }[]
  travelAdvisory?: { transitFare?: { currencyCode: string; units?: string; nanos?: number } }
}

export async function transitRoutes(
  origin: { latitude: number; longitude: number },
  destination: { latitude: number; longitude: number },
  when?: { departureTime?: string; arrivalTime?: string },
): Promise<TransitRoute[]> {
  const data = await call<{ routes?: TransitRoute[] }>('/transit', { origin, destination, ...when })
  return data.routes ?? []
}

export function parseDuration(s: string | undefined): number {
  return s ? Number(s.replace('s', '')) || 0 : 0
}
