import { describe, expect, it, vi } from 'vitest'
vi.mock('mapbox-gl', () => ({ default: {} }))
import { osmCategory } from '../components/IndoorLayer'

describe('floor-plan directory groups', () => {
  it('files named rooms at a park as rides, not restrooms', () => {
    expect(osmCategory({ kind: 'room' }, false)).toBe('attractions')
    expect(osmCategory({ kind: 'room' }, true)).toBe('other')
    expect(osmCategory({ kind: 'amenity', icon: '🚻' }, false)).toBe('services')
    expect(osmCategory({ kind: 'amenity', icon: '☕' }, false)).toBe('food')
    expect(osmCategory({ kind: 'shop' }, false)).toBe('shops')
    expect(osmCategory({ kind: 'gate' }, true)).toBe('gates')
  })
})
