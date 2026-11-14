import { supabase } from './supabase'

// Port of TransitNetwork.swift: the agencies outside New York (Florida's 23 today), imported
// into our own tables. Asked for in fixed squares so panning a city reuses what is loaded.

export interface TransitStop { id: string; agency: string; name: string; latitude: number; longitude: number; mode: string; routes: string[] }
export interface TransitLine { id: string; agency: string; name: string; color: string | null; mode: string; path: [number, number][] }

export interface Cell { row: number; column: number; size: number; south: number; west: number; north: number; east: number; key: string }
export function cellAt(latitude: number, longitude: number, size: number): Cell {
  const row = Math.floor(latitude / size), column = Math.floor(longitude / size)
  const south = row * size, west = column * size
  return { row, column, size, south, west, north: south + size, east: west + size, key: `${size}:${row}:${column}` }
}
/** Every cell of `size` overlapping the box, or none when that would be more than `max`. */
export function cellsIn(b: { south: number; west: number; north: number; east: number }, size: number, max = 12): Cell[] {
  const a = cellAt(b.south, b.west, size), z = cellAt(b.north, b.east, size)
  if ((z.row - a.row + 1) * (z.column - a.column + 1) > max) return []
  const out: Cell[] = []
  for (let r = a.row; r <= z.row; r++) for (let c = a.column; c <= z.column; c++) out.push(cellAt((r + 0.5) * size, (c + 0.5) * size, size))
  return out
}

/** Stations and lines: a degree a side. Bus stops: about two kilometres. */
export const RAIL_CELL = 1
export const BUS_CELL = 0.02
/** Zooms matching iOS camera distances: lines across a region, stations across a city, buses at street level. */
export const LINE_MIN_ZOOM = 8
export const STATION_MIN_ZOOM = 11
export const BUS_MIN_ZOOM = 15

export function parseStops(rows: unknown): TransitStop[] {
  if (!Array.isArray(rows)) return []
  return rows.flatMap((r) => {
    if (!r || typeof r.name !== 'string' || typeof r.agency !== 'string' || !Number.isFinite(r.latitude) || !Number.isFinite(r.longitude)) return []
    return [{ id: `${r.agency}:${r.stop_id}`, agency: r.agency, name: r.name, latitude: r.latitude, longitude: r.longitude, mode: typeof r.mode === 'string' ? r.mode : 'bus', routes: Array.isArray(r.routes) ? r.routes.filter((x: unknown) => typeof x === 'string') : [] }]
  })
}
export function parseLines(rows: unknown): TransitLine[] {
  if (!Array.isArray(rows)) return []
  return rows.flatMap((r) => {
    if (!r || typeof r.agency !== 'string' || !Array.isArray(r.path)) return []
    const path = r.path.filter((p: unknown) => Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1])).map((p: number[]) => [p[0], p[1]] as [number, number])
    if (path.length < 2) return []
    const color = typeof r.color === 'string' && /^[0-9a-f]{6}$/i.test(r.color) ? `#${r.color}` : null
    return [{ id: `${r.agency}:${r.line_id}`, agency: r.agency, name: typeof r.name === 'string' ? r.name : '', color, mode: typeof r.mode === 'string' ? r.mode : 'rail', path }]
  })
}

const cache = new Map<string, Promise<unknown>>()
function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  let hit = cache.get(key) as Promise<T> | undefined
  if (!hit) {
    hit = load().catch((e) => { cache.delete(key); throw e })
    cache.set(key, hit)
  }
  return hit
}

export function stopsIn(cell: Cell, buses: boolean): Promise<TransitStop[]> {
  return cached(`stops:${buses}:${cell.key}`, async () => {
    const q = supabase.from('transit_stops').select('agency,agency_name,stop_id,name,latitude,longitude,mode,routes')
    const { data, error } = await (buses ? q.eq('mode', 'bus') : q.neq('mode', 'bus'))
      .gte('latitude', cell.south).lt('latitude', cell.north).gte('longitude', cell.west).lt('longitude', cell.east).limit(1000)
    if (error) throw error
    return parseStops(data)
  })
}
export function linesIn(cell: Cell): Promise<TransitLine[]> {
  return cached(`lines:${cell.key}`, async () => {
    const { data, error } = await supabase.from('transit_lines').select('agency,line_id,name,color,mode,path')
      .lte('south', cell.north).gte('north', cell.south).lte('west', cell.east).gte('east', cell.west).limit(200)
    if (error) throw error
    return parseLines(data)
  })
}

export const MODE_COLOR: Record<string, string> = { rail: '#5b4a9e', metro: '#0e809c', tram: '#c2185b', ferry: '#1565c0', bus: '#0e809c' }
