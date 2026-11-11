// Airport floor plans from Mapbox's indoor tileset (mapbox.indoor-v3): rooms, corridors, shops
// and gates for the airports Mapbox maps inside (JFK, LGA, EWR, ATL, LAX, ORD, DFW, MIA, TPA,
// MCO, LHR and more). Mirrors Waypoint/Models/MapboxIndoor.swift in the iPhone app so both pick
// the same building, the same default floors and the same connected floors.

export const INDOOR_SOURCE = 'kova-indoor'
export const INDOOR_TILESET = 'mapbox://mapbox.indoor-v3'
/** Indoor tiles only exist from zoom 14; below that there is nothing to read. */
export const INDOOR_TILE_MIN_ZOOM = 14

export interface IndoorFloor {
  id: string
  /** What the floor button shows: "1", "4". */
  name: string
  /** "Check-In Level", "Gates Level". */
  description: string
  structureIds: string[]
  zIndex: number
  isDefault: boolean
  connectedFloorIds: string[]
  /** Floors this one replaces: the other levels of the same building. */
  conflictedFloorIds: string[]
}

export interface IndoorStructure {
  id: string
  name: string
  latitude: number
  longitude: number
}

type Props = Record<string, unknown> | null | undefined

const list = (v: unknown) => (typeof v === 'string' ? v.split(';').filter(Boolean) : [])

export function parseFloor(p: Props): IndoorFloor | null {
  if (!p || typeof p.id !== 'string') return null
  return {
    id: p.id,
    name: typeof p.name === 'string' ? p.name : '',
    description: typeof p.description === 'string' ? p.description : '',
    structureIds: list(p.structure_ids),
    zIndex: Number.isFinite(Number(p.z_index)) ? Number(p.z_index) : 0,
    isDefault: p.is_default === true || p.is_default === 1 || p.is_default === 'true',
    connectedFloorIds: list(p.connected_floor_ids),
    conflictedFloorIds: list(p.conflicted_floor_ids),
  }
}

export function parseStructure(p: Props, names: Map<string, string> = new Map()): IndoorStructure | null {
  if (!p || typeof p.id !== 'string') return null
  const latitude = Number(p.center_lat), longitude = Number(p.center_lon)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || p.center_lat == null || p.center_lon == null) return null
  return { id: p.id, name: typeof p.name === 'string' && p.name ? p.name : names.get(p.id) ?? '', latitude, longitude }
}

/**
 * Floors to draw: every building's default floor, except where the chosen floor (and the floors
 * it connects to) take a building's place.
 */
export function visibleFloorIds(floors: IndoorFloor[], selected: string | null | undefined): string[] {
  const defaults = floors.filter((f) => f.isDefault)
  const chosen = selected ? floors.find((f) => f.id === selected) : undefined
  if (!chosen) return defaults.map((f) => f.id).sort()
  const byId = new Map(floors.map((f) => [f.id, f]))
  const shown = [chosen, ...chosen.connectedFloorIds.map((id) => byId.get(id)).filter((f): f is IndoorFloor => !!f)]
  const covered = new Set(shown.flatMap((f) => f.structureIds))
  const replaced = new Set(shown.flatMap((f) => f.conflictedFloorIds))
  const others = defaults.filter((f) => !replaced.has(f.id) && !f.structureIds.some((id) => covered.has(id)))
  return [...new Set([...shown, ...others].map((f) => f.id))].sort()
}

export function metresBetween(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const rad = Math.PI / 180
  const dLat = (b.latitude - a.latitude) * rad, dLon = (b.longitude - a.longitude) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLon / 2) ** 2
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h))
}

/**
 * The building the camera is looking at: the nearest centre within reach. Parking garages only
 * count when nothing else is close; people open a terminal, not its car park.
 */
export function structureNear(center: { latitude: number; longitude: number }, structures: IndoorStructure[], within = 700): IndoorStructure | null {
  const near = structures.filter((s) => metresBetween(center, s) <= within)
  const buildings = near.filter((s) => !/parking/i.test(s.name))
  const pool = buildings.length ? buildings : near
  return pool.reduce<IndoorStructure | null>((best, s) => (!best || metresBetween(center, s) < metresBetween(center, best) ? s : best), null)
}

/** The building's floors, lowest first. */
export function floorsOf(structure: IndoorStructure, floors: IndoorFloor[]): IndoorFloor[] {
  return floors.filter((f) => f.structureIds.includes(structure.id)).sort((a, b) => a.zIndex - b.zIndex)
}

/** Dedupes tile-boundary copies of the same metadata row. */
export function uniqueById<T extends { id: string }>(rows: T[]): T[] {
  const seen = new Set<string>()
  return rows.filter((r) => !seen.has(r.id) && seen.add(r.id))
}

export type DirectoryCategory = 'food' | 'shops' | 'gates' | 'services' | 'travel' | 'security' | 'other'

export const DIRECTORY_TITLES: Record<DirectoryCategory, string> = {
  food: 'Food & Drink', shops: 'Shops', gates: 'Gates', services: 'Services', travel: 'Travel', security: 'Security', other: 'Other',
}
export const DIRECTORY_ORDER: DirectoryCategory[] = ['food', 'shops', 'gates', 'services', 'travel', 'security', 'other']
export const DIRECTORY_COLOR: Record<DirectoryCategory, string> = {
  food: '#f57a33', shops: '#f2bd29', gates: '#f5c518', services: '#8c5cd9', travel: '#3373f2', security: '#e64554', other: '#8c8c8c',
}
export const DIRECTORY_ICON: Record<DirectoryCategory, string> = {
  food: 'restaurant', shops: 'local_mall', gates: 'flight_takeoff', services: 'wc', travel: 'luggage', security: 'security', other: 'location_on',
}

/** Groups a label the way the iPhone directory does. */
export function directoryCategory(p: { class?: unknown; shape_type?: unknown }): DirectoryCategory {
  if (p.shape_type === 'gate') return 'gates'
  switch (p.class) {
    case 'restaurants': return 'food'
    case 'retail': return 'shops'
    case 'venue_services': case 'services': return 'services'
    case 'travel': case 'transportation': case 'ticketing': return 'travel'
    case 'security': return 'security'
    default: return 'other'
  }
}

/** Labels that are real places: not the floor and building captions, corridors or blank rooms. */
export function isDirectoryPlace(p: Record<string, unknown>): boolean {
  const name = typeof p.name === 'string' ? p.name.trim() : ''
  if (!name) return false
  if (p.shape_type === 'gate') return true
  if (!['poi', 'occupant', 'room', 'carousel'].includes(String(p.shape_type))) return false
  if (['corridor', 'vacant', 'inaccessible', 'pre_security', 'post_security', 'connector'].includes(String(p.class))) return false
  return !['elevator', 'stairs', 'escalator', 'inaccessible'].includes(String(p.type))
}
