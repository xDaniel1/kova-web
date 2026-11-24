import { useEffect, useMemo, useState } from 'react'
import type { GeoJSONSource, Map, MapMouseEvent } from 'mapbox-gl'
import type { Route } from '../lib/types'
import {
  SampleIndex, blockOf, camerasOnRoute, loadBlock, loadNYCCameras, nearNYC, routeBlocks, sampleRoute, signalsOnRoute, webcamsNearRoute,
  type OnRoute, type RoadCamera, type TrafficSignal,
} from '../lib/roadCameras'
import { ICON_PIXEL_RATIO, SIGNAL_ICON, cameraIconId, drawCamera, drawStopSign, drawTrafficLight } from '../lib/cameraIcons'
import type { CameraKind } from '../lib/roadCameras'

export interface RouteCameras {
  /** Cameras and tolls the route drives into, in order, with how far along the route. */
  onRoute: OnRoute<RoadCamera>[]
  /** NYC DOT webcams beside the route (drawn, never warned about). */
  webcams: RoadCamera[]
  /** Lights and stop signs on the route. */
  signals: TrafficSignal[]
  /** Whether a lookup is running or ran for the route shown (false: nothing was checked). */
  active: boolean
  /** Blocks still loading. */
  pending: number
  /** Blocks that could not be checked (every map-data server busy). */
  unchecked: number
  /** Metres of the route checked before the block limit, when the route is longer than that. */
  checkedMeters?: number
}

const EMPTY: RouteCameras = { active: false, onRoute: [], webcams: [], signals: [], pending: 0, unchecked: 0 }
/** Blocks the route itself enters (about 250 km); beyond that the list says how far it checked. */
export const MAX_BLOCKS = 40

/** How far along the route stays inside the given blocks from the start. */
function lastAlongIn(samples: { lat: number; lon: number; along: number }[], keys: Set<string>): number {
  let along = 0
  for (const s of samples) {
    if (!keys.has(blockOf(s.lat, s.lon))) break
    along = s.along
  }
  return along
}

/** Cameras, tolls, webcams and signals along a driving route, filled in block by block. */
export function useRouteCameras(route: Route | null, enabled: boolean): RouteCameras {
  const [state, setState] = useState<RouteCameras>(EMPTY)
  const line = enabled && route?.mode === 'driving' ? route.geometry.coordinates : null
  useEffect(() => {
    if (!line || line.length < 2) {
      setState(EMPTY)
      return
    }
    const controller = new AbortController()
    const samples = sampleRoute(line, 10)
    const index = new SampleIndex(samples)
    const { keys: blocks, own, truncated } = routeBlocks(line, MAX_BLOCKS)
    // A route longer than the block limit says how far it was checked instead of looking complete.
    const checkedMeters = truncated ? lastAlongIn(samples, own) : undefined
    let webcams: RoadCamera[] = []
    let onRoute: OnRoute<RoadCamera>[] = []
    let onSignals: TrafficSignal[] = []
    const seenCameras = new Set<string>()
    const seenSignals = new Set<string>()
    let pending = blocks.length
    let unchecked = 0
    let failedInARow = 0
    const publish = () => {
      if (controller.signal.aborted) return
      setState({ active: true, onRoute, webcams: webcamsNearRoute(index, webcams), signals: onSignals, pending, unchecked, checkedMeters })
    }
    setState({ ...EMPTY, active: true, pending, checkedMeters })
    if (samples.some((s) => nearNYC(s.lat, s.lon))) {
      void loadNYCCameras().then((list) => { webcams = list; publish() })
    }
    // One block at a time, in route order: the public Overpass servers are shared and rate-limited,
    // and the start of the drive matters first. Only each new block's items are matched.
    void (async () => {
      for (const key of blocks) {
        if (controller.signal.aborted) return
        // Two blocks in a row with every server down: the servers are out, so stop asking for the
        // rest of the route rather than spend minutes on it. Cached blocks still count.
        const block = failedInARow >= 2 ? await loadBlock(key, { cachedOnly: true }) : await loadBlock(key, { signal: controller.signal })
        if (controller.signal.aborted) return
        pending--
        if (block) {
          failedInARow = 0
          const cams = block.cameras.filter((c) => !seenCameras.has(c.id) && seenCameras.add(c.id))
          const sigs = block.signals.filter((x) => !seenSignals.has(x.id) && seenSignals.add(x.id))
          onRoute = [...onRoute, ...camerasOnRoute(index, cams)].sort((a, b) => a.alongMeters - b.alongMeters)
          onSignals = [...onSignals, ...signalsOnRoute(index, sigs)]
        } else {
          failedInARow++
          unchecked++
        }
        publish()
      }
    })()
    return () => controller.abort()
  }, [line])
  return state
}

const SOURCE = 'kova-road-cameras'
const LAYER = 'kova-road-cameras'

function addIcons(map: Map) {
  const opts = { pixelRatio: ICON_PIXEL_RATIO }
  if (!map.hasImage(SIGNAL_ICON.stop)) map.addImage(SIGNAL_ICON.stop, drawStopSign(), opts)
  if (!map.hasImage(SIGNAL_ICON.light)) map.addImage(SIGNAL_ICON.light, drawTrafficLight(), opts)
}

/** Draws the route's cameras as sign-style tiles, its lights and stop signs, and its webcams. */
export function RoadCamerasLayer({ map, data, onOpenWebcam }: { map: Map; data: RouteCameras; onOpenWebcam: (camera: RoadCamera) => void }) {
  const features = useMemo<GeoJSON.FeatureCollection>(() => {
    const out: GeoJSON.Feature[] = []
    for (const s of data.signals) out.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [s.lon, s.lat] }, properties: { icon: SIGNAL_ICON[s.kind], z: 0 } })
    for (const c of data.webcams) out.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [c.lon, c.lat] }, properties: { icon: cameraIconId('trafficCamera'), z: 1, webcam: c.id } })
    for (const { item: c } of data.onRoute) {
      const limit = c.maxSpeedKph === undefined ? undefined : Math.round(c.maxSpeedKph * 0.621371)
      out.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [c.lon, c.lat] }, properties: { icon: cameraIconId(c.kind, limit), z: 2 } })
    }
    return { type: 'FeatureCollection', features: out }
  }, [data])

  useEffect(() => {
    const ensure = () => {
      if (!map.getStyle()) return
      try { ensureLayer() } catch { /* style still loading: style.load runs this again */ }
    }
    const ensureLayer = () => {
      addIcons(map)
      if (!map.getSource(SOURCE)) {
        map.addSource(SOURCE, { type: 'geojson', data: features })
        map.addLayer({
          id: LAYER, type: 'symbol', source: SOURCE, slot: 'top',
          layout: {
            'icon-image': ['get', 'icon'], 'icon-allow-overlap': true, 'icon-ignore-placement': true,
            'symbol-sort-key': ['get', 'z'], 'icon-anchor': 'bottom',
          },
        } as never)
      } else (map.getSource(SOURCE) as GeoJSONSource).setData(features)
    }
    // Camera tiles with a limit under them are made the first time the map asks for one.
    const missing = (e: { id: string }) => {
      const m = /^kova-cam-([a-zA-Z]+)(?:-(\d+))?$/.exec(e.id)
      if (m && !map.hasImage(e.id)) map.addImage(e.id, drawCamera(m[1] as CameraKind, m[2] === undefined ? undefined : Number(m[2])), { pixelRatio: ICON_PIXEL_RATIO })
    }
    const click = (e: MapMouseEvent) => {
      const f = map.queryRenderedFeatures(e.point, { layers: [LAYER] }).find((x) => x.properties?.webcam)
      const cam = f && data.webcams.find((c) => c.id === f.properties!.webcam)
      if (cam) onOpenWebcam(cam)
    }
    // Only webcams do anything on click, so only they get the pointer.
    const enter = (e: MapMouseEvent) => { map.getCanvas().style.cursor = e.features?.some((x) => x.properties?.webcam) ? 'pointer' : '' }
    const leave = () => { map.getCanvas().style.cursor = '' }
    map.on('styleimagemissing', missing)
    map.on('style.load', ensure)
    map.on('click', LAYER, click)
    map.on('mousemove', LAYER, enter)
    map.on('mouseleave', LAYER, leave)
    ensure()
    return () => {
      map.off('styleimagemissing', missing)
      map.off('style.load', ensure)
      map.off('click', LAYER, click)
      map.off('mousemove', LAYER, enter)
      map.off('mouseleave', LAYER, leave)
    }
  }, [map, features, data.webcams, onOpenWebcam])

  useEffect(() => () => {
    if (!map.getStyle()) return
    if (map.getLayer(LAYER)) map.removeLayer(LAYER)
    if (map.getSource(SOURCE)) map.removeSource(SOURCE)
  }, [map])

  return null
}
