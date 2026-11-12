import { describe, expect, it } from 'vitest'
import { venueCircle, venuePlaceCategory, venuePlaces } from './venuePlaces'

const mk = { name: 'Magic Kingdom', shortName: 'Magic Kingdom', latitude: 28.4188, longitude: -81.5812, radius: 650 }
const pt = (lng: number, lat: number, properties: Record<string, unknown>) => ({ properties, geometry: { type: 'Point' as const, coordinates: [lng, lat] } })

describe('venue places', () => {
  it('sorts tile places into Browse categories, rides included', () => {
    expect(venuePlaceCategory({ class: 'food_and_drink' })).toBe('food')
    expect(venuePlaceCategory({ class: 'store_like' })).toBe('shops')
    expect(venuePlaceCategory({ class: 'park_like', maki: 'amusement-park' })).toBe('attractions')
    expect(venuePlaceCategory({ class: 'arts_and_entertainment', maki: 'theatre' })).toBe('attractions')
    expect(venuePlaceCategory({ class: 'visitor_amenities' })).toBe('services')
    expect(venuePlaceCategory({ class: 'building' })).toBeNull()
  })

  it('keeps named places inside the venue, once each, without the venue itself', () => {
    const places = venuePlaces([
      pt(-81.5812, 28.4192, { name: 'Cinderella Castle', class: 'landmark', maki: 'castle' }),
      pt(-81.5810, 28.4190, { name: "Cinderella's Royal Table", class: 'food_and_drink' }),
      pt(-81.5809, 28.4191, { name: "Cinderella's Royal Table", class: 'food_and_drink' }),
      pt(-81.5812, 28.4188, { name: 'Magic Kingdom', class: 'park_like', maki: 'amusement-park' }),
      pt(-81.5600, 28.4188, { name: 'Far away café', class: 'food_and_drink' }),
      pt(-81.5811, 28.4189, { class: 'store_like' }),
    ], mk)
    expect(places.map((p) => [p.name, p.category])).toEqual([['Cinderella Castle', 'attractions'], ["Cinderella's Royal Table", 'food']])
  })

  it('draws a closed circle of the venue radius', () => {
    const ring = venueCircle(mk).coordinates[0]
    expect(ring[0]).toEqual(ring[ring.length - 1])
    expect(Math.abs(ring[12][1] - mk.latitude) * 111320).toBeCloseTo(650, -1)
  })
})
