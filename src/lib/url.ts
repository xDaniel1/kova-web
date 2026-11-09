import type { Place, TravelMode } from './types'

// The whole view is encoded in the query string so links open the same place or route.
// Only the root path is used, which GitHub Pages serves without any rewrite rules.
//   /?place=40.748,-73.986&q=Empire%20State%20Building
//   /?from=me&to=40.748,-73.986&via=40.75,-73.99&mode=walking&q=...|...

export type Stop = { kind: 'me' } | { kind: 'place'; place: Place }

export interface ViewState {
  search?: string
  place?: Place
  directions?: { stops: Stop[]; mode: TravelMode }
}

const modes: TravelMode[] = ['driving', 'walking', 'cycling', 'transit']

function coord(p: { latitude: number; longitude: number }): string {
  return `${p.latitude.toFixed(6)},${p.longitude.toFixed(6)}`
}

function parseCoord(s: string | null): { latitude: number; longitude: number } | null {
  if (!s) return null
  const [a, b] = s.split(',').map(Number)
  if (!Number.isFinite(a) || !Number.isFinite(b) || Math.abs(a) > 90 || Math.abs(b) > 180) return null
  return { latitude: a, longitude: b }
}

function stopParam(s: Stop): string {
  return s.kind === 'me' ? 'me' : coord(s.place)
}

function stopLabel(s: Stop): string {
  return s.kind === 'me' ? '' : s.place.title
}

export function encodeView(view: ViewState): string {
  const q = new URLSearchParams()
  if (view.directions) {
    const { stops, mode } = view.directions
    if (stops.length >= 2) {
      q.set('from', stopParam(stops[0]))
      q.set('to', stopParam(stops[stops.length - 1]))
      const via = stops.slice(1, -1).map(stopParam)
      if (via.length) q.set('via', via.join(';'))
      if (mode !== 'driving') q.set('mode', mode)
      const labels = stops.map(stopLabel)
      if (labels.some(Boolean)) q.set('q', labels.join('|'))
    }
  } else if (view.search) {
    q.set('search', view.search)
  } else if (view.place) {
    q.set('place', coord(view.place))
    if (view.place.title) q.set('q', view.place.title)
  }
  const s = q.toString()
  return s ? `?${s}` : ''
}

function toStop(raw: string, label: string | undefined): Stop | null {
  if (raw === 'me') return { kind: 'me' }
  const c = parseCoord(raw)
  if (!c) return null
  return { kind: 'place', place: { ...c, title: label || 'Dropped pin', subtitle: coord(c) } }
}

export function decodeView(search: string): ViewState {
  const q = new URLSearchParams(search)
  const from = q.get('from')
  const to = q.get('to')
  if (from && to) {
    const labels = (q.get('q') ?? '').split('|')
    const raws = [from, ...(q.get('via') ? q.get('via')!.split(';') : []), to]
    const stops = raws.map((r, i) => toStop(r, labels[i]))
    if (stops.every((s): s is Stop => s !== null)) {
      const m = q.get('mode') as TravelMode | null
      return { directions: { stops, mode: m && modes.includes(m) ? m : 'driving' } }
    }
  }
  const query = q.get('search')
  if (query) return { search: query }
  const c = parseCoord(q.get('place'))
  if (c) {
    const title = q.get('q') || 'Dropped pin'
    return { place: { ...c, title, subtitle: coord(c) } }
  }
  return {}
}
