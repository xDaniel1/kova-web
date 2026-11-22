import { describe, expect, it } from 'vitest'
import { cellOf, hasArea, levelLabel, loopsOf, mergeCells, outlinesOf, parseLevels, toFeatures } from './indoor'

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
  it('splits two multi-way rings that touch at a shared point', () => {
    // Ring A: (0,0)→(0,1)→(1,1)→(1,0)→(0,0); ring B: (1,1)→(1,2)→(2,2)→(2,1)→(1,1). Each in two ways,
    // ordered so the stitcher walks from A into B at (1,1) before A is closed.
    const m = (g: [number, number][]) => ({ role: 'outer', geometry: g.map(([lat, lon]) => ({ lat, lon })) })
    const members = [m([[0, 0], [0, 1], [1, 1]]), m([[1, 1], [1, 2], [2, 2]]), m([[2, 2], [2, 1], [1, 1]]), m([[1, 1], [1, 0], [0, 0]])]
    const f = toFeatures([{ type: 'relation', id: 5, tags: { aeroway: 'terminal' }, members }] as Parameters<typeof toFeatures>[0])
    expect(f).toHaveLength(2)
    for (const x of f) {
      const r = (x.geometry as GeoJSON.Polygon).coordinates[0]
      expect(r).toHaveLength(5)
      expect(new Set(r.slice(0, -1).map(String)).size).toBe(4)
    }
  })
  it('keeps a closed ring that a dangling way runs into', () => {
    const m = (g: [number, number][]) => ({ role: 'outer', geometry: g.map(([lat, lon]) => ({ lat, lon })) })
    // A dangling way ends at (1,1), then the ring (1,1)→(1,2)→(2,2)→(2,1)→(1,1) in two ways.
    const members = [m([[5, 5], [1, 1]]), m([[1, 1], [1, 2], [2, 2]]), m([[2, 2], [2, 1], [1, 1]])]
    expect(toFeatures([{ type: 'relation', id: 6, tags: { aeroway: 'terminal' }, members }] as Parameters<typeof toFeatures>[0])).toHaveLength(1)
  })
  it('finds every loop in a chain', () => {
    const p = (lat: number, lon: number) => ({ lat, lon })
    expect(loopsOf([p(0, 0), p(0, 1), p(1, 1), p(0, 0)])).toHaveLength(1)
    expect(loopsOf([p(0, 0), p(0, 1), p(1, 1)])).toHaveLength(0)
    expect(loopsOf([p(9, 9), p(0, 0), p(0, 1), p(1, 1), p(0, 0), p(8, 8)])).toHaveLength(1)
  })
  it('keeps a ring when spurs sit between its ways', () => {
    const m = (g: [number, number][]) => ({ role: 'outer', geometry: g.map(([lat, lon]) => ({ lat, lon })) })
    // A=(0,0), B=(1,1). One side A→B, a spur from B, a spur from A, then the other side B→A.
    const members = [m([[0, 0], [0, 1], [1, 1]]), m([[1, 1], [3, 3]]), m([[0, 0], [-3, -3]]), m([[1, 1], [1, 0], [0, 0]])]
    const f = toFeatures([{ type: 'relation', id: 7, tags: { aeroway: 'terminal' }, members }] as Parameters<typeof toFeatures>[0])
    expect(f).toHaveLength(1)
    expect((f[0].geometry as GeoJSON.Polygon).coordinates[0]).toHaveLength(5)
  })
  it('drops rings with no area', () => {
    const m = (g: [number, number][]) => ({ role: 'outer', geometry: g.map(([lat, lon]) => ({ lat, lon })) })
    const rel = (g: [number, number][]) => toFeatures([{ type: 'relation', id: 8, tags: { aeroway: 'terminal' }, members: [m(g)] }] as Parameters<typeof toFeatures>[0])
    expect(rel([[0, 0], [1, 1], [1, 1], [0, 0]])).toHaveLength(0) // two distinct points
    expect(rel([[0, 0], [1, 1], [2, 2], [0, 0]])).toHaveLength(0) // collinear
    expect(rel([[0, 0], [0, 1], [1, 1], [0, 0]])).toHaveLength(1)
  })
  it('keeps a square joined to two other rings by stray ways, whatever the member order', () => {
    const m = (g: [number, number][]) => ({ role: 'outer', geometry: g.map(([lat, lon]) => ({ lat, lon })) })
    const members = [
      m([[0, 0], [0, 1]]), // one side of the square
      m([[0, 0], [-5, -5]]), m([[1, 1], [6, 6]]), // connectors to the two rings
      m([[-5, -5], [-5, -6], [-6, -6], [-5, -5]]), m([[6, 6], [6, 7], [7, 7], [6, 6]]),
      m([[0, 1], [1, 1]]), m([[1, 1], [1, 0]]), m([[1, 0], [0, 0]]),
    ]
    const f = toFeatures([{ type: 'relation', id: 9, tags: { aeroway: 'terminal' }, members }] as Parameters<typeof toFeatures>[0])
    expect(f).toHaveLength(3)
  })
  it('finds a loop inside one way with loose ends', () => {
    const m = (g: [number, number][]) => ({ role: 'outer', geometry: g.map(([lat, lon]) => ({ lat, lon })) })
    const members = [m([[9, 9], [0, 0], [0, 1], [1, 1], [1, 0], [0, 0], [8, 8]])]
    expect(toFeatures([{ type: 'relation', id: 10, tags: { aeroway: 'terminal' }, members }] as Parameters<typeof toFeatures>[0])).toHaveLength(1)
  })
  it('sees collinear points at real coordinates as no area', () => {
    const p = (lat: number, lon: number) => ({ lat, lon })
    expect(hasArea([p(40, -74), p(40.001, -73.999), p(40.002, -73.998), p(40, -74)])).toBe(false)
    expect(hasArea([p(40, -74), p(40, -73.9999), p(40.0001, -73.9999), p(40, -74)])).toBe(true) // ~10 m square half
  })
  const pt = (lat: number, lon: number) => ({ lat, lon })
  const square = [pt(0, 0), pt(0, 1), pt(1, 1), pt(1, 0), pt(0, 0)]
  it('draws the whole square when a diagonal crosses it, in either member order', () => {
    const diagonal = [pt(0, 0), pt(1, 1)]
    for (const ways of [[diagonal, square], [square, diagonal]]) {
      const rings = outlinesOf(ways)
      expect(rings).toHaveLength(1)
      expect(new Set(rings[0].slice(0, -1).map((p) => `${p.lat},${p.lon}`)).size).toBe(4)
    }
  })
  it('splits rings touching at a point in any member order', () => {
    const b = [pt(1, 1), pt(1, 2), pt(2, 2), pt(2, 1), pt(1, 1)]
    for (const ways of [[square, b], [b, square]]) expect(outlinesOf(ways)).toHaveLength(2)
  })
  it('handles many rings touching one point quickly', () => {
    const ways = Array.from({ length: 2000 }, (_, i) => {
      const a = (i / 2000) * 2 * Math.PI, c = Math.cos(a), s = Math.sin(a)
      return [pt(0, 0), pt(s * 1, c * 1), pt(Math.sin(a + 0.001) * 1, Math.cos(a + 0.001) * 1), pt(0, 0)]
    })
    const started = performance.now()
    expect(outlinesOf(ways)).toHaveLength(2000)
    expect(performance.now() - started).toBeLessThan(1000)
  })
  it('survives points Overpass could not place, keeping the rest of the cell', () => {
    const els = [
      { type: 'relation', id: 11, tags: { aeroway: 'terminal' }, members: [{ role: 'outer', geometry: [pt(0, 0), null, pt(1, 1)] }] },
      { type: 'way', id: 12, tags: { indoor: 'room' }, geometry: [pt(0, 0), null, pt(1, 1), pt(0, 0)] },
      { type: 'node', id: 13, lat: null, lon: null, tags: { shop: 'yes' } },
      { type: 'way', id: 14, tags: { indoor: 'room', level: '0' }, geometry: square },
    ] as unknown as Parameters<typeof toFeatures>[0]
    const f = toFeatures(els)
    expect(f.filter((x) => x.geometry.type === 'Polygon')).toHaveLength(1)
  })
  const perms = <T,>(xs: T[]): T[][] => xs.length <= 1 ? [xs] : xs.flatMap((x, i) => perms([...xs.slice(0, i), ...xs.slice(i + 1)]).map((r) => [x, ...r]))
  it('draws the full outline for every order of a square split by a crossing way', () => {
    // Left side (0,0)→(0,1)… as three ways plus the way across the middle, also reversed.
    const left = [pt(0, 0.5), pt(0, 0), pt(1, 0), pt(1, 0.5)]
    const right = [pt(1, 0.5), pt(1, 1), pt(0, 1), pt(0, 0.5)]
    const across = [pt(0, 0.5), pt(1, 0.5)]
    for (const ways of perms([left, right, across])) {
      for (const flip of [false, true]) {
        const rings = outlinesOf(ways.map((w) => (flip ? [...w].reverse() : w)))
        expect(rings).toHaveLength(1)
        expect(new Set(rings[0].slice(0, -1).map((p) => `${p.lat},${p.lon}`)).size).toBe(6)
      }
    }
  })
  it('draws two rooms sharing a wall as their joint outline, whatever the order', () => {
    const a = [pt(0, 0), pt(0, 1), pt(1, 1), pt(1, 0), pt(0, 0)]
    const b = [pt(0, 1), pt(0, 2), pt(1, 2), pt(1, 1), pt(0, 1)]
    for (const ways of [[a, b], [b, a]]) {
      const rings = outlinesOf(ways)
      expect(rings).toHaveLength(1)
      expect(new Set(rings[0].slice(0, -1).map((p) => `${p.lat},${p.lon}`)).size).toBe(6)
    }
  })
  it('treats a wall drawn with an extra point in one room only as shared', () => {
    const a = [pt(0, 0), pt(0, 1), pt(0.5, 1), pt(1, 1), pt(1, 0), pt(0, 0)] // midpoint on the wall
    const b = [pt(0, 1), pt(0, 2), pt(1, 2), pt(1, 1), pt(0, 1)] // same wall, no midpoint
    for (const ways of [[a, b], [b, a], [[...a].reverse(), b], [b, [...a].reverse()]]) {
      const rings = outlinesOf(ways)
      expect(rings).toHaveLength(1)
      expect(new Set(rings[0].slice(0, -1).map((p) => `${p.lat},${p.lon}`)).size).toBe(6)
    }
  })
  it('cuts inner members out of the outline as holes', () => {
    const outer = { role: 'outer', geometry: [pt(0, 0), pt(0, 3), pt(3, 3), pt(3, 0), pt(0, 0)] }
    const inner = { role: 'inner', geometry: [pt(1, 1), pt(1, 2), pt(2, 2), pt(2, 1), pt(1, 1)] }
    const f = toFeatures([{ type: 'relation', id: 20, tags: { building: 'train_station' }, members: [inner, outer] }] as Parameters<typeof toFeatures>[0])
    expect(f).toHaveLength(1)
    expect((f[0].geometry as GeoJSON.Polygon).coordinates).toHaveLength(2)
  })
  it('drops an inner ring that sits in no outline', () => {
    const outer = { role: 'outer', geometry: [pt(0, 0), pt(0, 1), pt(1, 1), pt(1, 0), pt(0, 0)] }
    const inner = { role: 'inner', geometry: [pt(5, 5), pt(5, 6), pt(6, 6), pt(6, 5), pt(5, 5)] }
    const f = toFeatures([{ type: 'relation', id: 21, tags: { building: 'train_station' }, members: [outer, inner] }] as Parameters<typeof toFeatures>[0])
    expect((f[0].geometry as GeoJSON.Polygon).coordinates).toHaveLength(1)
  })
  it('draws a ring once when an overlapping way makes it come out twice', () => {
    const sqWithMid = [pt(0, 0), pt(0, 1), pt(0, 2), pt(2, 2), pt(2, 0), pt(0, 0)]
    expect(outlinesOf([sqWithMid, [pt(0, 0), pt(0, 2)]])).toHaveLength(1)
  })
  it('shows a relation found in several cells once', () => {
    const rel = { type: 'relation', id: 3568744, tags: { building: 'train_station', name: 'Penn' }, members: [{ role: 'outer', geometry: square }] }
    const room = { type: 'way', id: 1, tags: { indoor: 'room', level: '0' }, geometry: square }
    const a = toFeatures([rel, room] as Parameters<typeof toFeatures>[0])
    const b = toFeatures([rel] as Parameters<typeof toFeatures>[0])
    expect(mergeCells([a, b, null])).toHaveLength(a.length)
  })
  it('gives a hole to the innermost outline holding it (island in a courtyard)', () => {
    const box = (lo: number, hi: number) => [pt(lo, lo), pt(lo, hi), pt(hi, hi), pt(hi, lo), pt(lo, lo)]
    const members = [
      { role: 'outer', geometry: box(0, 10) }, { role: 'inner', geometry: box(2, 8) },
      { role: 'outer', geometry: box(3, 7) }, { role: 'inner', geometry: box(4, 6) },
    ]
    const f = toFeatures([{ type: 'relation', id: 22, tags: { building: 'train_station' }, members }] as Parameters<typeof toFeatures>[0])
    expect(f.map((x) => (x.geometry as GeoJSON.Polygon).coordinates.length).sort()).toEqual([2, 2])
  })
  it('sees a ring and its reverse as one ring', () => {
    const sq2 = [pt(0, 0), pt(0, 1), pt(1, 1), pt(1, 0), pt(0, 0)]
    expect(outlinesOf([sq2, [...sq2].reverse()])).toHaveLength(1) // same ring either way round
  })
})
