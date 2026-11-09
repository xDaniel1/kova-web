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

export type TravelMode = 'driving' | 'walking' | 'cycling'

export interface RouteStep {
  instruction: string
  distanceMeters: number
  name: string
}

export interface Route {
  mode: TravelMode
  distanceMeters: number
  durationSeconds: number
  geometry: GeoJSON.LineString
  steps: RouteStep[]
}

export function newUUID(): string {
  return crypto.randomUUID().toUpperCase()
}
