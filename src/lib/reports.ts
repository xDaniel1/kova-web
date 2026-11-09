import { supabase } from './supabase'

// Mirrors Waypoint/Services/TrafficReportsService.swift: same table, same kind strings, same
// two-hour freshness window. Reading needs a signed-in user (RLS), filing writes as that user.

export type ReportKind = 'Accident' | 'Hazard' | 'Road Closed' | 'Slow Traffic'

export const REPORT_KINDS: { kind: ReportKind; icon: string; color: string }[] = [
  { kind: 'Accident', icon: '💥', color: '#ff3b30' },
  { kind: 'Hazard', icon: '⚠️', color: '#ff9500' },
  { kind: 'Road Closed', icon: '🚧', color: '#1c1c1e' },
  { kind: 'Slow Traffic', icon: '🐢', color: '#ffcc00' },
]

export interface TrafficReport {
  id: string
  userID: string
  kind: ReportKind
  latitude: number
  longitude: number
  createdAt: string
}

export const STALE_AFTER_MS = 2 * 60 * 60 * 1000

export interface Bounds {
  south: number
  west: number
  north: number
  east: number
}

export async function fetchReports(bounds: Bounds): Promise<TrafficReport[]> {
  const since = new Date(Date.now() - STALE_AFTER_MS).toISOString()
  const { data, error } = await supabase
    .from('traffic_reports')
    .select('id, user_id, kind, latitude, longitude, created_at')
    .gte('created_at', since)
    .gte('latitude', bounds.south)
    .lte('latitude', bounds.north)
    .gte('longitude', bounds.west)
    .lte('longitude', bounds.east)
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) throw error
  return (data ?? []).map((r) => ({
    id: r.id as string,
    userID: r.user_id as string,
    kind: r.kind as ReportKind,
    latitude: r.latitude as number,
    longitude: r.longitude as number,
    createdAt: r.created_at as string,
  }))
}

export async function fileReport(userID: string, kind: ReportKind, latitude: number, longitude: number): Promise<void> {
  const { error } = await supabase.from('traffic_reports').insert({ user_id: userID, kind, latitude, longitude })
  if (error) throw error
}

export async function deleteReport(id: string): Promise<void> {
  const { error } = await supabase.from('traffic_reports').delete().eq('id', id)
  if (error) throw error
}

/** Flag someone else's report; two flags from different drivers remove it (database trigger). */
export async function flagReport(id: string, userID: string): Promise<void> {
  const { error } = await supabase.from('traffic_report_flags').insert({ report_id: id, flagged_by: userID })
  if (error) throw error
}

export function ageLabel(createdAt: string, now = Date.now()): string {
  const minutes = Math.max(1, Math.round((now - Date.parse(createdAt)) / 60_000))
  if (minutes < 60) return `${minutes} min ago`
  return `${Math.round(minutes / 60)} hr ago`
}
