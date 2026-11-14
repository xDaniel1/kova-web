import type { Map as GLMap, LayerSpecification } from 'mapbox-gl'

// The iPhone app draws Mapbox Standard (see CarPlayMapStyle in the iOS repo): 3D buildings,
// landmarks and trees, gold motorways, day or night light. The web uses the same style so both
// apps look like one product.
export const STANDARD = 'mapbox://styles/mapbox/standard'
export const STANDARD_SATELLITE = 'mapbox://styles/mapbox/standard-satellite'

export function standardConfig(dark: boolean, satellite = false): Record<string, unknown> {
  const shared = { lightPreset: dark ? 'night' : 'day', showPointOfInterestLabels: true, showTransitLabels: true, showPlaceLabels: true, showRoadLabels: true }
  if (satellite) return shared
  return {
    ...shared,
    theme: 'default',
    show3dObjects: true,
    colorMotorways: '#f5c24a',
    colorTrunks: '#fadb8c',
  }
}

/** True when the loaded style imports Mapbox Standard (its layers live inside the import). */
export function isStandard(map: GLMap): boolean {
  try { return (map.getStyle()?.imports?.length ?? 0) > 0 } catch { return false }
}

const STREETS = 'kova-streets'
/**
 * The Mapbox Streets v8 tiles, for our own place and venue labels. Classic styles expose them as
 * the poi-label layer's source; Standard keeps its sources inside the import, so add our own.
 */
export function streetsSource(map: GLMap): string | null {
  const base = map.getLayer('poi-label')
  if (base && 'source' in base) return base.source as string
  if (!isStandard(map)) return null
  if (!map.getSource(STREETS)) map.addSource(STREETS, { type: 'vector', url: 'mapbox://mapbox.mapbox-streets-v8' })
  return STREETS
}

/** Keep the streets tiles loading even when no visible layer uses them (venue place lists read them). */
export function ensureStreetsProbe(map: GLMap): string | null {
  const source = streetsSource(map)
  if (!source || source !== STREETS) return source
  if (!map.getLayer('kova-streets-probe')) {
    map.addLayer({ id: 'kova-streets-probe', type: 'circle', source, 'source-layer': 'poi_label', minzoom: 14, paint: { 'circle-radius': 0, 'circle-opacity': 0 }, slot: 'bottom' } as LayerSpecification)
  }
  return source
}

const CLASSIC_LABELS = ['road-label-simple', 'road-label', 'road-number-shield', 'poi-label']

/**
 * Add a layer above roads but below the map's names: Standard's "middle" slot, or before the
 * first classic label layer. `above` puts it over another of our layers on classic styles.
 */
export function addBelowLabels(map: GLMap, layer: LayerSpecification, above?: string, slot: 'bottom' | 'middle' | 'top' = 'middle') {
  if (isStandard(map)) return map.addLayer({ ...layer, slot } as LayerSpecification)
  const before = above && map.getLayer(above) ? above : CLASSIC_LABELS.find((id) => map.getLayer(id))
  map.addLayer(layer, before)
}

/** Basemap places (shops, stations, landmarks) under a point, on either kind of style. */
export function placesAt(map: GLMap, box: [[number, number], [number, number]]) {
  if (isStandard(map)) {
    try {
      return map.queryRenderedFeatures(box, { target: { featuresetId: 'poi', importId: 'basemap' } } as never)
    } catch { return [] }
  }
  const layers = (map.getStyle().layers ?? []).filter((l) => l.type === 'symbol' && /poi|transit|airport/.test(l.id)).map((l) => l.id)
  return layers.length ? map.queryRenderedFeatures(box, { layers }) : []
}

const MODE_KEY = 'kova.map3d.v1'
export function prefers3D(): boolean { try { return localStorage.getItem(MODE_KEY) === '1' } catch { return false } }
export function setPrefers3D(on: boolean) { try { localStorage.setItem(MODE_KEY, on ? '1' : '0') } catch { /* optional */ } }
