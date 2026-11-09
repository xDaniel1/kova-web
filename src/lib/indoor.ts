// Indoor floor plans. The nightly publisher in waypoint-site runs the iOS app's Overpass query
// for every venue and writes one JSON file per 0.006° cell to kovamaps.com/indoor/. Cells that
// are not part of a venue do not exist (404), which is the signal to draw nothing.
// Parsing mirrors IndoorMapParsing / OverpassIndoorResponse in the iOS app.

export const CELL = 0.006
const BASE = 'https://kovamaps.com/indoor'
export const INDOOR_MIN_ZOOM = 16

export interface Cell {
  row: number
  col: number
}

export function cellOf(latitude: number, longitude: number): Cell {
  return { row: Math.floor(latitude / CELL), col: Math.floor(longitude / CELL) }
}

export function cellsIn(bounds: { south: number; west: number; north: number; east: number }, max = 12): Cell[] {
  const a = cellOf(bounds.south, bounds.west)
  const b = cellOf(bounds.north, bounds.east)
  const out: Cell[] = []
  for (let r = a.row; r <= b.row; r++) for (let c = a.col; c <= b.col; c++) out.push({ row: r, col: c })
  return out.length > max ? [] : out
}

interface Point { lat: number; lon: number }
interface Element {
  type: 'node' | 'way' | 'relation'
  id: number
  tags?: Record<string, string>
  geometry?: Point[]
  lat?: number
  lon?: number
  members?: { role?: string; geometry?: Point[] }[]
}

export type IndoorKind = 'room' | 'corridor' | 'area' | 'shop' | 'amenity' | 'gate' | 'stairs' | 'wall' | 'footprint'

export function parseLevels(raw: string | undefined): number[] {
  if (!raw) return []
  const out = new Set<number>()
  for (const part of raw.split(';')) {
    const text = part.trim().replace(',', '.')
    const n = Number(text)
    if (text && Number.isFinite(n)) {
      out.add(n)
      continue
    }
    const m = text.match(/^(-?\d+(?:\.\d+)?)-(-?\d+(?:\.\d+)?)$/)
    if (m) {
      const lo = Number(m[1]), hi = Number(m[2])
      if (hi >= lo && hi - lo <= 60) for (let v = lo; v <= hi; v++) out.add(v)
    }
  }
  return [...out].sort((a, b) => a - b)
}

export function levelLabel(level: number): string {
  if (level === 0) return 'G'
  if (level < 0) return `B${Math.abs(level)}`
  return String(level)
}

function kindFor(tags: Record<string, string>, closed: boolean): IndoorKind | null {
  if (tags.aeroway === 'terminal' || tags.building === 'train_station' || tags.building === 'transportation') return closed ? 'footprint' : null
  if (tags.aeroway === 'gate') return 'gate'
  if (tags.highway === 'steps') return 'stairs'
  if (tags.shop) return closed ? 'shop' : null
  if (tags.amenity) return closed ? 'amenity' : null
  switch (tags.indoor) {
    case 'room': case 'yes': return closed ? 'room' : null
    case 'corridor': return closed ? 'corridor' : null
    case 'area': return closed ? 'area' : null
    case 'wall': return 'wall'
    default: return null
  }
}

const AMENITY_ICON: Record<string, string> = {
  toilets: '🚻', restaurant: '🍽️', cafe: '☕', fast_food: '🍔', bar: '🍸', pharmacy: '💊', atm: '🏧', bank: '🏧',
  bench: '🪑', information: 'ℹ️', waiting_area: '🪑', lounge: '🛋️', parking: '🅿️', charging_station: '🔌', vending_machine: '🥤',
}
function icon(tags: Record<string, string>, kind: IndoorKind): string | undefined {
  if (kind === 'gate') return '🛫'
  if (kind === 'stairs') return '🪜'
  if (tags.shop) return '🛍️'
  if (tags.amenity) return AMENITY_ICON[tags.amenity] ?? '📍'
  return undefined
}

function ring(points: Point[]): [number, number][] {
  return points.map((p) => [p.lon, p.lat])
}

export function toFeatures(elements: Element[]): GeoJSON.Feature[] {
  const features: GeoJSON.Feature[] = []
  for (const el of elements) {
    const tags = el.tags
    if (!tags) continue
    if (el.type === 'node' && el.lat !== undefined && el.lon !== undefined) {
      const kind: IndoorKind | null = tags.aeroway === 'gate' ? 'gate' : tags.shop ? 'shop' : tags.amenity ? 'amenity' : null
      if (!kind) continue
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [el.lon, el.lat] },
        properties: { kind, name: tags.name ?? tags.ref ?? '', icon: icon(tags, kind), levels: parseLevels(tags.level), point: true },
      })
      continue
    }
    if (el.type === 'way' && el.geometry && el.geometry.length >= 2) {
      const pts = el.geometry
      const closed = pts.length >= 4 && pts[0].lat === pts[pts.length - 1].lat && pts[0].lon === pts[pts.length - 1].lon
      const kind = kindFor(tags, closed)
      if (!kind) continue
      const levels = kind === 'footprint' ? [] : parseLevels(tags.level)
      const props = { kind, name: tags.name ?? tags.ref ?? '', icon: icon(tags, kind), levels }
      if (closed && kind !== 'wall' && kind !== 'stairs') {
        features.push({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [ring(pts)] }, properties: props })
        if (props.name || props.icon) {
          const c = pts.reduce((a, p) => [a[0] + p.lon / pts.length, a[1] + p.lat / pts.length], [0, 0])
          features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: c }, properties: { ...props, point: true, label: true } })
        }
      } else {
        features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: ring(pts) }, properties: props })
      }
      continue
    }
    if (el.type === 'relation' && el.members) {
      const kind = kindFor(tags, true)
      if (!kind) continue
      const outers = el.members.filter((m) => (m.role ?? 'outer') === 'outer' && m.geometry && m.geometry.length >= 2)
      // Stitch outer segments into rings, as the iOS parser does.
      const segments = outers.map((m) => m.geometry!)
      const rings: Point[][] = []
      while (segments.length) {
        let r = segments.shift()!
        let grew = true
        while (grew && !(r.length >= 4 && r[0].lat === r[r.length - 1].lat && r[0].lon === r[r.length - 1].lon)) {
          grew = false
          for (let i = 0; i < segments.length; i++) {
            const s = segments[i]
            const end = r[r.length - 1]
            if (s[0].lat === end.lat && s[0].lon === end.lon) { r = r.concat(s.slice(1)); segments.splice(i, 1); grew = true; break }
            const last = s[s.length - 1]
            if (last.lat === end.lat && last.lon === end.lon) { r = r.concat(s.slice(0, -1).reverse()); segments.splice(i, 1); grew = true; break }
          }
        }
        if (r.length >= 4) rings.push(r)
      }
      for (const r of rings) {
        features.push({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [ring(r)] }, properties: { kind, name: tags.name ?? '', levels: kind === 'footprint' ? [] : parseLevels(tags.level) } })
      }
    }
  }
  return features
}

const cache = new Map<string, GeoJSON.Feature[] | null>()

export async function loadCell(cell: Cell): Promise<GeoJSON.Feature[] | null> {
  const key = `${cell.row}_${cell.col}`
  if (cache.has(key)) return cache.get(key)!
  try {
    const res = await fetch(`${BASE}/indoor_${key}.json`)
    if (res.status === 404) {
      cache.set(key, null)
      return null
    }
    if (!res.ok) return null // transient; try again on the next move
    const json = (await res.json()) as { elements: Element[] }
    const features = toFeatures(json.elements ?? [])
    cache.set(key, features)
    return features
  } catch {
    return null
  }
}
