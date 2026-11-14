import { streetsSource } from './mapStyle'
import type { DirectoryCategory } from './mapboxIndoor'

// Places named on the map and listed in Browse for venues with no floor plan (theme parks, malls,
// stations, districts), and named at storefront zoom on every street. Mirrors iOS build 8, which
// does this from Apple's place search; the web reads the same kind of places from the Mapbox
// Streets tiles the map has already loaded, so it costs no extra request.

/** What people come to a park, a pier or a district for. */
const ATTRACTION_MAKI = new Set(['amusement-park', 'attraction', 'theatre', 'cinema', 'museum', 'zoo', 'aquarium', 'stadium', 'castle', 'monument', 'art-gallery', 'music', 'bowling-alley'])
const ATTRACTION_CLASSES = new Set(['arts_and_entertainment', 'landmark', 'historic'])
const SERVICE_CLASSES = new Set(['visitor_amenities', 'public_facilities', 'medical', 'lodging', 'commercial_services'])

export function venuePlaceCategory(p: Record<string, unknown> | null | undefined): DirectoryCategory | null {
  if (!p) return null
  const cls = String(p.class ?? '')
  const maki = String(p.maki ?? '')
  if (cls === 'food_and_drink' || cls === 'food_and_drink_stores') return 'food'
  if (cls === 'store_like') return 'shops'
  if (ATTRACTION_MAKI.has(maki) || ATTRACTION_CLASSES.has(cls)) return 'attractions'
  if (SERVICE_CLASSES.has(cls)) return 'services'
  if (cls === 'transit' || maki === 'rail' || maki === 'bus') return 'travel'
  return null
}

export interface VenuePlace {
  key: string
  name: string
  category: DirectoryCategory
  latitude: number
  longitude: number
}

const metres = (a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) => {
  const k = Math.PI / 180
  const x = (b.longitude - a.longitude) * k * Math.cos(((a.latitude + b.latitude) / 2) * k)
  const y = (b.latitude - a.latitude) * k
  return Math.hypot(x, y) * 6371000
}

/** Named, categorised places inside the venue's circle, one per name, the venue itself left out. */
export function venuePlaces(features: { properties?: Record<string, unknown> | null; geometry: GeoJSON.Geometry }[], venue: { name: string; shortName: string; latitude: number; longitude: number; radius: number }): VenuePlace[] {
  const own = new Set([venue.name.toLowerCase(), venue.shortName.toLowerCase()])
  const seen = new Set<string>()
  const out: VenuePlace[] = []
  for (const f of features) {
    if (f.geometry.type !== 'Point') continue
    const p = f.properties ?? {}
    const name = String(p.name_en ?? p.name ?? '').trim()
    if (!name || own.has(name.toLowerCase())) continue
    const category = venuePlaceCategory(p)
    if (!category) continue
    const [longitude, latitude] = f.geometry.coordinates as [number, number]
    if (metres(venue, { latitude, longitude }) > venue.radius) continue
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ key, name, category, latitude, longitude })
  }
  return out
}

/** A 48-sided polygon for the venue's circle, for a `within` filter on the map. */
export function venueCircle(v: { latitude: number; longitude: number; radius: number }): GeoJSON.Polygon {
  const ring: [number, number][] = []
  const dLat = v.radius / 111320
  const dLng = dLat / Math.cos((v.latitude * Math.PI) / 180)
  for (let i = 0; i <= 48; i++) {
    const t = (i / 48) * 2 * Math.PI
    ring.push([v.longitude + dLng * Math.cos(t), v.latitude + dLat * Math.sin(t)])
  }
  return { type: 'Polygon', coordinates: [ring] }
}

/** Classes named at storefront zoom on every street. */
export const STREET_PLACE_CLASSES = ['food_and_drink', 'food_and_drink_stores', 'store_like', 'arts_and_entertainment']

const STREET_LAYER = 'kova-street-place-labels'
type GLMap = import('mapbox-gl').Map

/** Name every shop, café and attraction at storefront zoom, under Mapbox's own (ranked) POI labels. */
export function syncStreetPlaceLabels(map: GLMap, on: boolean, dark: boolean) {
  const source = on ? streetsSource(map) : null
  if (!source) {
    if (map.getLayer(STREET_LAYER)) map.removeLayer(STREET_LAYER)
    return
  }
  if (map.getLayer(STREET_LAYER)) return
  map.addLayer({
    id: STREET_LAYER, type: 'symbol', source, 'source-layer': 'poi_label', minzoom: 17,
    filter: ['all', ['match', ['get', 'class'], STREET_PLACE_CLASSES, true, false], ['has', 'name']],
    layout: { 'text-field': ['coalesce', ['get', 'name_en'], ['get', 'name']], 'text-font': ['DIN Pro Medium', 'Arial Unicode MS Regular'], 'text-size': 11, 'text-max-width': 8, 'text-padding': 2, 'text-optional': false },
    paint: { 'text-color': dark ? '#d8e2e6' : '#4a5a60', 'text-halo-color': dark ? '#18252c' : '#ffffff', 'text-halo-width': 1.2 },
    ...(map.getLayer('poi-label') ? {} : { slot: 'top' }),
  } as never, map.getLayer('poi-label') ? 'poi-label' : undefined)
}

const VENUE_LAYER = 'kova-venue-place-labels'

/** At a venue with no floor plan, name every place inside it from zoom 15, as iOS does. */
export function syncVenuePlaceLabels(map: GLMap, venue: { latitude: number; longitude: number; radius: number } | null, dark: boolean) {
  const source = venue ? streetsSource(map) : null
  if (!venue || !source) {
    if (map.getLayer(VENUE_LAYER)) map.removeLayer(VENUE_LAYER)
    return
  }
  const filter = ['all', ['has', 'name'], ['match', ['get', 'class'], [...STREET_PLACE_CLASSES, 'landmark', 'historic', 'visitor_amenities'], true, false], ['within', venueCircle(venue)]] as never
  if (map.getLayer(VENUE_LAYER)) { map.setFilter(VENUE_LAYER, filter); return }
  map.addLayer({
    id: VENUE_LAYER, type: 'symbol', source, 'source-layer': 'poi_label', minzoom: 15, filter,
    layout: { 'text-field': ['coalesce', ['get', 'name_en'], ['get', 'name']], 'text-font': ['DIN Pro Medium', 'Arial Unicode MS Regular'], 'text-size': 11.5, 'text-max-width': 8, 'text-padding': 2 },
    ...(map.getLayer('poi-label') ? {} : { slot: 'top' }),
    paint: { 'text-color': ['match', ['get', 'class'], ['food_and_drink', 'food_and_drink_stores'], dark ? '#ffab78' : '#b8501a', 'store_like', dark ? '#f5d26b' : '#8a6400', ['arts_and_entertainment', 'landmark', 'historic'], dark ? '#ff8db5' : '#b0245a', dark ? '#d8e2e6' : '#4a5a60'], 'text-halo-color': dark ? '#18252c' : '#ffffff', 'text-halo-width': 1.2 },
  }, map.getLayer('poi-label') ? 'poi-label' : undefined)
}
