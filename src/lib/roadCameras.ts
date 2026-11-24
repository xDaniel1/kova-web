// Speed, red-light and toll cameras, traffic webcams, traffic lights and stop signs along a drive,
// from real sources only, as iPhone's SpeedCameraService and TrafficSignalService have them
// (waypoint-ios 5f25b60).
//
// 1. OpenStreetMap through Overpass: `highway=speed_camera` nodes and the `device` of
//    `type=enforcement` relations (where red-light and average-speed cameras live), toll points
//    (`highway=toll_gantry`, `barrier=toll_booth` nodes and ways, `enforcement=toll`), and
//    `highway=traffic_signals` / `highway=stop` nodes.
// 2. NYC DOT's traffic cameras, through the `google` Edge Function (the list has no CORS headers).
//    Drawn with their live picture, never warned about.
//
// Where OSM has nothing, nothing is shown. There is no fallback dataset of guesses.

import { config } from './config'

export type CameraKind = 'fixedRadar' | 'redLight' | 'averageSpeed' | 'tollGantry' | 'tollBooth' | 'trafficCamera'

export interface RoadCamera {
  id: string
  lat: number
  lon: number
  kind: CameraKind
  /** Clockwise from north; empty when the data doesn't say which way it faces. */
  headings: number[]
  /** The limit it enforces, km/h, where the data says. Never set on tolls. */
  maxSpeedKph?: number
  /** "Verrazzano-Narrows Bridge", "QBB @ Crescent St". */
  name?: string
  /** Traffic cameras: the live still. */
  imageUrl?: string
}

export interface TrafficSignal {
  id: string
  lat: number
  lon: number
  kind: 'light' | 'stop'
}

export const TITLES: Record<CameraKind, string> = {
  fixedRadar: 'Fixed Radar',
  redLight: 'Red-Light Camera',
  averageSpeed: 'Average Speed',
  tollGantry: 'Toll Camera',
  tollBooth: 'Toll Plaza',
  trafficCamera: 'Traffic Camera',
}

/** Typical spread and reach of each kind (OSM records neither), as on iPhone. */
const BEAM: Record<CameraKind, number> = { fixedRadar: 40, redLight: 60, averageSpeed: 40, tollGantry: 360, tollBooth: 360, trafficCamera: 360 }
export const RANGE_M: Record<CameraKind, number> = { fixedRadar: 100, redLight: 60, averageSpeed: 90, tollGantry: 60, tollBooth: 80, trafficCamera: 40 }

export const isToll = (k: CameraKind) => k === 'tollGantry' || k === 'tollBooth'
/** A traffic webcam fines nobody; warning about one would teach drivers to tune warnings out. */
export const alertsDriver = (k: CameraKind) => k !== 'trafficCamera'

/** Speed-related enforcement and tolls become cameras; checkpoints and the like don't. */
export function cameraKind(enforcement: string | undefined): CameraKind | null {
  switch (enforcement) {
    case undefined:
    case 'maxspeed':
      return 'fixedRadar'
    case 'traffic_signals':
      return 'redLight'
    case 'average_speed':
      return 'averageSpeed'
    case 'toll':
      return 'tollGantry'
    default:
      return null
  }
}

const CARDINAL: Record<string, number> = {
  N: 0, NNE: 22.5, NE: 45, ENE: 67.5, E: 90, ESE: 112.5, SE: 135, SSE: 157.5,
  S: 180, SSW: 202.5, SW: 225, WSW: 247.5, W: 270, WNW: 292.5, NW: 315, NNW: 337.5,
}

/** OSM `direction`: degrees or compass points, several separated by `;`. forward/backward are
 *  relative to a way the node doesn't carry, so they count as unknown. */
export function parseDirections(raw: string | undefined): number[] {
  if (!raw) return []
  return raw.split(';').flatMap((part) => {
    const t = part.trim()
    const n = Number(t)
    if (t !== '' && Number.isFinite(n)) return [((n % 360) + 360) % 360]
    const c = CARDINAL[t.toUpperCase()]
    return c === undefined ? [] : [c]
  })
}

/** OSM maxspeed to km/h: "50", "30 mph", "50 km/h". Anything else (signals, none) is unknown. */
export function parseMaxspeed(raw: string | undefined): number | undefined {
  if (!raw) return undefined
  const m = /^\s*(\d+(?:\.\d+)?)\s*(mph|km\/h|kmh|kph)?\s*$/i.exec(raw)
  if (!m) return undefined
  const v = Number(m[1])
  return Math.round(m[2]?.toLowerCase() === 'mph' ? v * 1.609344 : v)
}

// ---------- geometry

const R = 6371008.8
const rad = (d: number) => (d * Math.PI) / 180

export function distanceMeters(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

function bearing(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const y = Math.sin(rad(b.lon - a.lon)) * Math.cos(rad(b.lat))
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lon - a.lon))
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}

/** Whether a point is inside a camera's coverage: a disc when its direction is unknown (or it
 *  spans the road, like a toll), else a cone along any of its headings. */
const angleDiff = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180)

/** Whether a point is inside a camera's coverage: a disc when its direction is unknown (or it
 *  spans the road, like a toll), else a cone along any of its headings. With `course` (the way the
 *  route is moving there), a directional camera also has to face you: you drive towards it, within
 *  45° of straight on, so a camera you have already passed, or one watching the other carriageway,
 *  never counts (iPhone ties the cone to the live course the same way). */
export function covers(camera: RoadCamera, p: { lat: number; lon: number }, course?: number): boolean {
  const d = distanceMeters(camera, p)
  if (d > RANGE_M[camera.kind]) return false
  const beam = BEAM[camera.kind]
  if (beam >= 360 || camera.headings.length === 0) return true
  const facesYou = (h: number) => course === undefined || angleDiff(course, (h + 180) % 360) <= 45
  // Right at the camera the bearing to you means nothing; only which way it faces does.
  if (d < 1) return camera.headings.some(facesYou)
  const b = bearing(camera, p)
  return camera.headings.some((h) => angleDiff(b, h) <= beam / 2 && facesYou(h))
}

// ---------- parsing

interface OverpassElement {
  type: string
  id: number
  lat?: number
  lon?: number
  center?: { lat: number; lon: number }
  tags?: Record<string, string>
  members?: { type: string; ref: number; role: string }[]
}

/** Points of the same toll kind this close are one toll: mappers often put a toll point on every
 *  lane (the Verrazzano gantry is seven nodes within 100 m). The first, by id, stands for them. */
export const TOLL_MERGE_M = 150

export function mergeTollLanes(cameras: RoadCamera[]): RoadCamera[] {
  const kept: RoadCamera[] = []
  for (const c of cameras) {
    if (isToll(c.kind)) {
      const same = kept.find((k) => k.kind === c.kind && distanceMeters(k, c) <= TOLL_MERGE_M)
      if (same) {
        same.name ??= c.name
        continue
      }
    }
    kept.push({ ...c })
  }
  return kept
}

function isFiniteCoord(e: { lat?: unknown; lon?: unknown }): e is { lat: number; lon: number } {
  return typeof e.lat === 'number' && typeof e.lon === 'number' && Number.isFinite(e.lat) && Number.isFinite(e.lon)
}

/** Cameras and toll points in an Overpass answer (`out body center`). */
export function parseCameras(elements: OverpassElement[]): RoadCamera[] {
  const byDevice = new Map<number, { kind: CameraKind; maxspeed?: string }>()
  for (const r of elements) {
    if (r.type !== 'relation') continue
    const kind = cameraKind(r.tags?.enforcement)
    if (!kind) continue
    for (const m of r.members ?? []) if (m.type === 'node' && m.role === 'device') byDevice.set(m.ref, { kind, maxspeed: r.tags?.maxspeed })
  }
  const out: RoadCamera[] = []
  const nodes = elements.filter((e) => e.type === 'node').sort((a, b) => a.id - b.id)
  const seen = new Set<number>()
  for (const n of nodes) {
    if (seen.has(n.id) || !isFiniteCoord(n)) continue
    seen.add(n.id)
    const tags = n.tags ?? {}
    const rel = byDevice.get(n.id)
    let kind: CameraKind | null
    if (rel) kind = rel.kind
    else if (tags.highway === 'toll_gantry') kind = 'tollGantry'
    else if (tags.barrier === 'toll_booth') kind = 'tollBooth'
    else if (tags.highway === 'speed_camera') kind = cameraKind(tags.enforcement)
    else kind = null
    if (!kind) continue
    if (isToll(kind)) {
      // A toll bills the plate at any speed: no limit, no cone. A maxspeed on a gantry is the road's.
      out.push({ id: `n${n.id}`, lat: n.lat, lon: n.lon, kind, headings: [], name: tags.name ?? tags.operator })
      continue
    }
    out.push({
      id: `n${n.id}`, lat: n.lat, lon: n.lon, kind,
      headings: parseDirections(tags.direction ?? tags['camera:direction']),
      maxSpeedKph: parseMaxspeed(tags.maxspeed ?? rel?.maxspeed),
    })
  }
  // Plazas drawn as a short way across the road, at the way's centre.
  for (const w of elements.filter((e) => e.type === 'way' && e.tags?.barrier === 'toll_booth').sort((a, b) => a.id - b.id)) {
    if (!w.center || !isFiniteCoord(w.center)) continue
    out.push({ id: `w${w.id}`, lat: w.center.lat, lon: w.center.lon, kind: 'tollBooth', headings: [], name: w.tags?.name ?? w.tags?.operator })
  }
  return mergeTollLanes(out)
}

export function parseSignals(elements: OverpassElement[]): TrafficSignal[] {
  const out: TrafficSignal[] = []
  for (const n of elements) {
    if (n.type !== 'node' || !isFiniteCoord(n)) continue
    const h = n.tags?.highway
    if (h === 'traffic_signals') out.push({ id: `s${n.id}`, lat: n.lat, lon: n.lon, kind: 'light' })
    else if (h === 'stop') out.push({ id: `s${n.id}`, lat: n.lat, lon: n.lon, kind: 'stop' })
  }
  return out
}

/** NYC DOT's list, online cameras with an https picture only (an offline one opens on a dead frame). */
export function parseNYCCameras(list: unknown): RoadCamera[] {
  if (!Array.isArray(list)) return []
  return list.flatMap((c) => {
    if (!c || typeof c !== 'object') return []
    const { id, name, latitude, longitude, isOnline, imageUrl } = c as Record<string, unknown>
    if (String(isOnline).toLowerCase() !== 'true' || typeof id !== 'string') return []
    if (typeof latitude !== 'number' || typeof longitude !== 'number' || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return []
    if (typeof imageUrl !== 'string' || !imageUrl.startsWith('https://')) return []
    return [{ id: `nyc-${id}`, lat: latitude, lon: longitude, kind: 'trafficCamera' as const, headings: [], name: typeof name === 'string' ? name : undefined, imageUrl }]
  })
}

// ---------- fetching

/** The public Overpass servers, tried in turn: one busy server (429/504 at rush hour) shouldn't
 *  leave the map without cameras. Browsers send their own User-Agent and don't let pages set it. */
export const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
]

/** An Overpass answer's elements, or null when every server failed. A 200 that isn't JSON (a busy
 *  server's HTML error page) or carries a `remark` (timeout, out of memory) is a miss, not "none". */
export async function overpass(query: string, signal?: AbortSignal, fetcher: typeof fetch = fetch): Promise<OverpassElement[] | null> {
  // A simple form POST: no custom headers, so no CORS preflight.
  const body = new URLSearchParams({ data: query })
  for (const endpoint of OVERPASS_ENDPOINTS) {
    if (signal?.aborted) return null
    // A server that never answers (seen on two mirrors) must not hold up the rest: 15 s each.
    const own = new AbortController()
    const timer = setTimeout(() => own.abort(), PER_SERVER_MS)
    const onAbort = () => own.abort()
    signal?.addEventListener('abort', onAbort)
    try {
      const res = await fetcher(endpoint, { method: 'POST', body, signal: own.signal })
      if (!res.ok) continue
      const json = JSON.parse(await res.text()) as { elements?: unknown; remark?: unknown }
      if (!json || !Array.isArray(json.elements) || json.remark) continue
      return json.elements as OverpassElement[]
    } catch {
      if (signal?.aborted) return null
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
    }
  }
  return null
}

export const PER_SERVER_MS = 15_000

/** Blocks of 0.06°, iPhone's 3×3 block of 0.02° tiles: one query each. */
export const BLOCK_DEG = 0.06

export function blockOf(lat: number, lon: number): string {
  return `${Math.floor(lat / BLOCK_DEG)},${Math.floor(lon / BLOCK_DEG)}`
}

export function blockQuery(key: string): string {
  const [r, c] = key.split(',').map(Number)
  const box = `${(r * BLOCK_DEG).toFixed(4)},${(c * BLOCK_DEG).toFixed(4)},${((r + 1) * BLOCK_DEG).toFixed(4)},${((c + 1) * BLOCK_DEG).toFixed(4)}`
  // Relations first so their device nodes are pulled in by reference; `center` gives toll ways a point.
  return `[out:json][timeout:25];rel["type"="enforcement"](${box})->.r;` +
    `(node["highway"="speed_camera"](${box});node["highway"="toll_gantry"](${box});node["barrier"="toll_booth"](${box});` +
    `way["barrier"="toll_booth"](${box});node(r.r:"device");.r;node["highway"~"^(traffic_signals|stop)$"](${box}););out body center;`
}

export interface Block { cameras: RoadCamera[]; signals: TrafficSignal[] }

// v2: tolls joined the query, as on iPhone; nothing older may stand in for a block.
const CACHE_PREFIX = 'kova.roadCameras.v2.'
const FRESH_MS = 7 * 86400_000
const KEEP_MS = 60 * 86400_000

function readBlock(key: string): { at: number; block: Block } | null {
  try {
    const raw = JSON.parse(localStorage.getItem(CACHE_PREFIX + key) ?? 'null')
    if (!raw || typeof raw.at !== 'number' || !Array.isArray(raw.block?.cameras) || !Array.isArray(raw.block?.signals)) return null
    return Date.now() - raw.at < KEEP_MS ? raw : null
  } catch {
    return null
  }
}

const round5 = (n: number) => Math.round(n * 1e5) / 1e5

/** Blocks older than two months are deleted; when storage is full the oldest go first. */
function pruneBlocks(keepNewest: number) {
  const entries: { key: string; at: number }[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (!key?.startsWith('kova.roadCameras.')) continue
    let at = 0
    try { at = Number(JSON.parse(localStorage.getItem(key) ?? 'null')?.at) || 0 } catch { /* unreadable: oldest */ }
    entries.push({ key, at })
  }
  entries.sort((a, b) => b.at - a.at)
  entries.forEach((e, i) => { if (!e.key.startsWith(CACHE_PREFIX) || Date.now() - e.at >= KEEP_MS || i >= keepNewest) localStorage.removeItem(e.key) })
}

let sweptExpired = false

function writeBlock(key: string, block: Block) {
  // Five decimals is about a metre: city blocks with thousands of signals stay small.
  const compact: Block = {
    cameras: block.cameras.map((c) => ({ ...c, lat: round5(c.lat), lon: round5(c.lon) })),
    signals: block.signals.map((s) => ({ ...s, lat: round5(s.lat), lon: round5(s.lon) })),
  }
  const value = JSON.stringify({ at: Date.now(), block: compact })
  try {
    // Expired blocks are swept once per page, not on every write (each read parses a whole block).
    if (!sweptExpired) { sweptExpired = true; pruneBlocks(Infinity) }
    localStorage.setItem(CACHE_PREFIX + key, value)
  } catch {
    // Full: keep the newest half and try once more; otherwise the block lives only in this page.
    try {
      pruneBlocks(Math.floor(countBlocks() / 2))
      localStorage.setItem(CACHE_PREFIX + key, value)
    } catch { /* storage blocked */ }
  }
}

function countBlocks(): number {
  let n = 0
  for (let i = 0; i < localStorage.length; i++) if (localStorage.key(i)?.startsWith('kova.roadCameras.')) n++
  return n
}

const memory = new Map<string, Promise<Block | null>>()

/** One block's cameras and signals: a week-old copy is fresh (cameras change on the scale of
 *  months), and a two-month-old one beats a blank map when every server is busy. */
export function loadBlock(key: string, opts: { cachedOnly?: boolean; signal?: AbortSignal } = {}): Promise<Block | null> {
  if (opts.cachedOnly) return Promise.resolve(memory.has(key) ? memory.get(key)! : readBlock(key)?.block ?? null)
  let p = memory.get(key)
  if (!p) {
    p = (async () => {
      const cached = readBlock(key)
      if (cached && Date.now() - cached.at < FRESH_MS) return cached.block
      // Aborted (the route changed): this request is dropped from memory below, so the next
      // caller asks again rather than inheriting a cancelled answer.
      const elements = await overpass(blockQuery(key), opts.signal)
      if (elements) {
        const block = { cameras: parseCameras(elements), signals: parseSignals(elements) }
        writeBlock(key, block)
        return block
      }
      return cached?.block ?? null
    })()
    memory.set(key, p)
    p.then((b) => { if (!b) memory.delete(key) }) // a failed block can be asked again later
  }
  return p
}

let nyc: Promise<RoadCamera[]> | null = null

/** Roughly the five boroughs plus a margin; outside it the NYC list has nothing to offer. */
export const nearNYC = (lat: number, lon: number) => lat >= 40.4 && lat <= 41.0 && lon >= -74.35 && lon <= -73.6

export function loadNYCCameras(): Promise<RoadCamera[]> {
  nyc ??= fetch(`${config.supabase.url}/functions/v1/google/nyc/cameras`, { headers: { apikey: config.supabase.anonKey } })
    .then((r) => (r.ok ? r.json() : []))
    .then(parseNYCCameras)
    .catch(() => [])
    .then((list) => { if (!list.length) nyc = null; return list })
  return nyc
}

// ---------- along a route

export interface OnRoute<T> { item: T; alongMeters: number }

export interface Sample { lat: number; lon: number; along: number; /** The route's course here. */ course: number }

/** Route points every `spacing` metres with their distance from the start and the route's course. */
export function sampleRoute(line: number[][], spacing = 10): Sample[] {
  const out: Sample[] = []
  let along = 0
  let course = 0
  for (let i = 0; i + 1 < line.length; i++) {
    const a = { lon: line[i][0], lat: line[i][1] }, b = { lon: line[i + 1][0], lat: line[i + 1][1] }
    const seg = distanceMeters(a, b)
    if (seg > 0) course = bearing(a, b)
    const n = Math.max(1, Math.ceil(seg / spacing))
    for (let k = 0; k < n; k++) {
      const t = k / n
      out.push({ lat: a.lat + (b.lat - a.lat) * t, lon: a.lon + (b.lon - a.lon) * t, along: along + seg * t, course })
    }
    along += seg
  }
  const last = line[line.length - 1]
  if (last) out.push({ lon: last[0], lat: last[1], along, course })
  return out
}

/** Samples bucketed on a ~100 m grid, so matching thousands of city signals against a long drive
 *  looks at a handful of nearby samples instead of every one (a low-end laptop stays responsive). */
export class SampleIndex {
  private cells = new Map<string, Sample[]>()
  constructor(samples: Sample[]) {
    for (const s of samples) {
      const k = SampleIndex.key(Math.floor(s.lat / SampleIndex.CELL), Math.floor(s.lon / SampleIndex.CELL))
      const list = this.cells.get(k)
      if (list) list.push(s)
      else this.cells.set(k, [s])
    }
  }
  static readonly CELL = 0.001
  private static key(r: number, c: number) { return r + ',' + c }
  /** Samples within `meters` of a point, in route order. */
  near(p: { lat: number; lon: number }, meters: number): Sample[] {
    const dr = Math.ceil(meters / 111_000 / SampleIndex.CELL)
    const dc = Math.ceil(meters / (111_000 * Math.max(0.2, Math.cos(rad(p.lat)))) / SampleIndex.CELL)
    const r0 = Math.floor(p.lat / SampleIndex.CELL), c0 = Math.floor(p.lon / SampleIndex.CELL)
    const out: Sample[] = []
    for (let r = r0 - dr; r <= r0 + dr; r++) for (let c = c0 - dc; c <= c0 + dc; c++) {
      for (const s of this.cells.get(SampleIndex.key(r, c)) ?? []) if (distanceMeters(s, p) <= meters) out.push(s)
    }
    return out.sort((a, b) => a.along - b.along)
  }
}

/** How close to a block's edge the route may pass before the next block is fetched too: the
 *  longest camera reach plus a margin, so a camera just over the edge is not missed. */
const EDGE_M = 150

/** Block keys the route passes through or near, in route order. */
export function routeBlocks(line: number[][]): string[] {
  const keys: string[] = []
  const add = (k: string) => { if (!keys.includes(k)) keys.push(k) }
  for (const p of sampleRoute(line, 100)) {
    add(blockOf(p.lat, p.lon))
    const dLat = EDGE_M / 111_000, dLon = EDGE_M / (111_000 * Math.max(0.2, Math.cos(rad(p.lat))))
    for (const [a, b] of [[dLat, 0], [-dLat, 0], [0, dLon], [0, -dLon], [dLat, dLon], [dLat, -dLon], [-dLat, dLon], [-dLat, -dLon]]) add(blockOf(p.lat + a, p.lon + b))
  }
  return keys
}

/** Cameras the route drives into: the first point of the route inside each camera's coverage and
 *  heading towards it, as iPhone judges "approaching" (a camera on a cross street 40 m away, or
 *  one already behind you, never sees you). */
export function camerasOnRoute(index: SampleIndex, cameras: RoadCamera[]): OnRoute<RoadCamera>[] {
  const out: OnRoute<RoadCamera>[] = []
  for (const c of cameras) {
    if (!alertsDriver(c.kind)) continue
    const hit = index.near(c, RANGE_M[c.kind]).find((s) => covers(c, s, s.course))
    if (hit) out.push({ item: c, alongMeters: hit.along })
  }
  return out.sort((a, b) => a.alongMeters - b.alongMeters)
}

/** Lights and stop signs on the route itself: a light is on the junction node, a stop sign on the
 *  approach, so both are within a road's width (18 m, as on iPhone). */
export function signalsOnRoute(index: SampleIndex, signals: TrafficSignal[]): TrafficSignal[] {
  return signals.filter((s) => index.near(s, 18).length > 0)
}

/** Traffic webcams within `meters` of the drive. */
export function webcamsNearRoute(index: SampleIndex, cameras: RoadCamera[], meters = 150): RoadCamera[] {
  return cameras.filter((c) => c.kind === 'trafficCamera' && index.near(c, meters).length > 0)
}

/** What the route list says for a camera: "Toll Camera ahead". */
export function warningTitle(c: RoadCamera): string {
  return `${TITLES[c.kind]} ahead`
}

/** The line under it: a toll's name or how it bills, never "hold your speed"; a speed camera's
 *  enforced limit when known. */
export function warningDetail(c: RoadCamera, miles = true): string | undefined {
  if (isToll(c.kind)) return c.name ?? 'Billed by tag or plate'
  if (c.maxSpeedKph === undefined) return undefined
  return miles ? `${Math.round(c.maxSpeedKph * 0.621371)} mph` : `${c.maxSpeedKph} km/h`
}
