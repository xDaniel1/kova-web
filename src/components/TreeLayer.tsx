import { useEffect } from 'react'
import type { GeoJSONSource, LayerSpecification, Map } from 'mapbox-gl'
import { isStandard } from '../lib/mapStyle'
import { KIND, MIN_ZOOM, REPLANT_METRES, inTreeRegion, loadGrounds, metres, plant, shapes, tileBlock } from '../lib/trees'

const SOURCE = 'kova-trees', LAYER = 'kova-trees-blocks'
// MapboxTreeLayers.swift colours.
const CROWN = 'rgb(102,163,89)', CROWN_DARK = 'rgb(79,140,77)', CROWN_LIGHT = 'rgb(128,179,102)', TRUNK = 'rgb(120,94,69)'

/** The iPhone's trees around the middle of the map, from zoom 15, replanted as the map moves. */
export function attachTrees(map: Map) {
  let planted: { latitude: number; longitude: number } | null = null
  let generation = 0
  const empty: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }
  const ensure = () => {
    if (!map.isStyleLoaded()) return false
    if (!map.getSource(SOURCE)) map.addSource(SOURCE, { type: 'geojson', data: empty, maxzoom: 16, tolerance: 0 })
    if (!map.getLayer(LAYER)) {
      map.addLayer({
        id: LAYER, type: 'fill-extrusion', source: SOURCE, minzoom: MIN_ZOOM,
        ...(isStandard(map) ? { slot: 'middle' } : {}),
        paint: {
          'fill-extrusion-base': ['get', 'b'], 'fill-extrusion-height': ['get', 'h'],
          'fill-extrusion-color': ['match', ['get', 'k'], KIND.trunk, TRUNK, KIND.crownDark, CROWN_DARK, KIND.crownLight, CROWN_LIGHT, CROWN],
          'fill-extrusion-opacity': ['interpolate', ['linear'], ['zoom'], MIN_ZOOM, 0, MIN_ZOOM + 0.4, 1],
          'fill-extrusion-vertical-gradient': true,
          'fill-extrusion-ambient-occlusion-intensity': 0.35,
        },
      } as LayerSpecification)
    }
    return true
  }
  const refresh = async () => {
    if (!ensure()) { map.once('idle', run); return }
    const c = map.getCenter()
    const centre = { latitude: c.lat, longitude: c.lng }
    if (map.getZoom() < MIN_ZOOM - 0.5 || !inTreeRegion(centre.latitude, centre.longitude)) {
      planted = null
      ;(map.getSource(SOURCE) as GeoJSONSource).setData(empty)
      return
    }
    if (planted && metres(planted, centre) < REPLANT_METRES) return
    const current = ++generation
    try {
      const tiles = await loadGrounds(tileBlock(centre.latitude, centre.longitude))
      if (current !== generation || !ensure()) return
      planted = centre
      const trees = plant(tiles, centre)
      map.getContainer().dataset.trees = String(trees.length)
      ;(map.getSource(SOURCE) as GeoJSONSource).setData(shapes(trees))
    } catch (e) { map.getContainer().dataset.treesError = String(e).slice(0, 120) /* offline: try again on the next move */ }
  }
  const run = () => { void refresh() }
  const restyle = () => { planted = null; run() }
  map.on('moveend', run)
  map.on('style.load', restyle)
  run()
  return () => {
    ++generation
    map.off('moveend', run); map.off('style.load', restyle); map.off('idle', run)
    try { if (map.getLayer(LAYER)) map.removeLayer(LAYER); if (map.getSource(SOURCE)) map.removeSource(SOURCE) } catch { /* map gone */ }
  }
}

export function TreeLayer({ map, enabled }: { map: Map; enabled: boolean }) {
  useEffect(() => { if (enabled) return attachTrees(map) }, [map, enabled])
  return null
}
