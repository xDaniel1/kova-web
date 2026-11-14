import { useEffect } from 'react'
import type { GeoJSONSource, Map } from 'mapbox-gl'
import { addBelowLabels } from '../lib/mapStyle'
import { BUS_CELL, BUS_MIN_ZOOM, LINE_MIN_ZOOM, MODE_COLOR, RAIL_CELL, STATION_MIN_ZOOM, cellsIn, linesIn, stopsIn, type TransitLine, type TransitStop } from '../lib/transitNetwork'

const LINES = 'kova-transit-lines', STOPS = 'kova-transit-stops'
const LAYERS = ['kova-transit-line-casing', 'kova-transit-line', 'kova-transit-stop', 'kova-transit-stop-label']

/** Rail lines, stations and (at street zoom) bus stops from our own transit tables, as on iPhone. */
export function attachTransit(map: Map) {
  let generation = 0
  const empty: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }
  const ensure = () => {
    if (!map.isStyleLoaded()) return false
    for (const id of [LINES, STOPS]) if (!map.getSource(id)) map.addSource(id, { type: 'geojson', data: empty })
    if (!map.getLayer(LAYERS[0])) {
      addBelowLabels(map, { id: LAYERS[0], type: 'line', source: LINES, minzoom: LINE_MIN_ZOOM, layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': ['interpolate', ['linear'], ['zoom'], 8, 2.5, 14, 6] } }, 'alt-casing')
      addBelowLabels(map, { id: LAYERS[1], type: 'line', source: LINES, minzoom: LINE_MIN_ZOOM, layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': ['interpolate', ['linear'], ['zoom'], 8, 1.2, 14, 3.5] } }, 'alt-casing')
      addBelowLabels(map, { id: LAYERS[2], type: 'circle', source: STOPS, paint: { 'circle-radius': ['case', ['==', ['get', 'mode'], 'bus'], 3.5, 5], 'circle-color': '#ffffff', 'circle-stroke-color': ['get', 'color'], 'circle-stroke-width': ['case', ['==', ['get', 'mode'], 'bus'], 2, 2.5] } }, undefined, 'top')
      addBelowLabels(map, { id: LAYERS[3], type: 'symbol', source: STOPS, filter: ['any', ['!=', ['get', 'mode'], 'bus'], ['>=', ['zoom'], 17]], layout: { 'text-field': ['get', 'name'], 'text-font': ['DIN Pro Medium', 'Arial Unicode MS Regular'], 'text-size': 11.5, 'text-offset': [0, 1.1], 'text-anchor': 'top', 'text-max-width': 9, 'text-optional': true }, paint: { 'text-color': ['get', 'color'], 'text-halo-color': '#ffffff', 'text-halo-width': 1.4 } } as never, undefined, 'top')
    }
    return true
  }
  const refresh = async () => {
    const current = ++generation
    if (!ensure()) { map.once('idle', run); return }
    const z = map.getZoom(), b = map.getBounds()
    if (!b || z < LINE_MIN_ZOOM) { (map.getSource(LINES) as GeoJSONSource).setData(empty); (map.getSource(STOPS) as GeoJSONSource).setData(empty); return }
    const box = { south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() }
    const rail = cellsIn(box, RAIL_CELL, 9)
    try {
      const [lines, stations, buses] = await Promise.all([
        Promise.all(rail.map(linesIn)).then((x) => x.flat()),
        z >= STATION_MIN_ZOOM ? Promise.all(rail.map((c) => stopsIn(c, false))).then((x) => x.flat()) : Promise.resolve([] as TransitStop[]),
        z >= BUS_MIN_ZOOM ? Promise.all(cellsIn(box, BUS_CELL, 16).map((c) => stopsIn(c, true))).then((x) => x.flat()) : Promise.resolve([] as TransitStop[]),
      ])
      if (current !== generation || !ensure()) return
      const unique = <T extends { id: string }>(xs: T[]) => [...new globalThis.Map(xs.map((x) => [x.id, x])).values()]
      ;(map.getSource(LINES) as GeoJSONSource).setData({ type: 'FeatureCollection', features: unique<TransitLine>(lines).map((l) => ({ type: 'Feature', properties: { name: l.name, color: l.color ?? MODE_COLOR[l.mode] ?? MODE_COLOR.rail }, geometry: { type: 'LineString', coordinates: l.path } })) })
      ;(map.getSource(STOPS) as GeoJSONSource).setData({ type: 'FeatureCollection', features: unique<TransitStop>([...stations, ...buses]).map((s) => ({ type: 'Feature', properties: { name: s.name, mode: s.mode, color: MODE_COLOR[s.mode] ?? MODE_COLOR.bus }, geometry: { type: 'Point', coordinates: [s.longitude, s.latitude] } })) })
    } catch { /* offline or switched off; leave what is drawn */ }
  }
  const run = () => { void refresh() }
  map.on('moveend', run)
  map.on('style.load', run)
  run()
  return () => {
    ++generation
    map.off('moveend', run); map.off('style.load', run); map.off('idle', run)
    try { for (const id of LAYERS) if (map.getLayer(id)) map.removeLayer(id); for (const id of [LINES, STOPS]) if (map.getSource(id)) map.removeSource(id) } catch { /* map gone */ }
  }
}

export function TransitLayer({ map, enabled }: { map: Map; enabled: boolean }) {
  useEffect(() => { if (enabled) return attachTransit(map) }, [map, enabled])
  return null
}
