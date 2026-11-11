// The venues Kova maps inside: the list bundled with the app plus the `venues` table in Kova
// Tower's Supabase project. Mirrors KnownVenue.swift and VenueDirectory.swift in the iPhone app,
// so a venue added in the dashboard reaches the web without a deploy.
import { config } from './config'
import { metresBetween } from './mapboxIndoor'

export type VenueKind = 'airport' | 'station' | 'mall' | 'other'

export interface Venue {
  name: string
  /** What the button says: "Browse JFK". */
  shortName: string
  latitude: number
  longitude: number
  /** How far from the centre still counts as inside, in metres. */
  radius: number
  kind: VenueKind
}

const v = (name: string, shortName: string, latitude: number, longitude: number, radius: number, kind: VenueKind): Venue => ({ name, shortName, latitude, longitude, radius, kind })

export const BUNDLED_VENUES: Venue[] = [
  v('John F. Kennedy International Airport', 'JFK', 40.644, -73.783, 1500, 'airport'),
  v('LaGuardia Airport', 'LGA', 40.774, -73.872, 1300, 'airport'),
  v('Newark Liberty International Airport', 'EWR', 40.69, -74.179, 1300, 'airport'),
  v('Orlando International Airport', 'MCO', 28.4265, -81.3085, 2000, 'airport'),
  v('Grand Central Terminal', 'Grand Central', 40.7527, -73.9772, 230, 'station'),
  v('Penn Station', 'Penn Station', 40.7506, -73.9935, 220, 'station'),
  v('Moynihan Train Hall', 'Moynihan', 40.7518, -73.9966, 120, 'station'),
  v('Westfield World Trade Center', 'Westfield WTC', 40.7116, -74.011, 170, 'mall'),
  v('Brookfield Place', 'Brookfield Pl', 40.7128, -74.0155, 200, 'mall'),
  v('Fulton Center', 'Fulton Center', 40.7104, -74.0089, 90, 'station'),
  v('The Shops at Hudson Yards', 'Hudson Yards', 40.7538, -74.0021, 140, 'mall'),
  v('Port Authority Bus Terminal', 'Port Authority', 40.757, -73.9912, 160, 'station'),
  v('The Shops at Columbus Circle', 'Columbus Circle', 40.7684, -73.9827, 110, 'mall'),
  v("Macy's Herald Square", "Macy's", 40.7508, -73.9895, 110, 'mall'),
  v('Atlantic Terminal', 'Atlantic Terminal', 40.6843, -73.9772, 150, 'station'),
  v('Jamaica Station', 'Jamaica', 40.6999, -73.808, 160, 'station'),
  v('Newport Centre', 'Newport Centre', 40.727, -74.0355, 180, 'mall'),
  v('Roosevelt Field', 'Roosevelt Field', 40.7395, -73.613, 320, 'mall'),
  v('Staten Island Mall', 'SI Mall', 40.581, -74.166, 320, 'mall'),
]

/** The venue under a point, preferring the smallest one when they nest or overlap. */
export function venueAt(point: { latitude: number; longitude: number }, venues: Venue[]): Venue | null {
  return venues
    .filter((x) => metresBetween(point, x) <= x.radius)
    .reduce<Venue | null>((best, x) => (!best || x.radius < best.radius ? x : best), null)
}

/**
 * An airport the map itself has found: Mapbox names its buildings "MCO Terminal C",
 * "ATL Concourse D", so the airport code is the first word. Used where the directory has no
 * entry, so every airport Mapbox maps inside gets a Browse button.
 */
export function airportFromStructureName(name: string, center: { latitude: number; longitude: number }): Venue | null {
  const code = name.trim().split(/\s+/)[0] ?? ''
  if (!/^[A-Z]{3}$/.test(code)) return null
  return { name: `${code} Airport`, shortName: code, latitude: center.latitude, longitude: center.longitude, radius: 2500, kind: 'airport' }
}

/** "John F. Kennedy International Airport Terminal 4" reads as "Terminal 4". */
export function browseName(name: string): string {
  for (const sep of [' - ', ' – ', ' — ']) {
    if (name.includes(sep)) {
      const tail = name.split(sep).pop()!.trim()
      if (tail) return tail
    }
  }
  const i = name.lastIndexOf('Terminal ')
  if (i >= 0) return name.slice(i)
  return name.length > 24 ? name.slice(0, 22) + '…' : name
}

interface Row { short_name?: unknown; name?: unknown; latitude?: unknown; longitude?: unknown; radius_m?: unknown; kind?: unknown }

export function parseVenueRows(rows: unknown): Venue[] {
  if (!Array.isArray(rows)) return []
  const out: Venue[] = []
  for (const r of rows as Row[]) {
    const lat = Number(r?.latitude), lon = Number(r?.longitude), radius = Number(r?.radius_m)
    if (typeof r?.short_name !== 'string' || typeof r?.name !== 'string') continue
    if (!(lat >= -90 && lat <= 90) || !(lon >= -180 && lon <= 180) || !(radius > 0)) continue
    const kind = ['airport', 'station', 'mall'].includes(String(r.kind)) ? (r.kind as VenueKind) : 'other'
    out.push({ name: r.name, shortName: r.short_name, latitude: lat, longitude: lon, radius, kind })
  }
  return out
}

/** Remote rows win over bundled ones with the same short name; the rest of the bundle stays. */
export function mergeVenues(remote: Venue[]): Venue[] {
  const by = new Map(BUNDLED_VENUES.map((x) => [x.shortName, x]))
  for (const x of remote) by.set(x.shortName, x)
  return [...by.values()]
}

const STORE = 'kova.venues.v1'
let loading: Promise<Venue[]> | null = null

/** The last downloaded list straight away (or the bundle), for use before the fetch returns. */
export function storedVenues(): Venue[] {
  try {
    const raw = localStorage.getItem(STORE)
    if (raw) return mergeVenues(parseVenueRows(JSON.parse(raw)))
  } catch { /* private mode or bad data: the bundle is enough */ }
  return BUNDLED_VENUES
}

/** Fetches the table once per page load. Any failure leaves the stored or bundled list in place. */
export function loadVenues(): Promise<Venue[]> {
  loading ??= (async () => {
    try {
      const res = await fetch(`${config.supabase.url}/rest/v1/venues?select=short_name,name,latitude,longitude,radius_m,kind&enabled=eq.true`, {
        headers: { apikey: config.supabase.anonKey, Authorization: `Bearer ${config.supabase.anonKey}` },
      })
      if (!res.ok) return storedVenues()
      const rows = await res.json()
      const remote = parseVenueRows(rows)
      if (!remote.length) return storedVenues()
      try { localStorage.setItem(STORE, JSON.stringify(rows)) } catch { /* ignore */ }
      return mergeVenues(remote)
    } catch {
      return storedVenues()
    }
  })()
  return loading
}
