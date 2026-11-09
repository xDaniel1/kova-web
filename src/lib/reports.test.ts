import { describe, expect, it } from 'vitest'
import { ageLabel } from './reports'

describe('ageLabel', () => {
  const now = Date.parse('2026-11-09T12:00:00Z')
  it('never says zero minutes', () => {
    expect(ageLabel('2026-11-09T11:59:50Z', now)).toBe('1 min ago')
  })
  it('counts minutes then hours', () => {
    expect(ageLabel('2026-11-09T11:35:00Z', now)).toBe('25 min ago')
    expect(ageLabel('2026-11-09T10:05:00Z', now)).toBe('2 hr ago')
  })
})
