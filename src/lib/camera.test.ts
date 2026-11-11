import { describe, expect, it } from 'vitest'
import { parseCamera, US_OVERVIEW } from './camera'

describe('last map area', () => {
  it('accepts western, Alaskan and Hawaiian map positions', () => {
    for (const point of [{ latitude: 64.8, longitude: -147.7, zoom: 12 }, { latitude: 21.3, longitude: -157.8, zoom: 14 }, { latitude: 34, longitude: -118.2, zoom: 10 }]) {
      expect(parseCamera(JSON.stringify(point))).toEqual(point)
    }
  })
  it('rejects corrupt or unsafe saved positions', () => {
    for (const raw of [null, '{', 'null', '{}', '{"latitude":91,"longitude":0,"zoom":10}', '{"latitude":20,"longitude":-155,"zoom":100}', '{"latitude":"21","longitude":-155,"zoom":10}']) expect(parseCamera(raw)).toBeNull()
  })
  it('starts new users at a national overview', () => {
    expect(US_OVERVIEW.zoom).toBeLessThanOrEqual(3)
    expect(US_OVERVIEW.longitude).toBeLessThan(-95)
  })
})
