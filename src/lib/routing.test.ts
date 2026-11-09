import { describe, expect, it } from 'vitest'
import { speedLabel } from './routing'

describe('speedLabel', () => {
  it('converts km/h to the US sign value', () => {
    expect(speedLabel({ speed: 40, unit: 'km/h' })).toBe('25 mph')
    expect(speedLabel({ speed: 80, unit: 'km/h' })).toBe('50 mph')
    expect(speedLabel({ speed: 105, unit: 'km/h' })).toBe('65 mph')
  })
  it('keeps mph and skips unknowns', () => {
    expect(speedLabel({ speed: 30, unit: 'mph' })).toBe('30 mph')
    expect(speedLabel(undefined)).toBeUndefined()
    expect(speedLabel({})).toBeUndefined()
  })
})
