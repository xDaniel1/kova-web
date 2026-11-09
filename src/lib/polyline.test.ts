import { describe, expect, it } from 'vitest'
import { decodePolyline } from './polyline'

describe('decodePolyline', () => {
  it('decodes the example from Google\'s documentation', () => {
    const pts = decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@')
    expect(pts).toHaveLength(3)
    expect(pts[0][1]).toBeCloseTo(38.5, 5)
    expect(pts[0][0]).toBeCloseTo(-120.2, 5)
    expect(pts[2][1]).toBeCloseTo(43.252, 5)
    expect(pts[2][0]).toBeCloseTo(-126.453, 5)
  })
  it('returns nothing for an empty string', () => {
    expect(decodePolyline('')).toEqual([])
  })
})
