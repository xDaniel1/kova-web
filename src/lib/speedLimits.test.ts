import { describe, expect, it, vi } from 'vitest'
const { query, rpc } = vi.hoisted(() => {
  const query = { abortSignal: vi.fn() }
  return { query, rpc: vi.fn(() => query) }
})
vi.mock('./supabase', () => ({ supabase: { rpc } }))
import { fetchSpeedSegments, MAX_SEGMENTS, parseSpeedSegments } from './speedLimits'
const row = { id: 1, mph: 45, source: 'fdot-maxspeed', road: null, path: [[-81.3, 28.4], [-81.31, 28.41]] }

describe('published speed limits', () => {
  it('reads the exact iOS/FDOT path and smallint mph contract', () => {
    expect(parseSpeedSegments([row])).toEqual([{ id: '1', mph: 45, source: 'fdot-maxspeed', road: '', path: row.path, authoritative: true }])
  })
  it('drops missing/invalid geometry and speeds rather than inventing limits', () => {
    expect(parseSpeedSegments([null, {}, { ...row, mph: null }, { ...row, mph: 95 }, { ...row, mph: 45.5 }, { ...row, path: [[28, -181], [28, -81]] }, { ...row, path: [] }])).toEqual([])
    expect(parseSpeedSegments(null)).toEqual([])
  })
  it('asks the speed_limits_in_box function for the view, like iPhone, and keeps federal rows marked', async () => {
    query.abortSignal.mockResolvedValueOnce({ data: [{ mph: 45, path: row.path, authoritative: true }, { mph: 55, path: row.path, authoritative: false }], error: null })
    const signal = new AbortController().signal
    const rows = await fetchSpeedSegments({ south: 28.4, west: -81.4, north: 28.5, east: -81.3 }, signal)
    expect(rows.map((r) => [r.mph, r.authoritative])).toEqual([[45, true], [55, false]])
    expect(new Set(rows.map((r) => r.id)).size).toBe(2)
    expect(rpc).toHaveBeenCalledWith('speed_limits_in_box', { p_south: 28.4, p_west: -81.4, p_north: 28.5, p_east: -81.3, p_max: MAX_SEGMENTS })
    expect(query.abortSignal).toHaveBeenCalledWith(signal)
  })
  it('missing tables and denied/empty reads safely return no limits', async () => {
    query.abortSignal.mockResolvedValueOnce({ data: null, error: { code: 'PGRST205' } })
    await expect(fetchSpeedSegments({ south: 28.4, west: -81.4, north: 28.5, east: -81.3 }, new AbortController().signal)).resolves.toEqual([])
  })
  it('does not query whole-country views', async () => {
    const calls = rpc.mock.calls.length
    await expect(fetchSpeedSegments({ south: 20, west: -170, north: 70, east: -60 }, new AbortController().signal)).resolves.toEqual([])
    expect(rpc.mock.calls).toHaveLength(calls)
  })
})
