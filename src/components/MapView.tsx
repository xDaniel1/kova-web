import maplibregl, { type LngLatLike } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useEffect, useRef } from 'react'
import { config } from '../lib/config'
import type { FavoritePlace, Place, Route } from '../lib/types'

interface Props {
  selected: Place | null
  favorites: FavoritePlace[]
  route: Route | null
  user: { latitude: number; longitude: number } | null
  flyTo: { latitude: number; longitude: number; zoom?: number } | null
  onMapClick: (latitude: number, longitude: number) => void
  onReady?: (map: maplibregl.Map) => void
}

const ROUTE_SOURCE = 'route'

export function MapView({ selected, favorites, route, user, flyTo, onMapClick, onReady }: Props) {
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const selectedMarker = useRef<maplibregl.Marker | null>(null)
  const userMarker = useRef<maplibregl.Marker | null>(null)
  const favoriteMarkers = useRef<maplibregl.Marker[]>([])
  const clickHandler = useRef(onMapClick)
  clickHandler.current = onMapClick

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
    map.on('click', (e) => clickHandler.current(e.lngLat.lat, e.lngLat.lng))
    map.on('load', () => {
      map.addSource(ROUTE_SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
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
      if (!src) return
      src.setData(
        route
          ? { type: 'Feature', properties: {}, geometry: route.geometry }
          : { type: 'FeatureCollection', features: [] },
      )
      if (route) {
        const coords = route.geometry.coordinates as [number, number][]
        const bounds = coords.reduce(
          (b: maplibregl.LngLatBounds, c: [number, number]) => b.extend(c as LngLatLike),
          new maplibregl.LngLatBounds(coords[0], coords[0]),
        )
        map.fitBounds(bounds, { padding: { top: 80, bottom: 80, left: 420, right: 80 }, duration: 600 })
      }
    }
    if (map.isStyleLoaded()) apply()
    else map.once('load', apply)
  }, [route])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !flyTo) return
    map.flyTo({ center: [flyTo.longitude, flyTo.latitude], zoom: flyTo.zoom ?? Math.max(map.getZoom(), 14), duration: 700 })
  }, [flyTo])

  return <div ref={container} className="map" />
}
