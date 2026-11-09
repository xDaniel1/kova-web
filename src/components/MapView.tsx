import maplibregl, { type LngLatLike } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useEffect, useRef } from 'react'
import { config } from '../lib/config'
import { REPORT_KINDS, ageLabel, type TrafficReport } from '../lib/reports'
import type { Bounds } from '../lib/reports'
import type { FavoritePlace, Place, Route } from '../lib/types'

interface Props {
  selected: Place | null
  favorites: FavoritePlace[]
  routes: Route[]
  selectedRoute: number
  stops: Place[]
  onSelectRoute?: (index: number) => void
  user: { latitude: number; longitude: number } | null
  reports: TrafficReport[]
  currentUserID: string | null
  onReportDelete?: (id: string) => void
  onReportFlag?: (id: string) => void
  onMoveEnd?: (bounds: Bounds) => void
  flyTo: { latitude: number; longitude: number; zoom?: number } | null
  onMapClick: (latitude: number, longitude: number) => void
  onReady?: (map: maplibregl.Map) => void
}

const ROUTE_SOURCE = 'route'

export function MapView({ selected, favorites, routes, selectedRoute, stops, onSelectRoute, user, reports, currentUserID, onReportDelete, onReportFlag, onMoveEnd, flyTo, onMapClick, onReady }: Props) {
  const route = routes[selectedRoute] ?? null
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const selectedMarker = useRef<maplibregl.Marker | null>(null)
  const fitKey = useRef<Route[] | null>(null)
  const userMarker = useRef<maplibregl.Marker | null>(null)
  const favoriteMarkers = useRef<maplibregl.Marker[]>([])
  const stopMarkers = useRef<maplibregl.Marker[]>([])
  const clickHandler = useRef(onMapClick)
  clickHandler.current = onMapClick
  const selectRoute = useRef(onSelectRoute)
  selectRoute.current = onSelectRoute
  const moveEnd = useRef(onMoveEnd)
  moveEnd.current = onMoveEnd
  const reportMarkers = useRef<maplibregl.Marker[]>([])
  const reportActions = useRef({ onReportDelete, onReportFlag })
  reportActions.current = { onReportDelete, onReportFlag }

  useEffect(() => {
    if (!container.current || mapRef.current) return
    const map = new maplibregl.Map({
      container: container.current,
      style: config.tiles.styleURL,
      center: [-73.9857, 40.7484],
      zoom: 12,
      attributionControl: { compact: true },
    })
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right')
    map.on('click', (e) => {
      const hit = map.queryRenderedFeatures(e.point, { layers: ['alt-line'] })
      if (hit.length && selectRoute.current) {
        selectRoute.current(hit[0].properties.index as number)
        return
      }
      clickHandler.current(e.lngLat.lat, e.lngLat.lng)
    })
    const emitBounds = () => {
      const b = map.getBounds()
      moveEnd.current?.({ south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() })
    }
    map.on('moveend', emitBounds)
    map.on('load', () => {
      emitBounds()
      map.addSource(ROUTE_SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      map.addSource('alternatives', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      map.addLayer({
        id: 'alt-line',
        type: 'line',
        source: 'alternatives',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#8e8e93', 'line-width': 6, 'line-opacity': 0.7 },
      })
      map.on('mouseenter', 'alt-line', () => (map.getCanvas().style.cursor = 'pointer'))
      map.on('mouseleave', 'alt-line', () => (map.getCanvas().style.cursor = ''))
      map.addLayer({
        id: 'route-casing',
        type: 'line',
        source: ROUTE_SOURCE,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#0a5cc2', 'line-width': 10, 'line-opacity': 0.9 },
      })
      map.addLayer({
        id: 'route-line',
        type: 'line',
        source: ROUTE_SOURCE,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#2f8fff', 'line-width': 6 },
      })
      onReady?.(map)
    })
    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    selectedMarker.current?.remove()
    selectedMarker.current = null
    if (selected) {
      selectedMarker.current = new maplibregl.Marker({ color: '#ff3b30' })
        .setLngLat([selected.longitude, selected.latitude])
        .addTo(map)
    }
  }, [selected])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    favoriteMarkers.current.forEach((m) => m.remove())
    favoriteMarkers.current = favorites.map((f) => {
      const el = document.createElement('div')
      el.className = 'fav-marker'
      el.style.background = f.colorHex ?? '#ff9500'
      el.textContent = f.emoji ?? '★'
      el.title = f.customTitle || f.title
      return new maplibregl.Marker({ element: el }).setLngLat([f.longitude, f.latitude]).addTo(map)
    })
  }, [favorites])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    userMarker.current?.remove()
    userMarker.current = null
    if (user) {
      const el = document.createElement('div')
      el.className = 'user-dot'
      userMarker.current = new maplibregl.Marker({ element: el }).setLngLat([user.longitude, user.latitude]).addTo(map)
    }
  }, [user])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const apply = () => {
      const src = map.getSource(ROUTE_SOURCE) as maplibregl.GeoJSONSource | undefined
      const alt = map.getSource('alternatives') as maplibregl.GeoJSONSource | undefined
      if (!src || !alt) return
      src.setData(
        route
          ? { type: 'Feature', properties: {}, geometry: route.geometry }
          : { type: 'FeatureCollection', features: [] },
      )
      alt.setData({
        type: 'FeatureCollection',
        features: routes
          .map((r, index) => ({ type: 'Feature' as const, properties: { index }, geometry: r.geometry }))
          .filter((f) => f.properties.index !== selectedRoute),
      })
      if (route && fitKey.current !== routes) {
        fitKey.current = routes
        const coords = route.geometry.coordinates as [number, number][]
        const bounds = coords.reduce(
          (b: maplibregl.LngLatBounds, c: [number, number]) => b.extend(c as LngLatLike),
          new maplibregl.LngLatBounds(coords[0], coords[0]),
        )
        map.fitBounds(bounds, { padding: window.innerWidth < 640 ? { top: 80, bottom: window.innerHeight * 0.55 + 20, left: 30, right: 30 } : { top: 80, bottom: 80, left: 420, right: 80 }, duration: 600 })
      }
    }
    if (map.isStyleLoaded()) apply()
    else map.once('load', apply)
  }, [routes, selectedRoute, route])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    stopMarkers.current.forEach((m) => m.remove())
    stopMarkers.current = stops.map((p, i) => {
      const el = document.createElement('div')
      el.className = 'stop-marker' + (i === stops.length - 1 ? ' dest' : '')
      el.textContent = i === 0 ? '' : i === stops.length - 1 ? '' : String(i)
      return new maplibregl.Marker({ element: el }).setLngLat([p.longitude, p.latitude]).addTo(map)
    })
  }, [stops])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !flyTo) return
    map.flyTo({ center: [flyTo.longitude, flyTo.latitude], zoom: flyTo.zoom ?? Math.max(map.getZoom(), 14), duration: 700 })
  }, [flyTo])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    reportMarkers.current.forEach((m) => m.remove())
    reportMarkers.current = reports.map((r) => {
      const meta = REPORT_KINDS.find((k) => k.kind === r.kind) ?? REPORT_KINDS[1]
      const el = document.createElement('div')
      el.className = 'report-marker'
      el.style.background = meta.color
      el.textContent = meta.icon
      el.title = `${r.kind} · ${ageLabel(r.createdAt)}`
      const mine = currentUserID === r.userID
      const popup = new maplibregl.Popup({ offset: 16, closeButton: false }).setHTML(
        `<strong>${r.kind}</strong><br><span class="muted">${ageLabel(r.createdAt)}</span><br>` +
          (mine ? `<button class="link" data-act="delete">Remove my report</button>` : `<button class="link" data-act="flag">Flag as wrong</button>`),
      )
      popup.on('open', () => {
        popup.getElement()?.querySelector('[data-act]')?.addEventListener('click', (e) => {
          const act = (e.currentTarget as HTMLElement).dataset.act
          if (act === 'delete') reportActions.current.onReportDelete?.(r.id)
          else reportActions.current.onReportFlag?.(r.id)
          popup.remove()
        })
      })
      return new maplibregl.Marker({ element: el }).setLngLat([r.longitude, r.latitude]).setPopup(popup).addTo(map)
    })
  }, [reports, currentUserID])

  return <div ref={container} className="map" />
}
