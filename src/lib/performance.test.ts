import { describe, expect, it } from 'vitest'
import { mapBudget } from './performance'

describe('map rendering budget', () => {
  it('uses less cache and shorter effects on modest hardware or data saver', () => {
    for (const hints of [{ cores: 2 }, { memoryGB: 4 }, { saveData: true }]) {
      expect(mapBudget(hints)).toMatchObject({ light: true, maxTileCacheSize: 64, fadeDuration: 0, cameraDuration: 180 })
    }
  })
  it('bounds cache even when hardware hints are unavailable', () => {
    expect(mapBudget({}).maxTileCacheSize).toBe(128)
  })
  it('respects reduced motion regardless of hardware', () => {
    expect(mapBudget({ cores: 8, reducedMotion: true })).toMatchObject({ fadeDuration: 0, cameraDuration: 0 })
  })
})
