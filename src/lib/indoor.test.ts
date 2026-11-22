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

describe('indoor relations', () => {
  const sq = (o: number) => [{ lat: 0, lon: o }, { lat: 0, lon: o + 1 }, { lat: 1, lon: o + 1 }, { lat: 1, lon: o }, { lat: 0, lon: o }]
  const rel = (role: string | undefined) => ({ type: 'relation', id: 1, tags: { building: 'train_station', name: 'Penn Station' }, members: [{ role, geometry: sq(0) }] })
  it('treats a blank member role as outline, like iPhone build 76 (Penn Station)', () => {
    for (const role of ['', undefined, 'outer']) {
      expect(toFeatures([rel(role)] as Parameters<typeof toFeatures>[0]).length, `role ${JSON.stringify(role)}`).toBeGreaterThan(0)
    }
  })
  it('still skips inner members', () => {
    expect(toFeatures([rel('inner')] as Parameters<typeof toFeatures>[0])).toHaveLength(0)
  })
  it('stitches open members into one closed ring, reversing where needed', () => {
    const a = [{ lat: 0, lon: 0 }, { lat: 0, lon: 1 }, { lat: 1, lon: 1 }]
    const b = [{ lat: 0, lon: 0 }, { lat: 1, lon: 0 }, { lat: 1, lon: 1 }] // runs the other way
    const f = toFeatures([{ type: 'relation', id: 2, tags: { aeroway: 'terminal', name: 'T5' }, members: [{ role: 'outer', geometry: a }, { role: '', geometry: b }] }] as Parameters<typeof toFeatures>[0])
    expect(f).toHaveLength(1)
    const ring = (f[0].geometry as GeoJSON.Polygon).coordinates[0]
    expect(ring).toHaveLength(5)
    expect(ring[0]).toEqual(ring[ring.length - 1])
  })
  it('drops an outline left open by a missing member', () => {
    const open = [{ lat: 0, lon: 0 }, { lat: 0, lon: 1 }, { lat: 1, lon: 1 }, { lat: 1, lon: 0 }]
    expect(toFeatures([{ type: 'relation', id: 3, tags: { aeroway: 'terminal' }, members: [{ role: 'outer', geometry: open }] }] as Parameters<typeof toFeatures>[0])).toHaveLength(0)
  })
  it('keeps a closed member separate from an open outline that touches it at one point', () => {
    // A: open path ending at B (1,1); then a closed ring starting and ending at B; then the rest of A.
    const a1 = [{ lat: 0, lon: 0 }, { lat: 0, lon: 1 }, { lat: 1, lon: 1 }]
    const b = [{ lat: 1, lon: 1 }, { lat: 1, lon: 2 }, { lat: 2, lon: 2 }, { lat: 2, lon: 1 }, { lat: 1, lon: 1 }]
    const a2 = [{ lat: 1, lon: 1 }, { lat: 1, lon: 0 }, { lat: 0, lon: 0 }]
    const f = toFeatures([{ type: 'relation', id: 4, tags: { aeroway: 'terminal' }, members: [{ role: 'outer', geometry: a1 }, { role: 'outer', geometry: b }, { role: 'outer', geometry: a2 }] }] as Parameters<typeof toFeatures>[0])
    expect(f).toHaveLength(2)
    for (const x of f) expect((x.geometry as GeoJSON.Polygon).coordinates[0]).toHaveLength(5)
  })
})
