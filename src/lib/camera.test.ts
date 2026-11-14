import { describe, expect, it } from 'vitest'
import { parseCamera, FIRST_VISIT } from './camera'

describe('last map area', () => {
  it('accepts western, Alaskan and Hawaiian map positions', () => {
    for (const point of [{ latitude: 64.8, longitude: -147.7, zoom: 12 }, { latitude: 21.3, longitude: -157.8, zoom: 14 }, { latitude: 34, longitude: -118.2, zoom: 10 }]) {
      expect(parseCamera(JSON.stringify(point))).toEqual(point)
    }
  })
  it('rejects corrupt or unsafe saved positions', () => {
    for (const raw of [null, '{', 'null', '{}', '{"latitude":91,"longitude":0,"zoom":10}', '{"latitude":20,"longitude":-155,"zoom":100}', '{"latitude":"21","longitude":-155,"zoom":10}']) expect(parseCamera(raw)).toBeNull()
  })
  it('starts new users on a city they can explore, not the whole world', () => {
    expect(FIRST_VISIT.zoom).toBeGreaterThanOrEqual(11)
    expect(parseCamera(JSON.stringify(FIRST_VISIT))).toEqual(FIRST_VISIT)
  })
})
