import { describe, expect, it } from 'vitest'
import { roleLabel, sortedFavorites, updateFavorite } from './favorites'
import type { FavoritePlace } from './types'
const rows: FavoritePlace[] = [
  { id: 'A', title: 'Old home', subtitle: '', latitude: 1, longitude: 2, role: 'home' },
  { id: 'B', title: 'Office', subtitle: '', latitude: 3, longitude: 4, role: 'work' },
  { id: 'C', title: 'New home', subtitle: '', latitude: 5, longitude: 6 },
]
describe('iOS favorite roles', () => {
  it('moves Home without changing Work or dropping future JSON fields', () => {
    const extended = { ...rows[2], futureField: 'preserve' }
    const next = updateFavorite([...rows.slice(0, 2), extended], 'C', { role: 'home' })
    expect(next.map((f) => f.role)).toEqual([null, 'work', 'home'])
    expect(next[2]).toMatchObject({ futureField: 'preserve' })
    expect(rows[0].role).toBe('home')
  })
  it('clears only the selected role and preserves it when editing the name', () => {
    expect(updateFavorite(rows, 'A', { role: null })[1].role).toBe('work')
    expect(updateFavorite(rows, 'A', { customTitle: 'My home' })[0].role).toBe('home')
    expect(updateFavorite(rows, 'missing', { role: 'home' })).toBe(rows)
  })
  it('orders Home, Work then other places without mutating input; unknown roles fall back', () => {
    expect(sortedFavorites([rows[2], rows[1], rows[0]]).map((f) => f.id)).toEqual(['A', 'B', 'C'])
    expect(roleLabel('future-role')).toBeNull()
  })
})
