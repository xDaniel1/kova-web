import { expect, it, vi } from 'vitest'
import type { Map as MapboxMap } from 'mapbox-gl'
const { fetchSegments } = vi.hoisted(() => ({ fetchSegments: vi.fn().mockResolvedValue([]) }))
vi.mock('./speedLimits', () => ({ fetchSpeedSegments: fetchSegments }))
import { attachSpeedLimits } from '../components/SpeedLimitsLayer'

it('waits for idle when tile/style work is pending, then loads once without a pan', async () => {
  let ready = false
  const listeners = new Map<string, () => void>()
  const map = {
    isStyleLoaded: () => ready,
    getZoom: () => 16,
    getBounds: () => ({ getSouth: () => 28.5, getWest: () => -81.4, getNorth: () => 28.6, getEast: () => -81.3 }),
    getLayer: () => undefined, getSource: () => undefined,
    addSource: vi.fn(), addLayer: vi.fn(),
    on: vi.fn(), off: vi.fn((name: string) => listeners.delete(name)),
    once: vi.fn((name: string, fn: () => void) => listeners.set(name, fn)),
  }
  const stop = attachSpeedLimits(map as unknown as MapboxMap)
  expect(fetchSegments).not.toHaveBeenCalled()
  expect(listeners.has('idle')).toBe(true)
  ready = true
  listeners.get('idle')!()
  await vi.waitFor(() => expect(map.addSource).toHaveBeenCalledTimes(1))
  expect(fetchSegments).toHaveBeenCalledTimes(1)
  // Rendering the resulting source must not cause an endless fetch-on-idle loop.
  expect(listeners.has('idle')).toBe(false)
  stop()
  expect(map.off).toHaveBeenCalledWith('idle', expect.any(Function))
})
