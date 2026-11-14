import { supabase } from './supabase'
import type { Bounds } from './reports'

export interface SpeedSegment { id: string; mph: number; road: string; source: string; path: [number, number][]; authoritative: boolean }
export function parseSpeedSegments(rows: unknown): SpeedSegment[] {
  if (!Array.isArray(rows)) return []
  return rows.flatMap((r, index) => {
    if (!r || typeof r !== 'object' || typeof r.mph !== 'number' || !Number.isFinite(r.mph) || r.mph < 5 || r.mph > 90 || !Number.isInteger(r.mph)) return []
    if (!Array.isArray(r.path) || r.path.length < 2 || !r.path.every((p: unknown) => Array.isArray(p) && p.length === 2 && typeof p[0] === 'number' && typeof p[1] === 'number' && Number.isFinite(p[0]) && Number.isFinite(p[1]) && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90)) return []
    return [{ id: typeof r.id === 'number' || typeof r.id === 'string' ? String(r.id) : `seg-${index}`, mph: r.mph, road: typeof r.road === 'string' ? r.road : '', source: typeof r.source === 'string' ? r.source : '', path: r.path as [number, number][], authoritative: r.authoritative !== false }]
  })
}

/** Most segments one view may draw. The function returns state and city records first. */
export const MAX_SEGMENTS = 3000

/**
 * Read only viewport-intersecting records; no whole-state downloads or inferred road matches.
 * Uses the same `speed_limits_in_box` function as iPhone (SpeedLimitService.kovaRequest): one
 * answer, state and city records ahead of the federal highway inventory, past PostgREST's
 * 1,000-row page.
 */
export async function fetchSpeedSegments(b: Bounds, signal: AbortSignal): Promise<SpeedSegment[]> {
  if (!Object.values(b).every(Number.isFinite) || b.north < b.south || b.east < b.west || b.north - b.south > 0.3 || b.east - b.west > 0.5) return []
  try {
    const { data, error } = await supabase.rpc('speed_limits_in_box', { p_south: b.south, p_west: b.west, p_north: b.north, p_east: b.east, p_max: MAX_SEGMENTS }).abortSignal(signal)
    if (error) return []
    return parseSpeedSegments(data)
  } catch { return [] }
}
