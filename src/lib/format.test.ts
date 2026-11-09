import { describe, expect, it } from 'vitest'
import { formatDistance, formatDuration } from './format'

describe('formatDistance', () => {
  it('rounds short imperial distances to tens of feet', () => {
    expect(formatDistance(100)).toBe('330 ft')
  })
  it('switches to miles with one decimal under ten miles', () => {
    expect(formatDistance(1609.344)).toBe('1.0 mi')
    expect(formatDistance(5 * 1609.344)).toBe('5.0 mi')
  })
  it('drops the decimal at ten miles and above', () => {
    expect(formatDistance(16093.44)).toBe('10 mi')
  })
  it('handles metric', () => {
    expect(formatDistance(850, 'metric')).toBe('850 m')
    expect(formatDistance(2500, 'metric')).toBe('2.5 km')
  })
})

describe('formatDuration', () => {
  it('never shows zero minutes', () => {
    expect(formatDuration(20)).toBe('1 min')
  })
  it('shows minutes under an hour', () => {
    expect(formatDuration(25 * 60)).toBe('25 min')
  })
  it('shows hours and minutes', () => {
    expect(formatDuration(3600)).toBe('1 hr')
    expect(formatDuration(3600 + 5 * 60)).toBe('1 hr 5 min')
  })
})
