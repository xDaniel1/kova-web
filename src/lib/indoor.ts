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
  geometry?: (Point | null)[]
  lat?: number
  lon?: number
  members?: { role?: string; geometry?: (Point | null)[] }[]
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

const sameSpot = (a: Point, b: Point) => a.lat === b.lat && a.lon === b.lon
const spot = (p: Point) => `${p.lat},${p.lon}`

/** A point Overpass could actually place (it writes null for one it can't). */
export const realPoint = (p: Point | null | undefined): p is Point =>
  !!p && Number.isFinite(p.lat) && Number.isFinite(p.lon)

/** The stretches of a way between points Overpass couldn't place. */
export function runsOf(way: (Point | null)[]): Point[][] {
  const runs: Point[][] = []
  let run: Point[] = []
  for (const p of way) {
    if (realPoint(p)) run.push(p)
    else { if (run.length >= 2) runs.push(run); run = [] }
  }
  if (run.length >= 2) runs.push(run)
  return runs
}

/** The outlines in a relation's outer ways, whatever order the members come in.
 *
 *  The ways are broken into edges between points. An edge on no loop (a bridge: a spur, or a way
 *  joining one outline to another) is removed. Each remaining connected piece is a plane drawing;
 *  its outline is the boundary of its outer face, found by walking edges and always taking the
 *  next one clockwise. That boundary ignores chords and stray ways inside the shape, and where
 *  outlines touch at a point it passes that point twice, so it is split into one ring per
 *  outline there. Rings with no area are dropped. Linear in the number of edges, after sorting. */
export function outlinesOf(ways: Point[][]): Point[][] {
  const pts: Point[] = []
  const id = new Map<string, number>()
  const node = (p: Point) => {
    const k = spot(p)
    let i = id.get(k)
    if (i === undefined) { i = pts.length; id.set(k, i); pts.push(p) }
    return i
  }
  for (const w of ways) for (const p of w) node(p)
  // Points by longitude, to find the ones lying on a segment: a wall drawn with an extra point in
  // one way and without it in another must become the same edges, or the two copies never meet.
  const byLon = pts.map((_, i) => i).sort((x, y) => pts[x].lon - pts[y].lon)
  const firstAtLeast = (lon: number) => {
    let lo = 0, hi = byLon.length
    while (lo < hi) { const mid = (lo + hi) >> 1; if (pts[byLon[mid]].lon < lon) lo = mid + 1; else hi = mid }
    return lo
  }
  const onSegment = (a: number, b: number): number[] => {
    const A = pts[a], B = pts[b]
    const dx = B.lon - A.lon, dy = B.lat - A.lat, len2 = dx * dx + dy * dy
    const [minLat, maxLat] = A.lat < B.lat ? [A.lat, B.lat] : [B.lat, A.lat]
    const hits: { i: number; t: number }[] = []
    for (let k = firstAtLeast(Math.min(A.lon, B.lon)); k < byLon.length && pts[byLon[k]].lon <= Math.max(A.lon, B.lon); k++) {
      const i = byLon[k]
      if (i === a || i === b || pts[i].lat < minLat || pts[i].lat > maxLat) continue
      const px = pts[i].lon - A.lon, py = pts[i].lat - A.lat
      const t = (px * dx + py * dy) / len2
      // Within about 1 cm of the line, strictly between the ends.
      if (t > 0 && t < 1 && Math.abs(px * dy - py * dx) / Math.sqrt(len2) < 1e-7) hits.push({ i, t })
    }
    return hits.sort((x, y) => x.t - y.t).map((h) => h.i)
  }
  const edges: [number, number][] = []
  const seenEdge = new Set<string>()
  const addEdge = (a: number, b: number) => {
    const k = a < b ? `${a}-${b}` : `${b}-${a}`
    if (a === b || seenEdge.has(k)) return
    seenEdge.add(k)
    edges.push([a, b])
  }
  for (const w of ways) {
    for (let i = 0; i + 1 < w.length; i++) {
      const a = node(w[i]), b = node(w[i + 1])
      if (a === b) continue
      const chain = [a, ...onSegment(a, b), b]
      for (let j = 0; j + 1 < chain.length; j++) addEdge(chain[j], chain[j + 1])
    }
  }
  const adj: number[][] = pts.map(() => [])
  edges.forEach(([a, b], e) => { adj[a].push(e); adj[b].push(e) })

  // Bridges, by an iterative depth-first search (low-link), so long outlines can't overflow the stack.
  const order = new Array<number>(pts.length).fill(-1)
  const low = new Array<number>(pts.length).fill(0)
  const bridge = new Array<boolean>(edges.length).fill(false)
  let t = 0
  for (let root = 0; root < pts.length; root++) {
    if (order[root] !== -1) continue
    order[root] = low[root] = t++
    const stack: { v: number; via: number; next: number }[] = [{ v: root, via: -1, next: 0 }]
    while (stack.length) {
      const top = stack[stack.length - 1]
      if (top.next < adj[top.v].length) {
        const e = adj[top.v][top.next++]
        if (e === top.via) continue
        const u = edges[e][0] === top.v ? edges[e][1] : edges[e][0]
        if (order[u] === -1) {
          order[u] = low[u] = t++
          stack.push({ v: u, via: e, next: 0 })
        } else {
          low[top.v] = Math.min(low[top.v], order[u])
        }
      } else {
        stack.pop()
        if (stack.length) {
          const parent = stack[stack.length - 1].v
          low[parent] = Math.min(low[parent], low[top.v])
          if (low[top.v] > order[parent]) bridge[top.via] = true
        }
      }
    }
  }

  // Half-edge h runs from[h] -> to[h]; its twin is h ^ 1. Around each point, outgoing half-edges
  // sorted by direction.
  const from: number[] = [], to: number[] = []
  edges.forEach(([a, b], e) => { from[2 * e] = a; to[2 * e] = b; from[2 * e + 1] = b; to[2 * e + 1] = a })
  const out: number[][] = pts.map(() => [])
  for (let h = 0; h < 2 * edges.length; h++) if (!bridge[h >> 1]) out[from[h]].push(h)
  const slot = new Array<number>(2 * edges.length).fill(-1)
  out.forEach((hs, v) => {
    const angle = (h: number) => Math.atan2(pts[to[h]].lat - pts[v].lat, pts[to[h]].lon - pts[v].lon)
    hs.sort((x, y) => angle(x) - angle(y))
    hs.forEach((h, i) => { slot[h] = i })
  })
  // Arriving along h at point v, leave by the half-edge just clockwise of the way back.
  const next = (h: number) => {
    const hs = out[to[h]]
    return hs[(slot[h ^ 1] - 1 + hs.length) % hs.length]
  }

  // Connected pieces (bridges excluded), then every face; keep each piece's largest face.
  const piece = new Array<number>(pts.length).fill(-1)
  let pieces = 0
  for (let v = 0; v < pts.length; v++) {
    if (piece[v] !== -1 || !out[v].length) continue
    const todo = [v]
    piece[v] = pieces
    while (todo.length) {
      const x = todo.pop()!
      for (const h of out[x]) if (piece[to[h]] === -1) { piece[to[h]] = pieces; todo.push(to[h]) }
    }
    pieces++
  }
  const best: { area: number; face: number[] }[] = []
  const walked = new Array<boolean>(2 * edges.length).fill(false)
  for (let h0 = 0; h0 < 2 * edges.length; h0++) {
    if (walked[h0] || bridge[h0 >> 1]) continue
    const face: number[] = []
    for (let h = h0; !walked[h]; h = next(h)) { walked[h] = true; face.push(from[h]) }
    const area = Math.abs(shiftedArea(face.map((i) => pts[i])))
    const p = piece[face[0]]
    if (!best[p] || area > best[p].area) best[p] = { area, face }
  }

  const rings: Point[][] = []
  const seenRing = new Set<string>()
  for (const b of best) {
    if (!b) continue
    const chain = [...b.face, b.face[0]].map((i) => pts[i])
    for (const loop of loopsOf(chain)) {
      if (!hasArea(loop)) continue
      // Crossing lines without a shared point (invalid map data) can give the same ring twice;
      // drawing it twice would double its fill and stroke.
      const key = ringKey(loop)
      if (seenRing.has(key)) continue
      seenRing.add(key)
      rings.push(loop)
    }
  }
  return rings
}

const areaOf = (r: Point[]) => Math.abs(shiftedArea(r.slice(0, -1)))

/** A loaded cell: its features and the OpenStreetMap snapshot it was last confirmed against
 *  (`osm_base`; empty for cells published before site 1.1.1). */
export interface LoadedCell { cell: Cell; base: string; features: GeoJSON.Feature[] }

/** Features from several cells, each element once.
 *
 *  Neighbouring cells are refreshed on different nights, so they can hold different versions of
 *  the same element. Its features all come from one cell, so two versions never mix: the one most
 *  recently confirmed against OpenStreetMap (the first cell on a tie). An element deleted from
 *  OpenStreetMap can still show from a neighbour until it next refreshes (normally within 14 days): a cell's
 *  absence of an element can't prove it was deleted, since Overpass returns a way or relation for
 *  any part crossing a cell. */
export function mergeCells(cells: (LoadedCell | null)[]): GeoJSON.Feature[] {
  const loaded = cells.filter((c): c is LoadedCell => !!c)
  const owner = new Map<string, number>()
  loaded.forEach((c, i) => {
    for (const f of c.features) {
      const source = f.properties?.source as string | undefined
      if (!source) continue
      const cur = owner.get(source)
      if (cur === undefined || c.base > loaded[cur].base) owner.set(source, i)
    }
  })
  const out: GeoJSON.Feature[] = []
  loaded.forEach((c, i) => {
    for (const f of c.features) {
      const source = f.properties?.source as string | undefined
      if (!source) out.push(f)
      else if (owner.get(source) === i) out.push(f)
    }
  })
  return out
}

/** Whether two rings' edges cross (touching at a shared point doesn't count). */
export function crosses(a: Point[], b: Point[]): boolean {
  const side = (p: Point, q: Point, r: Point) => Math.sign((q.lon - p.lon) * (r.lat - p.lat) - (q.lat - p.lat) * (r.lon - p.lon))
  for (let i = 0; i + 1 < a.length; i++) {
    for (let j = 0; j + 1 < b.length; j++) {
      const p1 = a[i], p2 = a[i + 1], q1 = b[j], q2 = b[j + 1]
      if (sameSpot(p1, q1) || sameSpot(p1, q2) || sameSpot(p2, q1) || sameSpot(p2, q2)) continue
      const d1 = side(q1, q2, p1), d2 = side(q1, q2, p2), d3 = side(p1, p2, q1), d4 = side(p1, p2, q2)
      if (d1 * d2 < 0 && d3 * d4 < 0) return true
    }
  }
  return false
}

/** Whether a point is strictly inside a closed ring (ray casting). A point on a corner counts as
 *  outside; one lying along an edge may go either way. */
export function inside(p: Point, r: Point[]): boolean {
  let hit = false
  for (let i = 0, j = r.length - 2; i < r.length - 1; j = i++) {
    const a = r[i], b = r[j]
    if (sameSpot(p, a)) return false
    if ((a.lat > p.lat) !== (b.lat > p.lat) && p.lon < ((b.lon - a.lon) * (p.lat - a.lat)) / (b.lat - a.lat) + a.lon) hit = !hit
  }
  return hit
}

/** The same text for a ring whatever point it starts at and whichever way it runs. */
function ringKey(r: Point[]): string {
  // A ring's points are distinct, so starting at the smallest one fixes the rotation.
  const seq = r.slice(0, -1).map(spot)
  const from = (xs: string[]) => { const i = xs.indexOf(xs.reduce((m, x) => (x < m ? x : m))); return [...xs.slice(i), ...xs.slice(0, i)].join(';') }
  const a = from(seq), b = from([...seq].reverse())
  return a < b ? a : b
}

/** Twice the signed area of a closed path of points, taken relative to its first point so real
 *  coordinates don't cancel out. The path may or may not repeat its first point at the end. */
function shiftedArea(r: Point[]): number {
  if (r.length < 3) return 0
  const o = r[0]
  let twice = 0
  for (let i = 0; i < r.length; i++) {
    const p = r[i], q = r[(i + 1) % r.length]
    twice += (p.lon - o.lon) * (q.lat - o.lat) - (q.lon - o.lon) * (p.lat - o.lat)
  }
  return twice
}

/** A closed ring with at least three distinct points and an area above about 0.01 m². The sum is
 *  taken relative to the first point, so real coordinates don't cancel it out. */
export function hasArea(r: Point[]): boolean {
  if (r.length < 4 || !sameSpot(r[0], r[r.length - 1])) return false
  if (new Set(r.slice(0, -1).map(spot)).size < 3) return false
  return Math.abs(shiftedArea(r.slice(0, -1))) / 2 > 1e-12
}

/** The closed loops in a chain of points: each time the chain returns to a point it already
 *  visited, the stretch since then is a ring. Splits outlines that touch at one point and keeps
 *  closed loops out of a chain whose ends never meet. */
export function loopsOf(chain: Point[]): Point[][] {
  const loops: Point[][] = []
  const path: Point[] = []
  const seen = new Map<string, number>()
  for (const p of chain) {
    const at = seen.get(spot(p))
    if (at !== undefined) {
      const loop = path.splice(at)
      for (const q of loop) seen.delete(spot(q))
      if (loop.length >= 3) loops.push([...loop, p])
    }
    seen.set(spot(p), path.length)
    path.push(p)
  }
  return loops
}

export function toFeatures(elements: Element[]): GeoJSON.Feature[] {
  const features: GeoJSON.Feature[] = []
  let from = ''
  // Each feature carries the element it came from, so one found in several cells (a relation near
  // a cell edge is in each neighbouring cell) is shown once: see mergeCells.
  const push = (f: GeoJSON.Feature) => { f.properties = { ...f.properties, source: from }; features.push(f) }
  for (const el of elements) {
    from = `${el.type}/${el.id}`
    const tags = el.tags
    if (!tags) continue
    if (el.type === 'node' && Number.isFinite(el.lat) && Number.isFinite(el.lon)) {
      const kind: IndoorKind | null = tags.aeroway === 'gate' ? 'gate' : tags.shop ? 'shop' : tags.amenity ? 'amenity' : null
      if (!kind) continue
      push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [el.lon!, el.lat!] },
        properties: { kind, name: tags.name ?? tags.ref ?? '', icon: icon(tags, kind), levels: parseLevels(tags.level), point: true },
      })
      continue
    }
    // A way with a point Overpass couldn't place is skipped rather than drawn with a gap.
    if (el.type === 'way' && el.geometry && el.geometry.length >= 2 && el.geometry.every(realPoint)) {
      const pts = el.geometry
      const closed = pts.length >= 4 && pts[0].lat === pts[pts.length - 1].lat && pts[0].lon === pts[pts.length - 1].lon
      const kind = kindFor(tags, closed)
      if (!kind) continue
      const levels = kind === 'footprint' ? [] : parseLevels(tags.level)
      const props = { kind, name: tags.name ?? tags.ref ?? '', icon: icon(tags, kind), levels }
      if (closed && kind !== 'wall' && kind !== 'stairs') {
        push({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [ring(pts)] }, properties: props })
        if (props.name || props.icon) {
          const c = pts.reduce((a, p) => [a[0] + p.lon / pts.length, a[1] + p.lat / pts.length], [0, 0])
          push({ type: 'Feature', geometry: { type: 'Point', coordinates: c }, properties: { ...props, point: true, label: true } })
        }
      } else {
        push({ type: 'Feature', geometry: { type: 'LineString', coordinates: ring(pts) }, properties: props })
      }
      continue
    }
    if (el.type === 'relation' && el.members) {
      const kind = kindFor(tags, true)
      if (!kind) continue
      const ways = (role: 'outer' | 'inner') =>
        el.members!.filter((m) => (m.role || 'outer') === role && Array.isArray(m.geometry)).flatMap((m) => runsOf(m.geometry!))
      const outers = outlinesOf(ways('outer'))
      // Inner rings (courtyards, atriums) become holes in the outline that holds them.
      const holes: Point[][][] = outers.map(() => [])
      for (const inner of outlinesOf(ways('inner'))) {
        // The innermost outline holding it: an island inside a courtyard keeps its own atrium.
        let at = -1
        outers.forEach((o, i) => {
          // Every point of the hole inside the outline (or on one of its corners); a ring crossing
          // the outline would make an invalid polygon and is left out.
          const corners = new Set(o.map(spot))
          if (inner.slice(0, -1).every((p) => corners.has(spot(p)) || inside(p, o)) && !crosses(inner, o) && (at < 0 || areaOf(o) < areaOf(outers[at]))) at = i
        })
        if (at >= 0) holes[at].push(inner)
      }
      outers.forEach((r, i) => {
        push({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [ring(r), ...holes[i].map(ring)] }, properties: { kind, name: tags.name ?? '', levels: kind === 'footprint' ? [] : parseLevels(tags.level) } })
      })
    }
  }
  return features
}

// The publisher's osm_base, e.g. 2026-11-22T07:20:03Z; anything else counts as no snapshot.
const SNAPSHOT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/

const cache = new Map<string, LoadedCell | null>()

const MAX_CACHED_CELLS = 48
function rememberCell(key: string, value: LoadedCell | null) {
  cache.delete(key)
  cache.set(key, value)
  if (cache.size > MAX_CACHED_CELLS) cache.delete(cache.keys().next().value!)
}

export async function loadCell(cell: Cell): Promise<LoadedCell | null> {
  const key = `${cell.row}_${cell.col}`
  if (cache.has(key)) {
    const value = cache.get(key)!
    rememberCell(key, value)
    return value
  }
  let res: Response
  try {
    res = await fetch(`${BASE}/indoor_${key}.json`)
  } catch {
    return null // offline or transient; try again on the next move
  }
  if (res.status === 404) {
    rememberCell(key, null)
    return null
  }
  if (!res.ok) return null // transient; try again on the next move
  let text: string
  try {
    text = await res.text()
  } catch {
    return null // the connection dropped mid-body; try again on the next move
  }
  try {
    const json = JSON.parse(text) as { elements?: unknown; osm_base?: unknown }
    if (!json || typeof json !== 'object' || !Array.isArray(json.elements)) throw new Error('not a cell')
    const loaded: LoadedCell = { cell, base: typeof json.osm_base === 'string' && SNAPSHOT.test(json.osm_base) ? json.osm_base : '', features: toFeatures(json.elements as Element[]) }
    rememberCell(key, loaded)
    return loaded
  } catch {
    // Not JSON, or not a cell: it won't parse on the next move either; remember it as empty.
    rememberCell(key, null)
    return null
  }
}
