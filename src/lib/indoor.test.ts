import { describe, expect, it } from 'vitest'
import { cellOf, levelLabel, parseLevels, toFeatures } from './indoor'

describe('indoor cells and levels', () => {
  it('addresses cells like the iOS app (floor of coordinate / 0.006)', () => {
    expect(cellOf(40.6413, -73.7781)).toEqual({ row: 6773, col: -12297 })
  })
  it('parses single, listed and ranged levels', () => {
    expect(parseLevels('1')).toEqual([1])
    expect(parseLevels('0;2')).toEqual([0, 2])
    expect(parseLevels('-1-1')).toEqual([-1, 0, 1])
    expect(parseLevels(undefined)).toEqual([])
  })
  it('labels floors the way signs do', () => {
    expect(levelLabel(0)).toBe('G')
    expect(levelLabel(-1)).toBe('B1')
    expect(levelLabel(3)).toBe('3')
  })
})

describe('toFeatures', () => {
  it('turns a closed indoor way into a polygon plus a label point', () => {
    const square = [{ lat: 0, lon: 0 }, { lat: 0, lon: 1 }, { lat: 1, lon: 1 }, { lat: 1, lon: 0 }, { lat: 0, lon: 0 }]
    const f = toFeatures([{ type: 'way', id: 1, tags: { indoor: 'room', name: 'Gate A1', level: '2' }, geometry: square }])
    expect(f.map((x) => x.geometry.type)).toEqual(['Polygon', 'Point'])
    expect(f[0].properties?.levels).toEqual([2])
    expect(f[1].properties?.label).toBe(true)
  })
  it('keeps walls as lines and drops untagged ways', () => {
    const line = [{ lat: 0, lon: 0 }, { lat: 0, lon: 1 }]
    const f = toFeatures([
      { type: 'way', id: 1, tags: { indoor: 'wall' }, geometry: line },
      { type: 'way', id: 2, tags: { foo: 'bar' }, geometry: line },
    ])
    expect(f).toHaveLength(1)
    expect(f[0].geometry.type).toBe('LineString')
  })
})
