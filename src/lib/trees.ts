import { config } from './config'

// Port of TreeCoverService.swift (iPhone builds 19–20): 3D trees wherever there really are trees.
// Mapbox stands a tree up only where OpenStreetMap maps one; our `tree_cover_tiles` hold where
// cover is (ESA WorldCover, 10 m) and, where known, each single tree and its height (1 m
// canopy height map). Same tiles, same planting and the same shapes as on iPhone.

export const ZOOM = 14
export const COVER_CELLS = 256
export const TREE_CELLS = 512
export const HEIGHT_CELLS = 64
export const RADIUS_METRES = 650
export const REPLANT_METRES = 170
export const SPARSITY = 3n
export const MIN_ZOOM = 15
export const TREE_LIMIT = 3200

export type Ground = { kind: 'bare' } | { kind: 'cover'; bits: Uint8Array } | { kind: 'single'; bits: Uint8Array; heights: Uint8Array }
export interface Tile { x: number; y: number; mask: string; trees?: string | null; heights?: string | null }
export interface MapTree { longitude: number; latitude: number; variety: number; height?: number }

/** Apple's "zlib" compression is raw DEFLATE (no header), base64 encoded. */
async function inflate(text: string | null | undefined, size: number): Promise<Uint8Array | null> {
  if (!text) return null
  try {
    const packed = Uint8Array.from(atob(text), (c) => c.charCodeAt(0))
    const stream = new Blob([packed]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
    const raw = new Uint8Array(await new Response(stream).arrayBuffer())
    return raw.length === size ? raw : null
  } catch { return null }
}

export async function groundOf(tile: Tile): Promise<Ground> {
  const [bits, heights] = await Promise.all([inflate(tile.trees, (TREE_CELLS * TREE_CELLS) / 8), inflate(tile.heights, HEIGHT_CELLS * HEIGHT_CELLS)])
  if (bits && heights) return { kind: 'single', bits, heights }
  const cover = await inflate(tile.mask, (COVER_CELLS * COVER_CELLS) / 8)
  return cover ? { kind: 'cover', bits: cover } : { kind: 'bare' }
}

// ---- grid
export function tilePosition(latitude: number, longitude: number) {
  const n = 2 ** ZOOM
  const lat = (Math.min(Math.max(latitude, -85), 85) * Math.PI) / 180
  return { x: ((longitude + 180) / 360) * n, y: ((1 - Math.asinh(Math.tan(lat)) / Math.PI) / 2) * n }
}
export function coordinateAt(tileX: number, tileY: number) {
  const n = 2 ** ZOOM
  return { latitude: (Math.atan(Math.sinh(Math.PI * (1 - (2 * tileY) / n))) * 180) / Math.PI, longitude: (tileX / n) * 360 - 180 }
}
export const cellMetres = (latitude: number) => (40_075_016.686 * Math.cos((latitude * Math.PI) / 180)) / (2 ** ZOOM * COVER_CELLS)
export function tileBlock(latitude: number, longitude: number): { x: number; y: number }[] {
  const p = tilePosition(latitude, longitude)
  const reach = RADIUS_METRES / (cellMetres(latitude) * COVER_CELLS)
  const out: { x: number; y: number }[] = []
  for (let y = Math.floor(p.y - reach); y <= Math.floor(p.y + reach); y++) for (let x = Math.floor(p.x - reach); x <= Math.floor(p.x + reach); x++) out.push({ x, y })
  return out
}
export function metres(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const dLat = (a.latitude - b.latitude) * 111_320
  const dLon = (a.longitude - b.longitude) * 111_320 * Math.cos((a.latitude * Math.PI) / 180)
  return Math.hypot(dLat, dLon)
}

// ---- planting (bit-for-bit the iPhone's scramble, so both apps grow the same trees)
const M = (1n << 64n) - 1n
const u64 = (n: number) => BigInt.asUintN(64, BigInt(n))
export function scramble(x: number, y: number): bigint {
  let h = ((u64(x) * 0x9e3779b97f4a7c15n) & M) ^ ((u64(y) * 0xc2b2ae3d27d4eb4fn) & M)
  h ^= h >> 31n; h = (h * 0xbf58476d1ce4e5b9n) & M
  h ^= h >> 29n; h = (h * 0x94d049bb133111ebn) & M
  h ^= h >> 32n
  return h
}

export function plant(tiles: { x: number; y: number; ground: Ground }[], centre: { latitude: number; longitude: number }, radius = RADIUS_METRES, limit = TREE_LIMIT): MapTree[] {
  const position = tilePosition(centre.latitude, centre.longitude)
  const picked: { hash: bigint; x: number; y: number; cells: number; height: number }[] = []
  const scan = (bits: Uint8Array, tile: { x: number; y: number }, cells: number, body: (i: number, j: number) => void) => {
    if (bits.length !== (cells * cells) / 8) return
    const cx = position.x * cells, cy = position.y * cells
    const reach = radius / ((cellMetres(centre.latitude) * COVER_CELLS) / cells)
    const left = tile.x * cells, top = tile.y * cells
    const i0 = Math.max(Math.floor(cx - reach), left), i1 = Math.min(Math.ceil(cx + reach), left + cells - 1)
    const j0 = Math.max(Math.floor(cy - reach), top), j1 = Math.min(Math.ceil(cy + reach), top + cells - 1)
    for (let j = j0; j <= j1; j++) {
      const dy = j + 0.5 - cy
      for (let i = i0; i <= i1; i++) {
        const index = (j - top) * cells + (i - left)
        if (!(bits[index >> 3] & (0x80 >> (index & 7)))) continue
        const dx = i + 0.5 - cx
        if (dx * dx + dy * dy > reach * reach) continue
        body(i, j)
      }
    }
  }
  for (const tile of tiles) {
    const g = tile.ground
    if (g.kind === 'cover') {
      scan(g.bits, tile, COVER_CELLS, (i, j) => { const hash = scramble(i, j); if (hash % SPARSITY === 0n) picked.push({ hash, x: i, y: j, cells: COVER_CELLS, height: 0 }) })
    } else if (g.kind === 'single') {
      if (g.heights.length !== HEIGHT_CELLS * HEIGHT_CELLS) continue
      const per = TREE_CELLS / HEIGHT_CELLS
      scan(g.bits, tile, TREE_CELLS, (i, j) => {
        const sample = g.heights[Math.floor((j - tile.y * TREE_CELLS) / per) * HEIGHT_CELLS + Math.floor((i - tile.x * TREE_CELLS) / per)]
        picked.push({ hash: scramble(i + 0x5151, j), x: i, y: j, cells: TREE_CELLS, height: Math.max(sample, 3) })
      })
    }
  }
  if (picked.length > limit) { picked.sort((a, b) => (a.hash < b.hash ? -1 : a.hash > b.hash ? 1 : 0)); picked.length = limit }
  return picked.map((c) => {
    const bits = (shift: bigint, mask: bigint) => Number((c.hash >> shift) & mask)
    const variety = bits(24n, 0xffffn) / 65536
    const nudge = c.height === 0 ? 0.8 : 0.5
    const jx = (bits(8n, 0xffn) / 255 - 0.5) * nudge, jy = (bits(16n, 0xffn) / 255 - 0.5) * nudge
    const at = coordinateAt((c.x + 0.5 + jx) / c.cells, (c.y + 0.5 + jy) / c.cells)
    if (c.height === 0) return { ...at, variety }
    const share = 0.72 + ((variety * 13) % 1) * 0.28
    return { ...at, variety, height: Math.max(3, c.height * share) }
  })
}

// ---- shapes: trunk, six-sided crown and a narrower cap, as on iPhone
export const KIND = { trunk: 0, crown: 1, crownDark: 2, crownLight: 3 }
function ring(t: MapTree, radius: number, sides: number, turn: number): [number, number][] {
  const lonScale = Math.max(Math.cos((t.latitude * Math.PI) / 180), 0.01)
  const r: [number, number][] = []
  for (let s = 0; s < sides; s++) {
    const a = turn + (s / sides) * 2 * Math.PI
    r.push([t.longitude + (radius * Math.cos(a)) / (111_320 * lonScale), t.latitude + (radius * Math.sin(a)) / 111_320])
  }
  r.push(r[0])
  return r
}
export function shapes(trees: MapTree[]): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = []
  const block = (r: [number, number][], b: number, h: number, k: number) => features.push({ type: 'Feature', properties: { b, h, k }, geometry: { type: 'Polygon', coordinates: [r] } })
  for (const t of trees) {
    const v = t.variety
    let height: number, trunk: number, radius: number
    if (t.height !== undefined) { height = Math.min(t.height, 40); trunk = height * 0.27; radius = Math.min(Math.max(height * 0.36, 1.5), 5.2) }
    else { const size = 0.75 + ((v * 7) % 1) * 0.6; height = 9 * size; trunk = 2.4 * size; radius = 3.6 * size }
    const turn = v * 2 * Math.PI
    const kind = v < 0.4 ? KIND.crown : v < 0.75 ? KIND.crownDark : KIND.crownLight
    block(ring(t, 0.35, 4, 0), 0, trunk, KIND.trunk)
    block(ring(t, radius, 6, turn), trunk, height * 0.72, kind)
    block(ring(t, radius * 0.62, 6, turn + Math.PI / 6), height * 0.72, height, kind)
  }
  return { type: 'FeatureCollection', features }
}

// ---- fetching: files on tiles.kovamaps.com first, then the table, like iPhone
const FILE_HOST = 'https://tiles.kovamaps.com'
let filesBlocked = false
const grounds = new Map<string, Promise<Ground>>()
const key = (x: number, y: number) => `${x},${y}`

async function fromFile(x: number, y: number): Promise<Tile | null | 'missing'> {
  if (filesBlocked) return null
  try {
    const res = await fetch(`${FILE_HOST}/trees/v1/${ZOOM}/${x}/${y}.json`)
    if (res.status === 404) return 'missing'
    return res.ok ? ((await res.json()) as Tile) : null
  } catch {
    // The file host does not allow this site yet (no CORS header): use the table this session.
    filesBlocked = true
    return null
  }
}
async function fromTable(tiles: { x: number; y: number }[]): Promise<Tile[]> {
  const xs = [...new Set(tiles.map((t) => t.x))].join(','), ys = [...new Set(tiles.map((t) => t.y))].join(',')
  const res = await fetch(`${config.supabase.url}/rest/v1/tree_cover_tiles?select=x,y,mask,trees,heights&x=in.(${xs})&y=in.(${ys})`, { headers: { apikey: config.supabase.anonKey } })
  if (!res.ok) throw new Error(`trees ${res.status}`)
  return (await res.json()) as Tile[]
}

/** The ground of each tile, fetched once per session; a tile with no row has no trees. */
export async function loadGrounds(block: { x: number; y: number }[]): Promise<{ x: number; y: number; ground: Ground }[]> {
  const missing = block.filter((t) => !grounds.has(key(t.x, t.y)))
  if (missing.length) {
    const job = (async () => {
      const found = new Map<string, Tile>()
      const rest: { x: number; y: number }[] = []
      await Promise.all(missing.map(async (t) => { const f = await fromFile(t.x, t.y); if (f && f !== 'missing') found.set(key(t.x, t.y), f); else rest.push(t) }))
      if (rest.length) for (const row of await fromTable(rest)) found.set(key(row.x, row.y), row)
      return found
    })()
    for (const t of missing) {
      const p = job.then((found) => { const row = found.get(key(t.x, t.y)); return row ? groundOf(row) : ({ kind: 'bare' } as Ground) })
      p.catch(() => grounds.delete(key(t.x, t.y)))
      grounds.set(key(t.x, t.y), p)
    }
  }
  const out = await Promise.all(block.map(async (t) => ({ ...t, ground: await grounds.get(key(t.x, t.y))! })))
  if (grounds.size > 32) for (const k of [...grounds.keys()].slice(0, grounds.size - 32)) grounds.delete(k)
  return out
}

/** The United States, as iPhone's ServiceRegion: tiles outside the loaded states answer "no trees" once per session. */
export function inTreeRegion(latitude: number, longitude: number) {
  const lower48 = latitude > 24.3 && latitude < 49.5 && longitude > -125 && longitude < -66.8
  const alaska = latitude > 51 && latitude < 71.5 && longitude > -170 && longitude < -129.9
  const hawaii = latitude > 18.8 && latitude < 22.4 && longitude > -160.4 && longitude < -154.7
  return lower48 || alaska || hawaii
}
