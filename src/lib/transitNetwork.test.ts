import { describe, expect, it, vi } from 'vitest'
vi.mock('./supabase', () => ({ supabase: {} }))
import { cellAt, cellsIn, parseLines, parseStops } from './transitNetwork'

describe('transit network (iOS TransitNetwork port)', () => {
  it('cells are fixed squares, so panning reuses them', () => {
    const a = cellAt(28.54, -81.38, 1), b = cellAt(28.9, -81.01, 1)
    expect(a.key).toBe(b.key)
    expect([a.south, a.west, a.north, a.east]).toEqual([28, -82, 29, -81])
  })
  it('covers a view with its cells and refuses whole-state views', () => {
    expect(cellsIn({ south: 28.4, west: -81.5, north: 28.6, east: -81.2 }, 1)).toHaveLength(1)
    expect(cellsIn({ south: 25, west: -87, north: 31, east: -80 }, 1, 9)).toEqual([])
  })
  it('parses rows defensively and colours lines by the agency colour', () => {
    expect(parseStops([{ agency: 'lynx', stop_id: '1', name: 'Central Station', latitude: 28.5, longitude: -81.4, mode: 'rail', routes: ['SunRail', 3] }, { name: 'bad' }]))
      .toEqual([{ id: 'lynx:1', agency: 'lynx', name: 'Central Station', latitude: 28.5, longitude: -81.4, mode: 'rail', routes: ['SunRail'] }])
    const [line] = parseLines([{ agency: 'sunrail', line_id: 'SR', name: 'SunRail', color: '00A3E0', mode: 'rail', path: [[-81.4, 28.5], [-81.3, 28.6], ['x']] }, { agency: 'x', path: [[0, 0]] }])
    expect(line.color).toBe('#00A3E0')
    expect(line.path).toHaveLength(2)
    expect(parseLines([{ agency: 'a', line_id: 'b', color: 'red', path: [[0, 0], [1, 1]] }])[0].color).toBeNull()
  })
})
