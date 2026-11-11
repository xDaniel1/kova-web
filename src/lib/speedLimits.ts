import { supabase } from './supabase'
import type { Bounds } from './reports'

export interface SpeedSegment { id: string; mph: number; road: string; source: string; path: [number, number][] }
export function parseSpeedSegments(rows: unknown): SpeedSegment[] {
  if (!Array.isArray(rows)) return []
  return rows.flatMap(r => {
    if (!r || (typeof r.id !== 'number' && typeof r.id !== 'string') || typeof r.mph !== 'number' || !Number.isFinite(r.mph) || r.mph < 5 || r.mph > 90 || !Number.isInteger(r.mph)) return []
    if (!Array.isArray(r.path) || r.path.length < 2 || !r.path.every((p: unknown) => Array.isArray(p) && p.length === 2 && typeof p[0] === 'number' && typeof p[1] === 'number' && Number.isFinite(p[0]) && Number.isFinite(p[1]) && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90)) return []
    return [{ id: String(r.id), mph: r.mph, road: typeof r.road === 'string' ? r.road : '', source: typeof r.source === 'string' ? r.source : '', path: r.path as [number, number][] }]
  })
}

/** Read only viewport-intersecting records; no whole-state downloads or inferred road matches. */
export async function fetchSpeedSegments(b: Bounds, signal: AbortSignal): Promise<SpeedSegment[]> {
  if (!Object.values(b).every(Number.isFinite) || b.north < b.south || b.east < b.west || b.north - b.south > 0.3 || b.east - b.west > 0.5) return []
  try {
    const { data, error } = await supabase.from('speed_limit_segments')
      .select('id,mph,road,source,path').lte('south', b.north).gte('north', b.south)
      .lte('west', b.east).gte('east', b.west).order('id').limit(500).abortSignal(signal)
    if (error) return []
    return parseSpeedSegments(data)
  } catch { return [] }
}
