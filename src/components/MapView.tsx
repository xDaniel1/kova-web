import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { useEffect, useRef, useState } from 'react'
import { browserMapBudget } from '../lib/performance'
import { config } from '../lib/config'
import { REPORT_KINDS, ageLabel, type Bounds, type TrafficReport } from '../lib/reports'
import type { FavoritePlace, Place, Route } from '../lib/types'

mapboxgl.accessToken = config.mapbox.token

export type BaseMap = 'default' | 'satellite'

export interface ResultPin {
  id: string
  place: Place
  label: string
}

interface Props {
  base: BaseMap
  dark: boolean
  traffic: boolean
  selected: Place | null
  results: ResultPin[]
  hoveredResult: string | null
  favorites: FavoritePlace[]
  routes: Route[]
  selectedRoute: number
  stops: Place[]
  user: { latitude: number; longitude: number; accuracy?: number } | null
  reports: TrafficReport[]
  currentUserID: string | null
  flyTo: { latitude: number; longitude: number; zoom?: number } | null
  fitTo: { south: number; west: number; north: number; east: number } | null
  leftInset: number
  onSelectRoute?: (index: number) => void
  onReportDelete?: (id: string) => void
  onReportFlag?: (id: string) => void
  onMoveEnd?: (bounds: Bounds, center: { latitude: number; longitude: number }, zoom: number) => void
  onMapClick: (latitude: number, longitude: number) => void
  onPoiClick: (place: Place) => void
  onResultClick: (id: string) => void
  onReady?: (map: mapboxgl.Map) => void
}

const CONGESTION: Record<string, string> = { low: '#1d6fd1', moderate: '#f29900', heavy: '#d93025', severe: '#8c1d18', unknown: '#1d6fd1' }

/** Kova's place pin: the brand gradient teardrop with a white dot. */
function kovaPin(): HTMLElement {
  const el = document.createElement('div')
  el.className = 'kova-pin'
  el.innerHTML = '<svg viewBox="0 0 32 44" width="32" height="44" aria-hidden="true"><defs><linearGradient id="kp" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2b3fa0"/><stop offset="1" stop-color="#0099a8"/></linearGradient></defs><path d="M16 43c-1-6-14-14-14-27a14 14 0 0 1 28 0c0 13-13 21-14 27z" fill="url(#kp)" stroke="#fff" stroke-width="2"/><circle cx="16" cy="16" r="5.5" fill="#fff"/></svg>'
  return el
}

function routeFeatures(route: Route | null): GeoJSON.FeatureCollection {
  if (!route || route.mode === 'transit') return { type: 'FeatureCollection', features: [] }
  const coords = route.geometry.coordinates
  const cong = route.congestion
  if (!cong || cong.length !== coords.length - 1) {
    return { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { congestion: 'low' }, geometry: route.geometry }] }
  }
  // Merge runs of equal congestion into one line each.
  const features: GeoJSON.Feature[] = []
  let start = 0
  for (let i = 1; i <= cong.length; i++) {
    if (i === cong.length || cong[i] !== cong[start]) {
      features.push({ type: 'Feature', properties: { congestion: cong[start] }, geometry: { type: 'LineString', coordinates: coords.slice(start, i + 1) } })
      start = i
    }
  }
  return { type: 'FeatureCollection', features }
}

function transitFeatures(route: Route | null): GeoJSON.FeatureCollection {
  if (!route || route.mode !== 'transit') return { type: 'FeatureCollection', features: [] }
  return {
    type: 'FeatureCollection',
    features: route.steps
      .filter((s) => s.geometry)
      .map((s) => ({ type: 'Feature' as const, properties: { kind: s.transit ? 'ride' : 'walk', color: s.transit?.color ?? '#1a73e8' }, geometry: s.geometry! })),
  }
}

export function MapView(p: Props) {
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const props = useRef(p)
  props.current = p
  const markers = useRef<{ selected?: mapboxgl.Marker; user?: mapboxgl.Marker; favorites: mapboxgl.Marker[]; stops: mapboxgl.Marker[]; results: Map<string, mapboxgl.Marker>; reports: mapboxgl.Marker[] }>({
    favorites: [], stops: [], results: new Map(), reports: [],
  })
  const fittedRoutes = useRef<Route[] | null>(null)
  // Markers placed before the first load use a provisional transform and land in the wrong spot.
  const [ready, setReady] = useState(false)
  const styleKey = (base: BaseMap, dark: boolean) => (base === 'satellite' ? config.mapbox.styles.satellite : dark ? config.mapbox.styles.dark : config.mapbox.styles.light)

  // Push route + traffic data into the (possibly freshly reloaded) style.
  const syncLayers = () => {
    const map = mapRef.current
    if (!map || !map.getSource('route')) return
    const { routes, selectedRoute, traffic } = props.current
    const route = routes[selectedRoute] ?? null
    ;(map.getSource('route') as mapboxgl.GeoJSONSource | undefined)?.setData(routeFeatures(route))
    ;(map.getSource('transit') as mapboxgl.GeoJSONSource | undefined)?.setData(transitFeatures(route))
    ;(map.getSource('alternatives') as mapboxgl.GeoJSONSource | undefined)?.setData({
      type: 'FeatureCollection',
      features: routes.map((r, index) => ({ type: 'Feature' as const, properties: { index }, geometry: r.geometry })).filter((f) => f.properties.index !== selectedRoute),
    })
    if (map.getLayer('traffic-flow')) map.setLayoutProperty('traffic-flow', 'visibility', traffic ? 'visible' : 'none')
  }

  const addCustomLayers = () => {
    const map = mapRef.current!
    const empty: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }
    // Live traffic, Mapbox's own feed. Drawn under labels.
    // Above every road and bridge, below road names and POI labels.
    const firstSymbol = ['road-label-simple', 'road-label', 'road-number-shield', 'poi-label'].find((id) => map.getLayer(id))
    if (!map.getSource('mapbox-traffic')) {
      map.addSource('mapbox-traffic', { type: 'vector', url: 'mapbox://mapbox.mapbox-traffic-v1' })
      map.addLayer({
        id: 'traffic-flow', type: 'line', source: 'mapbox-traffic', 'source-layer': 'traffic',
        layout: { visibility: 'none', 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1, 16, 3.5],
          'line-color': ['match', ['get', 'congestion'], 'low', '#34a853', 'moderate', '#fbbc04', 'heavy', '#ea4335', 'severe', '#a50e0e', '#34a853'],
          'line-offset': ['interpolate', ['linear'], ['zoom'], 12, 0.5, 16, 2],
        },
      }, firstSymbol)
    }
    for (const id of ['alternatives', 'route', 'transit']) if (!map.getSource(id)) map.addSource(id, { type: 'geojson', data: empty })
    map.addLayer({ id: 'alt-casing', type: 'line', source: 'alternatives', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#5f6368', 'line-width': 9, 'line-opacity': 0.5 } }, firstSymbol)
    map.addLayer({ id: 'alt-line', type: 'line', source: 'alternatives', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#bcc5d3', 'line-width': 6 } }, firstSymbol)
    map.addLayer({ id: 'route-casing', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#0d3f7a', 'line-width': 10 } }, firstSymbol)
    map.addLayer({
      id: 'route-line', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': ['match', ['get', 'congestion'], ...Object.entries(CONGESTION).flat(), '#1d6fd1'] as never, 'line-width': 6.5 },
    }, firstSymbol)
    map.addLayer({ id: 'transit-walk', type: 'line', source: 'transit', filter: ['==', ['get', 'kind'], 'walk'], layout: { 'line-cap': 'round' }, paint: { 'line-color': '#1a73e8', 'line-width': 5, 'line-dasharray': [0.1, 1.8] } }, firstSymbol)
    map.addLayer({ id: 'transit-ride', type: 'line', source: 'transit', filter: ['==', ['get', 'kind'], 'ride'], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': 7 } }, firstSymbol)
    syncLayers()
  }

  useEffect(() => {
    if (!container.current || mapRef.current) return
    const budget = browserMapBudget()
    const map = new mapboxgl.Map({
      container: container.current,
      style: styleKey(p.base, p.dark),
      center: [-73.9857, 40.7484],
      zoom: 13,
      attributionControl: false,
      projection: 'mercator',
      maxTileCacheSize: budget.maxTileCacheSize,
      fadeDuration: budget.fadeDuration,
      antialias: false,
      preserveDrawingBuffer: false,
      respectPrefersReducedMotion: true,
    })
    map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-right')
    map.addControl(new mapboxgl.ScaleControl({ unit: 'imperial', maxWidth: 100 }), 'bottom-right')
    mapRef.current = map
    map.on('style.load', addCustomLayers)
    const emit = () => {
      const b = map.getBounds()!
      const c = map.getCenter()
      props.current.onMoveEnd?.({ south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() }, { latitude: c.lat, longitude: c.lng }, map.getZoom())
    }
    map.on('moveend', emit)
    map.on('load', () => {
      setReady(true)
      emit()
      props.current.onReady?.(map)
    })
    map.on('click', (e) => {
      const alt = map.queryRenderedFeatures(e.point, { layers: ['alt-line'] })
      if (alt.length && props.current.onSelectRoute) return props.current.onSelectRoute(alt[0].properties!.index as number)
      // A named POI on the basemap opens like a search result, as in Google Maps.
      const poiLayers = (map.getStyle().layers ?? []).filter((l) => l.type === 'symbol' && /poi|transit|airport/.test(l.id)).map((l) => l.id)
      const poi = poiLayers.length ? map.queryRenderedFeatures([[e.point.x - 6, e.point.y - 6], [e.point.x + 6, e.point.y + 6]], { layers: poiLayers }).find((f) => f.properties?.name) : undefined
      if (poi && poi.geometry.type === 'Point') {
        const [lng, lat] = poi.geometry.coordinates as [number, number]
        return props.current.onPoiClick({ title: String(poi.properties!.name), subtitle: '', latitude: lat, longitude: lng, kind: poi.properties!.class as string | undefined })
      }
      props.current.onMapClick(e.lngLat.lat, e.lngLat.lng)
    })
    let hoverFrame = 0
    let hoverPoint: mapboxgl.Point | null = null
    const onHover = (e: mapboxgl.MapMouseEvent) => {
      hoverPoint = e.point
      if (hoverFrame) return
      hoverFrame = requestAnimationFrame(() => {
        hoverFrame = 0
        if (!hoverPoint || map.isMoving() || !map.isStyleLoaded()) return
        if (!map.getStyle()) return
        const poiLayers = (map.getStyle().layers ?? []).filter((l) => l.type === 'symbol' && /poi|transit|airport/.test(l.id)).map((l) => l.id)
        const hit = map.queryRenderedFeatures(hoverPoint, { layers: [...poiLayers, ...(map.getLayer('alt-line') ? ['alt-line'] : [])] }).length > 0
        map.getCanvas().style.cursor = hit ? 'pointer' : ''
      })
    }
    map.on('mousemove', onHover)
    return () => {
      cancelAnimationFrame(hoverFrame)
      map.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Base map / dark mode switches reload the style; custom layers come back via style.load.
  const currentStyle = useRef(styleKey(p.base, p.dark))
  useEffect(() => {
    const next = styleKey(p.base, p.dark)
    if (!mapRef.current || next === currentStyle.current) return
    currentStyle.current = next
    const map = mapRef.current
    // Switching style while the first one is still loading crashes Mapbox's image manager
    // (blank map). Wait until the map is idle, then switch; style.load rebuilds our layers.
    const apply = () => {
      if (currentStyle.current === next) map.setStyle(next)
    }
    if (map.loaded()) apply()
    else map.once('idle', apply)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.base, p.dark])

  useEffect(syncLayers, [p.routes, p.selectedRoute, p.traffic]) // eslint-disable-line react-hooks/exhaustive-deps

  // Fit a new set of routes once.
  useEffect(() => {
    const map = mapRef.current
    const route = p.routes[p.selectedRoute]
    if (!map || !route || fittedRoutes.current === p.routes || route.geometry.coordinates.length === 0) return
    fittedRoutes.current = p.routes
    const b = new mapboxgl.LngLatBounds()
    for (const r of p.routes) for (const c of r.geometry.coordinates) b.extend(c as [number, number])
    const narrow = window.innerWidth < 760
    map.fitBounds(b, { padding: narrow ? { top: 70, bottom: window.innerHeight * 0.72, left: 30, right: 30 } : { top: 90, bottom: 100, left: p.leftInset + 60, right: 80 }, duration: browserMapBudget().cameraDuration })
  }, [p.routes, p.selectedRoute, p.leftInset])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !p.fitTo) return
    const narrow = window.innerWidth < 760
    map.fitBounds([[p.fitTo.west, p.fitTo.south], [p.fitTo.east, p.fitTo.north]], { padding: narrow ? { top: 120, bottom: window.innerHeight * 0.6, left: 30, right: 30 } : { top: 90, bottom: 60, left: p.leftInset + 50, right: 60 }, maxZoom: 16, duration: browserMapBudget().cameraDuration })
  }, [p.fitTo]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const map = mapRef.current
    if (!map || !p.flyTo) return
    // Keep the point clear of the side panel.
    // On phones the bottom sheet covers the lower ~58%, so lift the point above it.
    const narrow = window.innerWidth < 760
    map.flyTo({ center: [p.flyTo.longitude, p.flyTo.latitude], zoom: p.flyTo.zoom ?? Math.max(map.getZoom(), 15), offset: narrow ? [0, -window.innerHeight * 0.27] : [p.leftInset / 2, 0], duration: browserMapBudget().cameraDuration })
  }, [p.flyTo]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    markers.current.selected?.remove()
    markers.current.selected = undefined
    if (p.selected) markers.current.selected = new mapboxgl.Marker({ element: kovaPin(), anchor: 'bottom' }).setLngLat([p.selected.longitude, p.selected.latitude]).addTo(map)
  }, [p.selected, ready])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const m = markers.current.results
    for (const [id, mk] of m) if (!p.results.some((r) => r.id === id)) { mk.remove(); m.delete(id) }
    for (const r of p.results) {
      if (m.has(r.id)) continue
      const el = document.createElement('button')
      el.className = 'result-pin'
      el.innerHTML = `<span class="dot"></span><span class="label"></span>`
      el.querySelector('.label')!.textContent = r.label
      el.addEventListener('click', (e) => { e.stopPropagation(); props.current.onResultClick(r.id) })
      m.set(r.id, new mapboxgl.Marker({ element: el, anchor: 'left', offset: [-8, 0] }).setLngLat([r.place.longitude, r.place.latitude]).addTo(map))
    }
  }, [p.results, ready])

  useEffect(() => {
    for (const [id, mk] of markers.current.results) mk.getElement().classList.toggle('hover', id === p.hoveredResult)
  }, [p.hoveredResult, p.results])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    markers.current.favorites.forEach((m) => m.remove())
    markers.current.favorites = p.favorites.map((f) => {
      const el = document.createElement('div')
      el.className = 'fav-marker'
      el.style.background = f.colorHex ?? '#0e809c'
      el.textContent = f.emoji ?? '★'
      el.title = f.customTitle || f.title
      el.addEventListener('click', (e) => { e.stopPropagation(); props.current.onPoiClick({ title: f.customTitle || f.title, subtitle: f.subtitle, latitude: f.latitude, longitude: f.longitude }) })
      return new mapboxgl.Marker({ element: el }).setLngLat([f.longitude, f.latitude]).addTo(map)
    })
  }, [p.favorites, ready])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    markers.current.stops.forEach((m) => m.remove())
    markers.current.stops = p.stops.map((s, i) => {
      const last = i === p.stops.length - 1
      if (last) return new mapboxgl.Marker({ element: kovaPin(), anchor: 'bottom' }).setLngLat([s.longitude, s.latitude]).addTo(map)
      const el = document.createElement('div')
      el.className = 'stop-marker'
      el.textContent = i === 0 ? '' : String.fromCharCode(65 + i)
      return new mapboxgl.Marker({ element: el }).setLngLat([s.longitude, s.latitude]).addTo(map)
    })
  }, [p.stops, ready])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    markers.current.user?.remove()
    markers.current.user = undefined
    if (p.user) {
      const el = document.createElement('div')
      el.className = 'user-dot'
      markers.current.user = new mapboxgl.Marker({ element: el }).setLngLat([p.user.longitude, p.user.latitude]).addTo(map)
    }
  }, [p.user, ready])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    markers.current.reports.forEach((m) => m.remove())
    markers.current.reports = p.reports.map((r) => {
      const meta = REPORT_KINDS.find((k) => k.kind === r.kind) ?? REPORT_KINDS[1]
      const el = document.createElement('div')
      el.className = 'report-marker'
      el.style.background = meta.color
      el.textContent = meta.icon
      const mine = p.currentUserID === r.userID
      const popup = new mapboxgl.Popup({ offset: 16, closeButton: false }).setHTML(
        `<strong>${r.kind}</strong><br><span class="muted">${ageLabel(r.createdAt)}</span><br>` +
          (mine ? `<button class="link" data-act="delete">Remove my report</button>` : `<button class="link" data-act="flag">Flag as wrong</button>`),
      )
      popup.on('open', () => {
        popup.getElement()?.querySelector('[data-act]')?.addEventListener('click', (e) => {
          const act = (e.currentTarget as HTMLElement).dataset.act
          if (act === 'delete') props.current.onReportDelete?.(r.id)
          else props.current.onReportFlag?.(r.id)
          popup.remove()
        })
      })
      return new mapboxgl.Marker({ element: el }).setLngLat([r.longitude, r.latitude]).setPopup(popup).addTo(map)
    })
  }, [p.reports, p.currentUserID, ready])

  return <div ref={container} className="map" />
}
