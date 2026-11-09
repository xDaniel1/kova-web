import { describe, expect, it } from 'vitest'
import { decodeView, encodeView, type Stop } from './url'

const esb = { title: 'Empire State Building', subtitle: '350 5th Ave', latitude: 40.748441, longitude: -73.985664 }
const msg = { title: 'Madison Square Garden', subtitle: '4 Penn Plaza', latitude: 40.750504, longitude: -73.993439 }

describe('view URLs', () => {
  it('round-trips a place', () => {
    const s = encodeView({ place: esb })
    expect(s).toContain('place=40.748441%2C-73.985664')
    const back = decodeView(s)
    expect(back.place?.title).toBe('Empire State Building')
    expect(back.place?.latitude).toBeCloseTo(40.748441, 6)
  })

  it('round-trips directions with a via stop and the user as origin', () => {
    const stops: Stop[] = [{ kind: 'me' }, { kind: 'place', place: msg }, { kind: 'place', place: esb }]
    const s = encodeView({ directions: { stops, mode: 'walking' } })
    const back = decodeView(s)
    expect(back.directions?.mode).toBe('walking')
    expect(back.directions?.stops).toHaveLength(3)
    expect(back.directions?.stops[0]).toEqual({ kind: 'me' })
    const last = back.directions?.stops[2]
    expect(last?.kind === 'place' && last.place.title).toBe('Empire State Building')
  })

  it('omits the mode when driving', () => {
    const stops: Stop[] = [{ kind: 'me' }, { kind: 'place', place: esb }]
    expect(encodeView({ directions: { stops, mode: 'driving' } })).not.toContain('mode=')
  })

  it('ignores garbage', () => {
    expect(decodeView('?place=abc')).toEqual({})
    expect(decodeView('?from=me&to=999,999')).toEqual({})
    expect(decodeView('')).toEqual({})
  })
})
