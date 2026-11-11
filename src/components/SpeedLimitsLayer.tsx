import { useEffect } from 'react'
import type { Map, GeoJSONSource } from 'mapbox-gl'
import { fetchSpeedSegments } from '../lib/speedLimits'

/** Published road segments only. Does not assign a nearby road's speed to a route. */
export function attachSpeedLimits(map: Map) {
  const source = 'kova-posted-limits'
  const layers = ['kova-posted-limit-lines', 'kova-posted-limit-labels']
  let controller: AbortController | null = null
  let generation = 0
  const clear = () => {
    for (const id of layers) if (map.getLayer(id)) map.removeLayer(id)
    if (map.getSource(source)) map.removeSource(source)
  }
  const refresh = async () => {
    const current = ++generation
    controller?.abort()
    map.off('idle', run)
    if (!map.isStyleLoaded()) { map.once('idle', run); return }
    if (map.getZoom() < 14) { clear(); return }
    const b = map.getBounds()
    if (!b) return
    const bounds = { south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() }
    // Drop the old viewport immediately; slow/failed reads must not leave stale limits on screen.
    clear()
    const request = new AbortController()
    controller = request
    const timer = setTimeout(() => request.abort(), 10000)
    const rows = await fetchSpeedSegments(bounds, request.signal)
    clearTimeout(timer)
    if (current !== generation || request.signal.aborted) return
    if (!map.isStyleLoaded()) { map.once('idle', run); return }
    const data: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: rows.map(row => ({
      type: 'Feature', geometry: { type: 'LineString', coordinates: row.path },
      properties: { mph: row.mph, label: `${row.mph} mph`, road: row.road, source: row.source },
    })) }
    if (map.getSource(source)) (map.getSource(source) as GeoJSONSource).setData(data)
    else {
      map.addSource(source, { type: 'geojson', data })
      map.addLayer({ id: layers[0], type: 'line', source, paint: { 'line-color': '#b14d13', 'line-width': 3, 'line-opacity': 0.7 } })
      map.addLayer({ id: layers[1], type: 'symbol', source, layout: { 'symbol-placement': 'line', 'symbol-spacing': 180, 'text-field': ['get', 'label'], 'text-size': 12, 'text-font': ['DIN Pro Bold', 'Arial Unicode MS Bold'] }, paint: { 'text-color': '#63300f', 'text-halo-color': '#ffffff', 'text-halo-width': 2 } })
    }
  }
  const run = () => { void refresh() }
  map.on('moveend', run)
  map.on('style.load', run)
  run()
  return () => { ++generation; controller?.abort(); map.off('moveend', run); map.off('style.load', run); map.off('idle', run); clear() }
}

export function SpeedLimitsLayer({ map, enabled }: { map: Map; enabled: boolean }) {
  useEffect(() => { if (enabled) return attachSpeedLimits(map) }, [map, enabled])
  return null
}
