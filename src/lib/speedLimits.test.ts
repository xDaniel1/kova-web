import { describe, expect, it, vi } from 'vitest'
const { query, from } = vi.hoisted(() => {
  const query = { select: vi.fn().mockReturnThis(), lte: vi.fn().mockReturnThis(), gte: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(), abortSignal: vi.fn() }
  return { query, from: vi.fn(() => query) }
})
vi.mock('./supabase', () => ({ supabase: { from } }))
import { fetchSpeedSegments, parseSpeedSegments } from './speedLimits'
const row = { id: 1, mph: 45, source: 'fdot-maxspeed', road: null, path: [[-81.3, 28.4], [-81.31, 28.41]] }

describe('published speed limits', () => {
  it('reads the exact iOS/FDOT path and smallint mph contract', () => {
    expect(parseSpeedSegments([row])).toEqual([{ id: '1', mph: 45, source: 'fdot-maxspeed', road: '', path: row.path }])
  })
  it('drops missing/invalid geometry and speeds rather than inventing limits', () => {
    expect(parseSpeedSegments([null, {}, { ...row, mph: null }, { ...row, mph: 95 }, { ...row, mph: 45.5 }, { ...row, path: [[28, -181], [28, -81]] }, { ...row, path: [] }])).toEqual([])
    expect(parseSpeedSegments(null)).toEqual([])
  })
  it('uses bbox overlap, deterministic order, bounded results and cancellation', async () => {
    query.abortSignal.mockResolvedValueOnce({ data: [row], error: null })
    const signal = new AbortController().signal
    await expect(fetchSpeedSegments({ south: 28.4, west: -81.4, north: 28.5, east: -81.3 }, signal)).resolves.toHaveLength(1)
    expect(from).toHaveBeenCalledWith('speed_limit_segments')
    expect(query.lte).toHaveBeenCalledWith('south', 28.5)
    expect(query.gte).toHaveBeenCalledWith('north', 28.4)
    expect(query.lte).toHaveBeenCalledWith('west', -81.3)
    expect(query.gte).toHaveBeenCalledWith('east', -81.4)
    expect(query.limit).toHaveBeenCalledWith(500)
    expect(query.abortSignal).toHaveBeenCalledWith(signal)
  })
  it('missing tables and denied/empty reads safely return no limits', async () => {
    query.abortSignal.mockResolvedValueOnce({ data: null, error: { code: 'PGRST205' } })
    await expect(fetchSpeedSegments({ south: 28.4, west: -81.4, north: 28.5, east: -81.3 }, new AbortController().signal)).resolves.toEqual([])
  })
  it('does not query whole-country views', async () => {
    const calls = from.mock.calls.length
    await expect(fetchSpeedSegments({ south: 20, west: -170, north: 70, east: -60 }, new AbortController().signal)).resolves.toEqual([])
    expect(from.mock.calls).toHaveLength(calls)
  })
})
