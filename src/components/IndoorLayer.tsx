import type maplibregl from 'maplibre-gl'
import { useEffect, useState } from 'react'
import { INDOOR_MIN_ZOOM, cellsIn, levelLabel, loadCell } from '../lib/indoor'

interface Props {
  map: maplibregl.Map | null
}

const SRC = 'indoor'
const FILL: Record<string, string> = { room: '#e8e4dc', corridor: '#f7f5f0', area: '#efece5', shop: '#dfe9f7', amenity: '#e3f1e4', footprint: '#d9d4c8' }

/** Draws published indoor plans when zoomed into a venue, with a floor picker. */
export function IndoorLayer({ map }: Props) {
  const [features, setFeatures] = useState<GeoJSON.Feature[]>([])
  const [level, setLevel] = useState(0)

  // Load cells for the viewport when zoomed in far enough.
  useEffect(() => {
    if (!map) return
    let gen = 0
    const refresh = async () => {
      const my = ++gen
      if (map.getZoom() < INDOOR_MIN_ZOOM) {
        setFeatures([])
        return
      }
      const b = map.getBounds()
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
  }, [map])

  const levels = [...new Set(features.flatMap((f) => (f.properties?.levels as number[]) ?? []))].sort((a, b) => b - a)
  const active = levels.includes(level) ? level : levels.includes(0) ? 0 : levels[levels.length - 1] ?? 0

  // Create layers once.
  useEffect(() => {
    if (!map) return
    const setup = () => {
      if (map.getSource(SRC)) return
      map.addSource(SRC, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      const before = map.getLayer('alt-line') ? 'alt-line' : undefined
      map.addLayer({
        id: 'indoor-fill', type: 'fill', source: SRC, filter: ['==', ['geometry-type'], 'Polygon'],
        paint: { 'fill-color': ['match', ['get', 'kind'], ...Object.entries(FILL).flat(), '#eeeeee'] as never, 'fill-opacity': 0.92 },
      }, before)
      map.addLayer({
        id: 'indoor-outline', type: 'line', source: SRC, filter: ['any', ['==', ['geometry-type'], 'Polygon'], ['==', ['get', 'kind'], 'wall']],
        paint: { 'line-color': '#9a9387', 'line-width': ['case', ['==', ['get', 'kind'], 'footprint'], 2, 1] },
      }, before)
      map.addLayer({
        id: 'indoor-stairs', type: 'line', source: SRC, filter: ['==', ['get', 'kind'], 'stairs'],
        paint: { 'line-color': '#7a7468', 'line-width': 3, 'line-dasharray': [0.5, 0.5] },
      }, before)
      map.addLayer({
        id: 'indoor-labels', type: 'symbol', source: SRC, filter: ['==', ['geometry-type'], 'Point'], minzoom: 17,
        layout: {
          'text-field': ['concat', ['coalesce', ['get', 'icon'], ''], ' ', ['get', 'name']],
          'text-size': 11, 'text-font': ['Noto Sans Regular'], 'text-max-width': 8, 'text-allow-overlap': false,
        },
        paint: { 'text-color': '#3a3630', 'text-halo-color': '#ffffff', 'text-halo-width': 1.2 },
      })
    }
    if (map.isStyleLoaded()) setup()
    else map.once('load', setup)
  }, [map])

  // Push the features for the active floor (footprints always shown).
  useEffect(() => {
    if (!map) return
    const src = map.getSource(SRC) as maplibregl.GeoJSONSource | undefined
    if (!src) return
    src.setData({
      type: 'FeatureCollection',
      features: features.filter((f) => {
        const lv = (f.properties?.levels as number[]) ?? []
        return lv.length === 0 ? f.properties?.kind === 'footprint' || levels.length === 0 : lv.includes(active)
      }),
    })
  }, [map, features, active, levels.length])

  if (levels.length < 2) return null
  return (
    <div className="floor-picker panel" role="radiogroup" aria-label="Floor">
      {levels.map((l) => (
        <button key={l} role="radio" aria-checked={l === active} className={l === active ? 'on' : ''} onClick={() => setLevel(l)}>
          {levelLabel(l)}
        </button>
      ))}
    </div>
  )
}
