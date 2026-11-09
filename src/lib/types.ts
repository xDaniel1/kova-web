// Mirrors Waypoint/Models/FavoritePlace.swift and RecentSearch.swift exactly, because both
// apps read and write the same sync_snapshots row. Swift's Codable writes UUIDs in upper
// case and dates as ISO 8601 strings; keep it that way so the iPhone app can decode them.

export interface FavoritePlace {
  id: string
  title: string
  subtitle: string
  latitude: number
  longitude: number
  customTitle?: string | null
  emoji?: string | null
  colorHex?: string | null
}

export interface RecentSearch {
  id: string
  title: string
  subtitle: string
  latitude: number
  longitude: number
  date: string
}

export interface Place {
  title: string
  subtitle: string
  latitude: number
  longitude: number
  kind?: string
}

export type TravelMode = 'driving' | 'walking' | 'cycling' | 'transit'

export interface RouteStep {
  instruction: string
  distanceMeters: number
  name: string
  durationSeconds?: number
  /** Transit rides carry the line; walking steps between them do not. */
  transit?: {
    line: string
    color: string
    textColor: string
    vehicle: string
    from: string
    to: string
    stops?: number
    headsign?: string
    departureTime?: string
    arrivalTime?: string
  }
  /** Per-step geometry, used to draw transit rides in their line colour. */
  geometry?: GeoJSON.LineString
  /** Posted speed limit (OpenStreetMap maxspeed) on this step's road, when known. */
  speedLimit?: string
  /** Lanes approaching this step's maneuver; `valid` lanes lead the right way. */
  lanes?: Lane[]
  maneuver?: { type: string; modifier?: string }
}

export interface Lane {
  directions: string[]
  valid: boolean
}

export interface Route {
  mode: TravelMode
  distanceMeters: number
  durationSeconds: number
  geometry: GeoJSON.LineString
  /** Steps grouped per leg (one leg between each pair of stops). */
  legs: RouteStep[][]
  steps: RouteStep[]
  fare?: string
  description?: string
  /** Per-segment congestion along the geometry (driving only): low, moderate, heavy, severe, unknown. */
  congestion?: string[]
}

export function newUUID(): string {
  return crypto.randomUUID().toUpperCase()
}
