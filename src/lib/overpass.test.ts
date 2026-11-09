import { describe, expect, it } from 'vitest'
import { parseLanes, speedLabel } from './overpass'

describe('speedLabel', () => {
  it('keeps mph and defaults bare numbers to km/h', () => {
    expect(speedLabel('25 mph')).toBe('25 mph')
    expect(speedLabel('50')).toBe('50 km/h')
  })
  it('ignores zone and implicit values', () => {
    expect(speedLabel('US:urban')).toBeNull()
    expect(speedLabel('walk')).toBeNull()
  })
})

describe('parseLanes', () => {
  it('splits lanes and keeps combined turns together', () => {
    expect(parseLanes('left|through|through;right')).toEqual(['left', 'through', 'through;right'])
  })
  it('names empty lanes', () => {
    expect(parseLanes('|through|')).toEqual(['none', 'through', 'none'])
  })
})
