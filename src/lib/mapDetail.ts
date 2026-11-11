import type { Map } from 'mapbox-gl'

/** Reuse the existing vector tiles: no DEM, extra sources, 3-D terrain or continuous work. */
export function applyMapDetail(map: Map, satellite: boolean, dark: boolean) {
  if (satellite) return
  const roadLabel = map.getLayer('road-label') ? 'road-label' : 'road-label-simple'
  const paint = (id: string, key: Parameters<Map['setPaintProperty']>[1], value: Parameters<Map['setPaintProperty']>[2]) => {
    if (map.getLayer(id)) map.setPaintProperty(id, key, value)
  }
  for (const id of ['road-minor', 'road-minor-case']) {
    const layer = map.getLayer(id)
    if (layer) map.setLayerZoomRange(id, 12, layer.maxzoom ?? 24)
  }
  paint('road-street-low', 'line-color', dark ? '#697b83' : '#8a9791')
  paint('road-street-low', 'line-width', ['interpolate', ['linear'], ['zoom'], 10, 0.6, 12, 1, 14, 2])
  paint('road-minor-case', 'line-color', dark ? '#65767b' : '#a6afa3')
  paint('road-minor-case', 'line-width', ['interpolate', ['exponential', 1.5], ['zoom'], 12, 1.4, 14, 1.8, 18, 11, 22, 102])
  paint('road-street-case', 'line-color', dark ? '#536974' : '#b0b9b3')
  paint(roadLabel, 'text-color', dark ? '#e1ecef' : '#294149')
  paint(roadLabel, 'text-halo-color', dark ? '#18252c' : '#fffdf8')
  paint(roadLabel, 'text-halo-width', 1.5)
  if (map.getLayer(roadLabel)) {
    map.setLayoutProperty(roadLabel, 'text-size', ['interpolate', ['linear'], ['zoom'], 10, 11, 13, 12, 16, 14, 18, 16])
    map.setLayoutProperty(roadLabel, 'text-allow-overlap', false)
  }
  for (const id of ['settlement-minor-label', 'settlement-major-label']) {
    const layer = map.getLayer(id)
    if (layer) {
      map.setLayerZoomRange(id, layer.minzoom ?? 2, 17)
      map.setPaintProperty(id, 'text-color', dark ? '#e3efec' : '#243c3d')
      map.setPaintProperty(id, 'text-halo-color', dark ? '#18252c' : '#fffdf8')
      map.setPaintProperty(id, 'text-halo-width', 1.5)
    }
  }
  paint('water', 'fill-color', dark ? '#244954' : '#99cbd2')
  paint('waterway', 'line-color', dark ? '#427c89' : '#62a7b6')
  const hillshade = map.getLayer('hillshade')
  if (hillshade) {
    map.setLayerZoomRange('hillshade', hillshade.minzoom ?? 0, 17)
    paint('hillshade', 'fill-color', ['match', ['get', 'class'], 'shadow', dark ? 'rgba(0,0,0,0.18)' : 'rgba(82,73,48,0.09)', dark ? 'rgba(170,199,192,0.04)' : 'rgba(255,255,255,0.10)'])
  }
  const road = map.getLayer('road-minor') ?? map.getLayer('road-simple')
  // Only an explicit provider surface tag gets this treatment; unknown never means unpaved.
  if (road && 'source' in road && !map.getLayer('kova-unpaved-roads')) {
    map.addLayer({ id: 'kova-unpaved-roads', type: 'line', source: road.source,
      'source-layer': 'road', minzoom: 11,
      filter: ['all', ['==', ['get', 'surface'], 'unpaved'], ['==', ['geometry-type'], 'LineString'], ['match', ['get', 'class'], ['street', 'street_limited', 'track', 'service', 'secondary', 'tertiary'], true, false]],
      paint: { 'line-color': dark ? '#d1ad79' : '#99723d', 'line-width': ['interpolate', ['linear'], ['zoom'], 11, 0.8, 13, 1.5, 16, 3, 19, 5], 'line-dasharray': [2, 2], 'line-opacity': 0.9 },
    }, map.getLayer(roadLabel) ? roadLabel : undefined)
  }
  if (road && 'source' in road && !map.getLayer('kova-local-road-labels')) {
    map.addLayer({ id: 'kova-local-road-labels', type: 'symbol', source: road.source,
      'source-layer': 'road', minzoom: 12, maxzoom: 15,
      filter: ['all', ['match', ['get', 'class'], ['track', 'service'], true, false], ['any', ['has', 'name'], ['has', 'ref']]],
      layout: { 'symbol-placement': 'line', 'symbol-spacing': 350, 'text-field': ['coalesce', ['get', 'name_en'], ['get', 'name'], ['get', 'ref']], 'text-font': ['DIN Pro Regular', 'Arial Unicode MS Regular'], 'text-size': ['interpolate', ['linear'], ['zoom'], 12, 11, 15, 13], 'text-padding': 3, 'text-max-angle': 30, 'text-allow-overlap': false },
      paint: { 'text-color': dark ? '#e1ecef' : '#294149', 'text-halo-color': dark ? '#18252c' : '#fffdf8', 'text-halo-width': 1.5 },
    }, map.getLayer(roadLabel) ? roadLabel : undefined)
  }

}
