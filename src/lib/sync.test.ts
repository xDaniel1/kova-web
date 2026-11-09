import { describe, expect, it } from 'vitest'
import { reconcile, type Snapshot } from './sync'

const empty = (updatedAt: string): Snapshot => ({ favorites: [], recents: [], updatedAt })

describe('reconcile', () => {
  it('keeps local when there is no remote row', () => {
    const local = empty('2026-11-01T00:00:00Z')
    expect(reconcile(local, null)).toBe(local)
  })
  it('prefers the newer snapshot', () => {
    const older = empty('2026-11-01T00:00:00Z')
    const newer = empty('2026-11-02T00:00:00Z')
    expect(reconcile(older, newer)).toBe(newer)
    expect(reconcile(newer, older)).toBe(newer)
  })
})
