import { deflateRawSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { COVER_CELLS, HEIGHT_CELLS, TREE_CELLS, coordinateAt, groundOf, plant, scramble, shapes, tileBlock, tilePosition } from './trees'

const pack = (bytes: Uint8Array) => deflateRawSync(bytes).toString('base64')

describe('trees (iPhone TreeCoverService port)', () => {
  it('scrambles exactly like the iPhone (64-bit wrapping arithmetic)', () => {
    // Printed by TreeCoverService.scramble in Swift; the same cells must grow the same trees.
    expect(scramble(1, 0)).toBe(6349394608567520747n)
    expect(scramble(2286145, 3477012)).toBe(13843695822478350275n)
    expect(scramble(-5, 7)).toBe(14024435150279923620n)
    expect(scramble(2286145 + 0x5151, 3477012)).toBe(13567924405937096710n)
  })
  it('round-trips the zoom-14 grid', () => {
    const p = tilePosition(28.54, -81.38)
    const c = coordinateAt(p.x, p.y)
    expect(c.latitude).toBeCloseTo(28.54, 6)
    expect(c.longitude).toBeCloseTo(-81.38, 6)
    expect(tileBlock(28.54, -81.38).length).toBeGreaterThanOrEqual(1)
  })
  it('unpacks raw-deflated tiles and prefers single trees over cover', async () => {
    const cover = new Uint8Array((COVER_CELLS * COVER_CELLS) / 8).fill(0xff)
    expect((await groundOf({ x: 0, y: 0, mask: pack(cover) })).kind).toBe('cover')
    const bits = new Uint8Array((TREE_CELLS * TREE_CELLS) / 8)
    const heights = new Uint8Array(HEIGHT_CELLS * HEIGHT_CELLS).fill(20)
    expect((await groundOf({ x: 0, y: 0, mask: pack(cover), trees: pack(bits), heights: pack(heights) })).kind).toBe('single')
    expect((await groundOf({ x: 0, y: 0, mask: '' })).kind).toBe('bare')
    expect((await groundOf({ x: 0, y: 0, mask: 'not base64!' })).kind).toBe('bare')
  })
  it('plants single trees where they stand, at measured heights, within the radius and limit', () => {
    const centre = { latitude: 28.54, longitude: -81.38 }
    const p = tilePosition(centre.latitude, centre.longitude)
    const tile = { x: Math.floor(p.x), y: Math.floor(p.y) }
    const bits = new Uint8Array((TREE_CELLS * TREE_CELLS) / 8)
    const i = Math.floor(p.x * TREE_CELLS) - tile.x * TREE_CELLS, j = Math.floor(p.y * TREE_CELLS) - tile.y * TREE_CELLS
    const index = j * TREE_CELLS + i
    bits[index >> 3] |= 0x80 >> (index & 7)
    const heights = new Uint8Array(HEIGHT_CELLS * HEIGHT_CELLS).fill(20)
    const trees = plant([{ ...tile, ground: { kind: 'single', bits, heights } }], centre)
    expect(trees).toHaveLength(1)
    expect(trees[0].height).toBeGreaterThanOrEqual(20 * 0.72)
    expect(Math.abs(trees[0].latitude - centre.latitude)).toBeLessThan(0.0001)
    const full = new Uint8Array((COVER_CELLS * COVER_CELLS) / 8).fill(0xff)
    expect(plant([{ ...tile, ground: { kind: 'cover', bits: full } }], centre, 650, 100)).toHaveLength(100)
  })
  it('draws each tree as trunk, crown and cap', () => {
    const fc = shapes([{ latitude: 28.5, longitude: -81.4, variety: 0.5, height: 12 }])
    expect(fc.features.map((f) => f.properties!.h)).toEqual([12 * 0.27, 12 * 0.72, 12])
  })
})
