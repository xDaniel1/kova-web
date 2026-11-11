import type { ExpressionSpecification, GeoJSONSource, Map as MapboxMap } from 'mapbox-gl'
import { useEffect, useMemo, useRef, useState } from 'react'
import { INDOOR_MIN_ZOOM, cellsIn, levelLabel, loadCell } from '../lib/indoor'
import {
  DIRECTORY_COLOR, DIRECTORY_ICON, DIRECTORY_ORDER, DIRECTORY_TITLES, INDOOR_SOURCE, INDOOR_TILESET, INDOOR_TILE_MIN_ZOOM,
  directoryCategory, floorsOf, isDirectoryPlace, parseFloor, parseStructure, structureNear, uniqueById, visibleFloorIds,
  type DirectoryCategory, type IndoorFloor, type IndoorStructure,
} from '../lib/mapboxIndoor'
import { airportFromStructureName, browseName, loadVenues, storedVenues, venueAt, type Venue } from '../lib/venues'
import { Icon } from './Icon'

interface Props {
  map: MapboxMap | null
  /** Tower's indoor_maps switch: when off, nothing new is drawn or fetched. */
  enabled: boolean
  dark: boolean
  /** Left edge for the Browse button, clear of the side panel and the Layers tile. */
  left: number
}

// ---- OpenStreetMap plans (stations and malls), published at kovamaps.com/indoor
const OSM_SRC = 'indoor'
const OSM_LAYERS = ['indoor-fill', 'indoor-outline', 'indoor-stairs', 'indoor-poi-labels']
const FILL: Record<string, string> = { room: '#e8e4dc', corridor: '#f7f5f0', area: '#efece5', shop: '#dfe9f7', amenity: '#e3f1e4', footprint: '#d9d4c8' }

// ---- Mapbox airport plans, styled like the iPhone app (Apple's venue colours)
const AIRPORT_LAYERS = ['kova-indoor-structure', 'kova-indoor-floorplan', 'kova-indoor-walls', 'kova-indoor-dots', 'kova-indoor-connectors', 'kova-indoor-poi-names', 'kova-indoor-poi-gates']
const PALETTE = {
  dark: { structure: '#576382', corridor: '#808cab', room: '#616e8c', inaccessible: '#454f69', security: '#736b8c', wall: '#9eabc7', halo: '#262e40' },
  light: { structure: '#ededf2', corridor: '#fefefe', room: '#e3e3eb', inaccessible: '#d4d4db', security: '#f2e3e6', wall: '#b3b3b3', halo: '#ffffff' },
}
const LABEL = {
  dark: { restaurants: '#ffad73', retail: '#ffd666', security: '#ff8c94', other: '#f2f2f2' },
  light: { restaurants: '#c75414', retail: '#946b00', security: '#bf2633', other: '#404040' },
}

const onFloor = (ids: string[]): ExpressionSpecification => ['in', ['get', 'floor_id'], ['literal', ids]]
/** Named places on the chosen floors: not the floor and building captions, corridors or blank rooms. */
const placeFilter = (ids: string[]): ExpressionSpecification => ['all',
  onFloor(ids),
  ['match', ['get', 'shape_type'], ['poi', 'occupant', 'room', 'carousel'], true, false],
  ['match', ['get', 'class'], ['corridor', 'vacant', 'inaccessible', 'pre_security', 'post_security'], false, true],
  ['!=', ['coalesce', ['get', 'name'], ''], ''],
]
const airportFilters = (ids: string[]): Record<string, ExpressionSpecification | undefined> => ({
  'kova-indoor-floorplan': onFloor(ids),
  'kova-indoor-walls': ['all', onFloor(ids), ['!=', ['get', 'shape_type'], 'area']],
  'kova-indoor-dots': ['all', placeFilter(ids), ['!=', ['get', 'class'], 'connector']],
  'kova-indoor-connectors': ['all', placeFilter(ids), ['==', ['get', 'class'], 'connector']],
  'kova-indoor-poi-names': ['all', placeFilter(ids), ['match', ['get', 'type'], ['elevator', 'stairs', 'escalator', 'inaccessible'], false, true]],
  'kova-indoor-poi-gates': ['all', onFloor(ids), ['==', ['get', 'shape_type'], 'gate']],
})

interface DirectoryItem {
  key: string
  name: string
  category: DirectoryCategory
  floorLabel: string
  latitude: number
  longitude: number
  /** Mapbox floor to switch to, for airports. */
  floorId?: string
  /** OpenStreetMap level to switch to, for stations and malls. */
  level?: number
}

const FOOD = new Set(['🍽️', '☕', '🍔', '🍸', '🥤'])

/**
 * Indoor maps, matching the iPhone app: Mapbox's floor plans inside airports, the published
 * OpenStreetMap plans inside stations and malls, a floor picker for the building under the
 * camera, and a Browse button that opens the venue's directory.
 */
export function IndoorLayer({ map, enabled, dark, left }: Props) {
  const [features, setFeatures] = useState<GeoJSON.Feature[]>([])
  const [level, setLevel] = useState(0)
  const [floors, setFloors] = useState<IndoorFloor[]>([])
  const [structures, setStructures] = useState<IndoorStructure[]>([])
  const [center, setCenter] = useState<{ latitude: number; longitude: number } | null>(null)
  /** Chosen floor per building, so panning to the next terminal and back keeps your floor. */
  const [selection, setSelection] = useState<Record<string, string>>({})
  const [venues, setVenues] = useState<Venue[]>(storedVenues)
  const [directory, setDirectory] = useState<DirectoryItem[] | null>(null)
  const [query, setQuery] = useState('')

  const enabledRef = useRef(enabled)
  enabledRef.current = enabled
  const darkRef = useRef(dark)
  darkRef.current = dark

  useEffect(() => { loadVenues().then(setVenues) }, [])

  // ---------- airports: which building is on screen and which floors to draw
  const structure = useMemo(() => (center ? structureNear(center, structures) : null), [center, structures])
  const visible = useMemo(() => visibleFloorIds(floors, structure ? selection[structure.id] : null), [floors, structure, selection])
  const visibleRef = useRef(visible)
  visibleRef.current = visible
  const structureFloors = useMemo(() => (structure ? floorsOf(structure, floors) : []), [structure, floors])
  const airportShowing = enabled && floors.length > 0
  const shownFloor = structureFloors.find((f) => visible.includes(f.id))

  // Read the floors and buildings out of the indoor tiles on screen.
  useEffect(() => {
    if (!map) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const read = () => {
      const c = map.getCenter()
      setCenter((cur) => (cur && cur.latitude === c.lat && cur.longitude === c.lng ? cur : { latitude: c.lat, longitude: c.lng }))
      if (!enabledRef.current || map.getZoom() < INDOOR_TILE_MIN_ZOOM || !map.getSource(INDOOR_SOURCE)) {
        setFloors((cur) => (cur.length ? [] : cur))
        setStructures((cur) => (cur.length ? [] : cur))
        return
      }
      let nextFloors: IndoorFloor[], nextStructures: IndoorStructure[]
      try {
        const names = new Map<string, string>()
        for (const f of map.querySourceFeatures(INDOOR_SOURCE, { sourceLayer: 'indoor_structure' })) {
          const p = f.properties
          if (p && typeof p.id === 'string' && typeof p.name === 'string' && p.name) names.set(p.id, p.name)
        }
        nextFloors = uniqueById(map.querySourceFeatures(INDOOR_SOURCE, { sourceLayer: 'indoor_floor_metadata' }).map((f) => parseFloor(f.properties)).filter((f): f is IndoorFloor => !!f))
        nextStructures = uniqueById(map.querySourceFeatures(INDOOR_SOURCE, { sourceLayer: 'indoor_structure_metadata' }).map((f) => parseStructure(f.properties, names)).filter((s): s is IndoorStructure => !!s))
      } catch {
        return // style mid-reload; the next event reads again
      }
      nextFloors.sort((a, b) => a.id.localeCompare(b.id))
      nextStructures.sort((a, b) => a.id.localeCompare(b.id))
      setFloors((cur) => (JSON.stringify(cur) === JSON.stringify(nextFloors) ? cur : nextFloors))
      setStructures((cur) => (JSON.stringify(cur) === JSON.stringify(nextStructures) ? cur : nextStructures))
    }
    const soon = () => { clearTimeout(timer); timer = setTimeout(read, 120) }
    const onData = (e: { sourceId?: string }) => { if (e.sourceId === INDOOR_SOURCE) soon() }
    map.on('moveend', soon)
    map.on('sourcedata', onData)
    soon()
    return () => {
      clearTimeout(timer)
      map.off('moveend', soon)
      map.off('sourcedata', onData)
    }
  }, [map, enabled])

  // ---------- stations and malls: published OpenStreetMap cells for the viewport
  useEffect(() => {
    if (!map) return
    let gen = 0
    const refresh = async () => {
      const my = ++gen
      if (!enabledRef.current || map.getZoom() < INDOOR_MIN_ZOOM) {
        setFeatures((cur) => (cur.length ? [] : cur))
        return
      }
      const b = map.getBounds()!
      const cells = cellsIn({ south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() })
      const loaded = await Promise.all(cells.map(loadCell))
      if (my !== gen) return
      setFeatures(loaded.flatMap((f) => f ?? []))
    }
    map.on('moveend', refresh)
    refresh()
    return () => {
      map.off('moveend', refresh)
    }
  }, [map, enabled])

  // Airports draw Mapbox's plans; the OpenStreetMap plan stays off them, as on iPhone.
  const venue = useMemo(() => (center ? venueAt(center, venues) : null), [center, venues])
  const osmFeatures = airportShowing || venue?.kind === 'airport' ? [] : features
  const levels = [...new Set(osmFeatures.flatMap((f) => (f.properties?.levels as number[]) ?? []))].sort((a, b) => b - a)
  const active = levels.includes(level) ? level : levels.includes(0) ? 0 : levels[levels.length - 1] ?? 0

  // ---------- layers
  useEffect(() => {
    if (!map) return
    const setup = () => {
      const below = ['road-label-simple', 'road-label', 'road-number-shield', 'poi-label'].find((id) => map.getLayer(id))
      const overlay = map.getLayer('alt-line') ? 'alt-line' : below

      if (!map.getSource(INDOOR_SOURCE)) map.addSource(INDOOR_SOURCE, { type: 'vector', url: INDOOR_TILESET })
      for (const id of AIRPORT_LAYERS) if (map.getLayer(id)) map.removeLayer(id)
      const p = darkRef.current ? PALETTE.dark : PALETTE.light
      const label = darkRef.current ? LABEL.dark : LABEL.light
      const f = airportFilters(visibleRef.current)
      const vis = enabledRef.current ? 'visible' : 'none'
      // The terminal itself, under every floor.
      map.addLayer({ id: 'kova-indoor-structure', type: 'fill', source: INDOOR_SOURCE, 'source-layer': 'indoor_structure', layout: { visibility: vis }, paint: { 'fill-color': p.structure, 'fill-outline-color': p.wall } }, overlay)
      // Concourses, then the rooms along them, then baggage carousels on top.
      map.addLayer({
        id: 'kova-indoor-floorplan', type: 'fill', source: INDOOR_SOURCE, 'source-layer': 'indoor_floorplan', filter: f['kova-indoor-floorplan'],
        layout: { visibility: vis, 'fill-sort-key': ['match', ['get', 'shape_type'], 'area', 0, 'carousel', 2, 1] },
        paint: {
          'fill-color': ['match', ['get', 'class'],
            ['corridor', 'post_security', 'pre_security', 'travel'], p.corridor,
            ['inaccessible', 'parking', 'vacant'], p.inaccessible,
            'security', p.security,
            p.room],
        },
      }, overlay)
      map.addLayer({
        id: 'kova-indoor-walls', type: 'line', source: INDOOR_SOURCE, 'source-layer': 'indoor_floorplan', filter: f['kova-indoor-walls'], layout: { visibility: vis },
        paint: { 'line-color': p.wall, 'line-width': ['interpolate', ['linear'], ['zoom'], 15, 0.4, 19, 1.2] },
      }, overlay)
      // A dot for every named place, coloured by kind; Mapbox hides the names that collide.
      map.addLayer({
        id: 'kova-indoor-dots', type: 'circle', source: INDOOR_SOURCE, 'source-layer': 'indoor_label', filter: f['kova-indoor-dots'], layout: { visibility: vis },
        paint: {
          'circle-color': ['match', ['get', 'class'],
            'restaurants', '#f57a33',
            'retail', '#f2bd29',
            ['connector', 'travel', 'transportation', 'ticketing'], '#3373f2',
            'security', '#e64554',
            'venue_services', ['match', ['get', 'type'], 'restrooms', '#8c5cd9', '#8c8c8c'],
            '#8c8c8c'],
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 15, 3, 18, 5.5],
          'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1.2,
        },
      })
      // Lifts, stairs and escalators only once you are close.
      map.addLayer({
        id: 'kova-indoor-connectors', type: 'circle', source: INDOOR_SOURCE, 'source-layer': 'indoor_label', minzoom: 17.5, filter: f['kova-indoor-connectors'], layout: { visibility: vis },
        paint: { 'circle-color': '#3373f2', 'circle-radius': 3.5, 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1 },
      })
      map.addLayer({
        id: 'kova-indoor-poi-names', type: 'symbol', source: INDOOR_SOURCE, 'source-layer': 'indoor_label', filter: f['kova-indoor-poi-names'],
        layout: {
          visibility: vis,
          'text-field': ['get', 'name'], 'text-font': ['DIN Pro Medium', 'Arial Unicode MS Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 16, 10.5, 19, 13],
          'text-anchor': 'left', 'text-offset': [0.7, 0], 'text-max-width': 7, 'text-justify': 'left', 'text-optional': true,
          'symbol-sort-key': ['match', ['get', 'class'], ['restaurants', 'retail'], 0, ['venue_services', 'travel', 'ticketing'], 1, 2],
        },
        paint: {
          'text-color': ['match', ['get', 'class'], 'restaurants', label.restaurants, 'retail', label.retail, 'security', label.security, label.other],
          'text-halo-color': p.halo, 'text-halo-width': 1.4,
        },
      })
      // Gate tags: black on airport yellow.
      map.addLayer({
        id: 'kova-indoor-poi-gates', type: 'symbol', source: INDOOR_SOURCE, 'source-layer': 'indoor_label', filter: f['kova-indoor-poi-gates'],
        layout: {
          visibility: vis,
          'text-field': ['get', 'name'], 'text-font': ['DIN Pro Bold', 'Arial Unicode MS Bold'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 15, 10, 18, 13], 'text-allow-overlap': false, 'symbol-sort-key': -1,
        },
        paint: { 'text-color': '#000000', 'text-halo-color': '#facc1a', 'text-halo-width': 3 },
      })

      if (map.getSource(OSM_SRC)) return
      map.addSource(OSM_SRC, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      map.addLayer({
        id: 'indoor-fill', type: 'fill', source: OSM_SRC, filter: ['==', ['geometry-type'], 'Polygon'],
        paint: { 'fill-color': ['match', ['get', 'kind'], ...Object.entries(FILL).flat(), '#eeeeee'] as never, 'fill-opacity': 0.92 },
      }, overlay)
      map.addLayer({
        id: 'indoor-outline', type: 'line', source: OSM_SRC, filter: ['any', ['==', ['geometry-type'], 'Polygon'], ['==', ['get', 'kind'], 'wall']],
        paint: { 'line-color': '#9a9387', 'line-width': ['case', ['==', ['get', 'kind'], 'footprint'], 2, 1] },
      }, overlay)
      map.addLayer({
        id: 'indoor-stairs', type: 'line', source: OSM_SRC, filter: ['==', ['get', 'kind'], 'stairs'],
        paint: { 'line-color': '#7a7468', 'line-width': 3, 'line-dasharray': [0.5, 0.5] },
      }, overlay)
      map.addLayer({
        id: 'indoor-poi-labels', type: 'symbol', source: OSM_SRC, filter: ['==', ['geometry-type'], 'Point'], minzoom: 17,
        layout: {
          'text-field': ['concat', ['coalesce', ['get', 'icon'], ''], ' ', ['get', 'name']],
          'text-size': 11, 'text-font': ['DIN Pro Regular', 'Arial Unicode MS Regular'], 'text-max-width': 8, 'text-allow-overlap': false,
        },
        paint: { 'text-color': '#3a3630', 'text-halo-color': '#ffffff', 'text-halo-width': 1.2 },
      })
    }
    const safe = () => { try { setup() } catch { /* style still loading; style.load runs it again */ } }
    safe()
    // Switching base map reloads the style and drops custom layers; put them back.
    map.on('style.load', safe)
    return () => {
      map.off('style.load', safe)
    }
  }, [map])

  // Chosen floors and the Tower switch.
  useEffect(() => {
    if (!map) return
    const apply = () => {
      try {
        const f = airportFilters(visible)
        for (const id of AIRPORT_LAYERS) {
          if (!map.getLayer(id)) continue
          if (f[id]) map.setFilter(id, f[id])
          map.setLayoutProperty(id, 'visibility', enabled ? 'visible' : 'none')
        }
        for (const id of OSM_LAYERS) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', enabled ? 'visible' : 'none')
      } catch { /* style reloading; setup applies the current floors */ }
    }
    apply()
  }, [map, visible, enabled])

  // Push the OpenStreetMap features for the active floor (footprints always shown).
  const osmKey = osmFeatures.length + ':' + active + ':' + levels.length
  useEffect(() => {
    if (!map) return
    const push = () => {
      const src = map.getSource(OSM_SRC) as GeoJSONSource | undefined
      if (!src) return
      src.setData({
        type: 'FeatureCollection',
        features: osmFeatures.filter((f) => {
          const lv = (f.properties?.levels as number[]) ?? []
          return lv.length === 0 ? f.properties?.kind === 'footprint' || levels.length === 0 : lv.includes(active)
        }),
      })
    }
    push()
    map.on('style.load', push)
    return () => {
      map.off('style.load', push)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, osmKey, features])

  // ---------- Browse
  const airportVenue = airportShowing ? (venue?.kind === 'airport' ? venue : structure ? airportFromStructureName(structure.name, structure) : null) ?? venue : null
  const osmHasPlaces = osmFeatures.some((f) => f.properties?.point && f.properties?.name)
  const browse = airportShowing
    ? { title: airportVenue?.name ?? structure?.name ?? 'Airport', short: airportVenue?.shortName ?? (structure?.name ? browseName(structure.name) : 'airport') }
    : venue && osmHasPlaces
      ? { title: venue.name, short: venue.shortName }
      : null

  const openDirectory = () => {
    if (!map) return
    setQuery('')
    if (airportShowing) {
      const byId = new Map(floors.map((f) => [f.id, f]))
      const seen = new Set<string>()
      const items: DirectoryItem[] = []
      for (const f of map.querySourceFeatures(INDOOR_SOURCE, { sourceLayer: 'indoor_label' })) {
        const p = f.properties ?? {}
        if (f.geometry.type !== 'Point' || !isDirectoryPlace(p)) continue
        const name = String(p.name).trim()
        const key = `${name}|${p.floor_id}`
        if (seen.has(key)) continue
        seen.add(key)
        const floor = byId.get(String(p.floor_id))
        const [lng, lat] = f.geometry.coordinates as [number, number]
        items.push({ key, name, category: directoryCategory(p), floorLabel: floor ? `Floor ${floor.name || floor.zIndex}` : '', latitude: lat, longitude: lng, floorId: floor?.id })
      }
      setDirectory(items)
    } else {
      const seen = new Set<string>()
      const items: DirectoryItem[] = []
      for (const f of osmFeatures) {
        const p = f.properties ?? {}
        if (!p.point || !p.name || f.geometry.type !== 'Point') continue
        const lv = (p.levels as number[]) ?? []
        const key = `${p.name}|${lv.join(',')}`
        if (seen.has(key)) continue
        seen.add(key)
        const category: DirectoryCategory = p.kind === 'gate' ? 'gates' : p.kind === 'shop' ? 'shops' : FOOD.has(p.icon as string) ? 'food' : 'services'
        const [lng, lat] = f.geometry.coordinates as [number, number]
        items.push({ key, name: String(p.name), category, floorLabel: lv.length ? 'Floor ' + lv.map(levelLabel).join(', ') : 'Floor not mapped', latitude: lat, longitude: lng, level: lv[0] })
      }
      setDirectory(items)
    }
  }

  const pick = (item: DirectoryItem) => {
    if (!map) return
    const floor = item.floorId ? floors.find((f) => f.id === item.floorId) : undefined
    if (floor) setSelection((cur) => ({ ...cur, ...Object.fromEntries(floor.structureIds.map((id) => [id, floor.id])) }))
    if (item.level !== undefined) setLevel(item.level)
    setDirectory(null)
    map.flyTo({ center: [item.longitude, item.latitude], zoom: Math.max(map.getZoom(), 18), duration: 700 })
  }

  // Leaving the venue closes its directory.
  useEffect(() => { if (!browse) setDirectory(null) }, [browse === null]) // eslint-disable-line react-hooks/exhaustive-deps

  const grouped = useMemo(() => {
    if (!directory) return []
    const q = query.trim().toLowerCase()
    const matching = directory.filter((i) => !q || i.name.toLowerCase().includes(q))
    return DIRECTORY_ORDER.map((c) => [c, matching.filter((i) => i.category === c).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))] as const).filter(([, items]) => items.length)
  }, [directory, query])

  // ---------- floor picker: the airport building under the camera, or the OSM levels
  const airportButtons = (() => {
    const seen = new Set<string>()
    return [...structureFloors].reverse().filter((f) => {
      const label = f.name.trim() || String(f.zIndex)
      return !seen.has(label) && seen.add(label)
    })
  })()

  if (!enabled) return null
  return (
    <>
      {airportShowing && airportButtons.length >= 2 && structure && (
        <div className="floor-picker panel" role="radiogroup" aria-label={`Floor, ${structure.name || 'this building'}`}>
          {airportButtons.map((f) => (
            <button key={f.id} role="radio" aria-checked={f.id === shownFloor?.id} className={f.id === shownFloor?.id ? 'on' : ''} title={f.description || undefined} aria-label={`Floor ${f.name.trim() || f.zIndex}${f.description ? ', ' + f.description : ''}`} onClick={() => setSelection((cur) => ({ ...cur, [structure.id]: f.id }))}>
              {f.name.trim() || f.zIndex}
            </button>
          ))}
        </div>
      )}
      {!airportShowing && levels.length >= 2 && (
        <div className="floor-picker panel" role="radiogroup" aria-label="Floor">
          {levels.map((l) => (
            <button key={l} role="radio" aria-checked={l === active} className={l === active ? 'on' : ''} aria-label={`Floor ${levelLabel(l)}`} onClick={() => setLevel(l)}>
              {levelLabel(l)}
            </button>
          ))}
        </div>
      )}
      {browse && !directory && (
        <button className="indoor-browse" style={{ left }} onClick={openDirectory}>
          Browse {browse.short}
        </button>
      )}
      {browse && directory && (
        <section className="indoor-directory" style={{ left }} aria-label={`${browse.title} directory`}>
          <header>
            <div>
              <h2>{browse.title}</h2>
              {airportShowing && structure?.name && shownFloor && <p>{structure.name} · Floor {shownFloor.name.trim() || shownFloor.zIndex}{shownFloor.description ? ` · ${shownFloor.description}` : ''}</p>}
            </div>
            <button className="icon-btn" onClick={() => setDirectory(null)} aria-label="Close directory"><Icon name="close" /></button>
          </header>
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Search ${browse.short}`} aria-label={`Search ${browse.short}`} />
          <div className="indoor-directory-list">
            {grouped.length === 0 && <p className="empty">{directory.length ? 'Nothing matches.' : 'No places are mapped on screen yet. Zoom in or move over a terminal.'}</p>}
            {grouped.map(([category, items]) => (
              <div key={category}>
                <h3>{DIRECTORY_TITLES[category]}</h3>
                <ul>
                  {items.map((i) => (
                    <li key={i.key}>
                      <button onClick={() => pick(i)}>
                        <span className="dot" style={{ background: DIRECTORY_COLOR[category] }}><Icon name={DIRECTORY_ICON[category]} size={16} /></span>
                        <span className="name">{i.name}</span>
                        <span className="floor">{i.floorLabel}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <footer>{airportShowing ? 'Floor plans © Mapbox.' : 'Floor plans © OpenStreetMap contributors.'}</footer>
        </section>
      )}
    </>
  )
}
