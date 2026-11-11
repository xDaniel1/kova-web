import { describe, expect, it } from 'vitest'
import { directoryCategory, floorsOf, isDirectoryPlace, parseFloor, parseStructure, structureNear, visibleFloorIds, type IndoorFloor } from './mapboxIndoor'
import { BUNDLED_VENUES, airportFromStructureName, browseName, mergeVenues, parseVenueRows, venueAt } from './venues'

const floor = (id: string, structure: string, z: number, isDefault = false, extra: Partial<IndoorFloor> = {}): IndoorFloor => ({
  id, name: String(z), description: '', structureIds: [structure], zIndex: z, isDefault, connectedFloorIds: [], conflictedFloorIds: [], ...extra,
})

describe('Mapbox indoor floors', () => {
  const floors = [
    floor('t4-1', 'T4', 1, true, { conflictedFloorIds: ['t4-2'] }),
    floor('t4-2', 'T4', 2, false, { conflictedFloorIds: ['t4-1'], connectedFloorIds: ['b-2'] }),
    floor('b-1', 'B', 1, true, { conflictedFloorIds: ['b-2'] }),
    floor('b-2', 'B', 2, false, { conflictedFloorIds: ['b-1'] }),
    floor('t5-1', 'T5', 1, true),
  ]

  it('shows every default floor when nothing is chosen', () => {
    expect(visibleFloorIds(floors, null)).toEqual(['b-1', 't4-1', 't5-1'])
    expect(visibleFloorIds(floors, 'missing')).toEqual(['b-1', 't4-1', 't5-1'])
  })

  it('a chosen floor brings its connected floors and replaces those buildings only', () => {
    expect(visibleFloorIds(floors, 't4-2')).toEqual(['b-2', 't4-2', 't5-1'])
  })

  it('parses tile properties, splitting id lists on semicolons', () => {
    expect(parseFloor({ id: 'f', name: '3', description: 'Gates Level', structure_ids: 'a;b', z_index: 3, is_default: true, connected_floor_ids: 'x', conflicted_floor_ids: '' })).toEqual({
      id: 'f', name: '3', description: 'Gates Level', structureIds: ['a', 'b'], zIndex: 3, isDefault: true, connectedFloorIds: ['x'], conflictedFloorIds: [],
    })
    expect(parseFloor({ name: 'no id' })).toBeNull()
    expect(parseStructure({ id: 's', center_lat: 40.64, center_lon: -73.78 }, new Map([['s', 'JFK Terminal 4']]))).toEqual({ id: 's', name: 'JFK Terminal 4', latitude: 40.64, longitude: -73.78 })
    expect(parseStructure({ id: 's' })).toBeNull()
  })

  it('picks the nearest building, and a car park only when nothing else is near', () => {
    const t4 = { id: 'T4', name: 'JFK Terminal 4', latitude: 40.6441, longitude: -73.7822 }
    const garage = { id: 'P', name: 'JFK Terminal 4 Parking', latitude: 40.6445, longitude: -73.7830 }
    const here = { latitude: 40.6445, longitude: -73.7831 }
    expect(structureNear(here, [t4, garage])?.id).toBe('T4')
    expect(structureNear(here, [garage])?.id).toBe('P')
    expect(structureNear({ latitude: 41, longitude: -73 }, [t4, garage])).toBeNull()
    expect(floorsOf(t4, floors).map((f) => f.id)).toEqual(['t4-1', 't4-2'])
  })

  it('sorts labels into the directory groups and drops non-places', () => {
    expect(directoryCategory({ class: 'restaurants' })).toBe('food')
    expect(directoryCategory({ class: 'retail' })).toBe('shops')
    expect(directoryCategory({ class: 'travel', shape_type: 'gate' })).toBe('gates')
    expect(isDirectoryPlace({ name: 'Shake Shack', shape_type: 'occupant', class: 'restaurants' })).toBe(true)
    expect(isDirectoryPlace({ name: 'B32', shape_type: 'gate' })).toBe(true)
    expect(isDirectoryPlace({ name: 'Elevator', shape_type: 'poi', class: 'connector', type: 'elevator' })).toBe(false)
    expect(isDirectoryPlace({ name: '', shape_type: 'room', class: 'retail' })).toBe(false)
    expect(isDirectoryPlace({ name: 'Level 1', shape_type: 'floor' })).toBe(false)
  })
})

describe('venues', () => {
  it('reads the airport code from a Mapbox structure name', () => {
    expect(airportFromStructureName('ATL Concourse D', { latitude: 33.64, longitude: -84.43 })).toMatchObject({ shortName: 'ATL', name: 'ATL Airport', kind: 'airport', radius: 2500 })
    expect(airportFromStructureName('Terminal 4', { latitude: 0, longitude: 0 })).toBeNull()
    expect(airportFromStructureName('Jfk Terminal 4', { latitude: 0, longitude: 0 })).toBeNull()
  })

  it('finds the smallest venue under a point', () => {
    expect(venueAt({ latitude: 40.7518, longitude: -73.9966 }, BUNDLED_VENUES)?.shortName).toBe('Moynihan')
    expect(venueAt({ latitude: 40.644, longitude: -73.783 }, BUNDLED_VENUES)?.shortName).toBe('JFK')
    expect(venueAt({ latitude: 10, longitude: 10 }, BUNDLED_VENUES)).toBeNull()
  })

  it('shortens names the way the iPhone Browse button does', () => {
    expect(browseName('John F. Kennedy International Airport Terminal 4')).toBe('Terminal 4')
    expect(browseName('World Trade Center Transportation Hub - Oculus')).toBe('Oculus')
    expect(browseName('JFK')).toBe('JFK')
  })

  it('merges table rows over the bundle and ignores bad rows', () => {
    const rows = parseVenueRows([
      { short_name: 'JFK', name: 'JFK moved', latitude: 40.65, longitude: -73.78, radius_m: 1800, kind: 'airport' },
      { short_name: 'LAX', name: 'Los Angeles International Airport', latitude: 33.94, longitude: -118.4, radius_m: 2000, kind: 'airport' },
      { short_name: 'bad', name: 'x', latitude: 999, longitude: 0, radius_m: 10, kind: 'mall' },
      { short_name: 'odd', name: 'x', latitude: 1, longitude: 1, radius_m: 100, kind: 'castle' },
    ])
    expect(rows.map((r) => r.shortName)).toEqual(['JFK', 'LAX', 'odd'])
    expect(rows[2].kind).toBe('other')
    const merged = mergeVenues(rows)
    expect(merged.find((x) => x.shortName === 'JFK')?.radius).toBe(1800)
    expect(merged.length).toBe(BUNDLED_VENUES.length + 2)
    expect(parseVenueRows('nope')).toEqual([])
  })
})
