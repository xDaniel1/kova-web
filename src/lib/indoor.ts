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
  // Reject broad viewports before allocating or iterating over every cell.
  if ((b.row - a.row + 1) * (b.col - a.col + 1) > max) return []
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

/** The closed loops in a chain of points: each time the chain returns to a point it already
 *  visited, the stretch since then is a ring. Splits outlines that touch at one point and keeps
 *  closed loops out of a chain whose ends never meet. */
const sameSpot = (a: Point, b: Point) => a.lat === b.lat && a.lon === b.lon
const spot = (p: Point) => `${p.lat},${p.lon}`

/** Ways whose end touches no other way (spurs) can't be part of any outline. Removing them, again
 *  until none are left, leaves only ways that join up into rings. A way closed on itself stays. */
export function withoutSpurs(ways: Point[][]): Point[][] {
  let left = ways.filter((w) => w.length >= 2)
  for (;;) {
    const ends = new Map<string, number>()
    for (const w of left) for (const p of [w[0], w[w.length - 1]]) ends.set(spot(p), (ends.get(spot(p)) ?? 0) + 1)
    const kept = left.filter((w) => sameSpot(w[0], w[w.length - 1]) || (ends.get(spot(w[0]))! >= 2 && ends.get(spot(w[w.length - 1]))! >= 2))
    if (kept.length === left.length) return kept
    left = kept
  }
}

/** A closed ring with at least three distinct points and a non-zero area. */
export function hasArea(r: Point[]): boolean {
  if (r.length < 4 || !sameSpot(r[0], r[r.length - 1])) return false
  if (new Set(r.slice(0, -1).map(spot)).size < 3) return false
  let twice = 0
  for (let i = 0; i < r.length - 1; i++) twice += r[i].lon * r[i + 1].lat - r[i + 1].lon * r[i].lat
  return Math.abs(twice) > 1e-14
}

export function loopsOf(chain: Point[]): Point[][] {
  const loops: Point[][] = []
  const path: Point[] = []
  const seen = new Map<string, number>()
  const key = (p: Point) => `${p.lat},${p.lon}`
  for (const p of chain) {
    const at = seen.get(key(p))
    if (at !== undefined) {
      const loop = path.splice(at)
      for (const q of loop) seen.delete(key(q))
      if (loop.length >= 3) loops.push([...loop, p])
    }
    seen.set(key(p), path.length)
    path.push(p)
  }
  return loops
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
      const outers = el.members.filter((m) => (m.role || 'outer') === 'outer' && m.geometry && m.geometry.length >= 2)
      // Stitch outer segments into rings, as the iOS parser does.
      const segments = withoutSpurs(outers.map((m) => m.geometry!))
      const rings: Point[][] = []
      while (segments.length) {
        let r = segments.shift()!
        // Walk on until the chain returns to its start. With spurs gone, every way out of a point
        // belongs to some ring, so the walk never strands a ring's closing way.
        let grew = true
        while (grew && !sameSpot(r[0], r[r.length - 1])) {
          grew = false
          for (let i = 0; i < segments.length; i++) {
            const s = segments[i]
            const end = r[r.length - 1]
            if (sameSpot(s[0], end)) { r = r.concat(s.slice(1)); segments.splice(i, 1); grew = true; break }
            if (sameSpot(s[s.length - 1], end)) { r = r.concat(s.slice(0, -1).reverse()); segments.splice(i, 1); grew = true; break }
          }
        }
        // A chain through a point where outlines touch holds one loop per outline; whatever is
        // left open by missing members is dropped, and so are loops with no area.
        rings.push(...loopsOf(r).filter(hasArea))
      }
      for (const r of rings) {
        features.push({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [ring(r)] }, properties: { kind, name: tags.name ?? '', levels: kind === 'footprint' ? [] : parseLevels(tags.level) } })
      }
    }
  }
  return features
}

const cache = new Map<string, GeoJSON.Feature[] | null>()

const MAX_CACHED_CELLS = 48
function rememberCell(key: string, value: GeoJSON.Feature[] | null) {
  cache.delete(key)
  cache.set(key, value)
  if (cache.size > MAX_CACHED_CELLS) cache.delete(cache.keys().next().value!)
}

export async function loadCell(cell: Cell): Promise<GeoJSON.Feature[] | null> {
  const key = `${cell.row}_${cell.col}`
  if (cache.has(key)) {
    const value = cache.get(key)!
    rememberCell(key, value)
    return value
  }
  try {
    const res = await fetch(`${BASE}/indoor_${key}.json`)
    if (res.status === 404) {
      rememberCell(key, null)
      return null
    }
    if (!res.ok) return null // transient; try again on the next move
    const json = (await res.json()) as { elements: Element[] }
    const features = toFeatures(json.elements ?? [])
    rememberCell(key, features)
    return features
  } catch {
    return null
  }
}
