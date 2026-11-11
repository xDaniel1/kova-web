import { expect, it, vi } from 'vitest'
import type { Map as MapboxMap } from 'mapbox-gl'
import { applyMapDetail } from './mapDetail'

it('uses existing sources and requires an explicit unpaved surface tag', () => {
  const layers = new Map<string, { id: string; source: string; minzoom?: number; maxzoom?: number }>(['road-minor', 'road-label', 'settlement-minor-label', 'hillshade'].map(id => [id, { id, source: 'composite' }]))
  const map = { getLayer: (id: string) => layers.get(id), setPaintProperty: vi.fn(), setLayoutProperty: vi.fn(), setLayerZoomRange: vi.fn(), addLayer: vi.fn() }
  applyMapDetail(map as unknown as MapboxMap, false, false)
  const overlay = map.addLayer.mock.calls[0][0]
  expect(overlay.source).toBe('composite')
  expect(overlay.filter).toContainEqual(['==', ['get', 'surface'], 'unpaved'])
  expect(map.setLayerZoomRange).toHaveBeenCalledWith('settlement-minor-label', 2, 17)
  expect(map.setLayoutProperty).toHaveBeenCalledWith('road-label', 'text-allow-overlap', false)
})

it('leaves satellite imagery alone and tolerates absent style layers', () => {
  const map = { getLayer: vi.fn(() => undefined), setPaintProperty: vi.fn(), setLayoutProperty: vi.fn(), setLayerZoomRange: vi.fn(), addLayer: vi.fn() }
  applyMapDetail(map as unknown as MapboxMap, true, false)
  expect(map.getLayer).not.toHaveBeenCalled()
  applyMapDetail(map as unknown as MapboxMap, false, true)
  expect(map.addLayer).not.toHaveBeenCalled()
})


it('also supports the simplified dark-style road layers', () => {
  const map = { getLayer: (id: string) => ['road-simple', 'road-label-simple'].includes(id) ? { id, source: 'composite' } : undefined,
    setPaintProperty: vi.fn(), setLayoutProperty: vi.fn(), setLayerZoomRange: vi.fn(), addLayer: vi.fn() }
  applyMapDetail(map as unknown as MapboxMap, false, true)
  expect(map.setLayoutProperty).toHaveBeenCalledWith('road-label-simple', 'text-allow-overlap', false)
  expect(map.addLayer.mock.calls[0][0].source).toBe('composite')
})
