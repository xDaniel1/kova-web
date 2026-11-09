import { supabase } from './supabase'
import type { FavoritePlace, RecentSearch } from './types'

// Same contract as SupabaseBackend.swift: one row per user in sync_snapshots, holding the
// whole favorites + recents arrays as JSON. Last writer wins, keyed on updated_at.

export interface Snapshot {
  favorites: FavoritePlace[]
  recents: RecentSearch[]
  updatedAt: string
}

const LOCAL_KEY = 'kova.snapshot.v1'

export function loadLocal(): Snapshot {
  try {
    const raw = localStorage.getItem(LOCAL_KEY)
    if (raw) return JSON.parse(raw) as Snapshot
  } catch {
    // Private mode or blocked storage: start empty.
  }
  return { favorites: [], recents: [], updatedAt: new Date(0).toISOString() }
}

export function saveLocal(snapshot: Snapshot): void {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(snapshot))
  } catch {
    // Ignore; the in-memory copy is still correct for this session.
  }
}

export async function fetchRemote(userID: string): Promise<Snapshot | null> {
  const { data, error } = await supabase
    .from('sync_snapshots')
    .select('favorites, recents, updated_at')
    .eq('user_id', userID)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  return {
    favorites: (data.favorites ?? []) as FavoritePlace[],
    recents: (data.recents ?? []) as RecentSearch[],
    updatedAt: data.updated_at as string,
  }
}

export async function pushRemote(userID: string, snapshot: Snapshot): Promise<void> {
  const { error } = await supabase.from('sync_snapshots').upsert({
    user_id: userID,
    favorites: snapshot.favorites,
    recents: snapshot.recents,
    updated_at: snapshot.updatedAt,
  })
  if (error) throw error
}

/** Merge a local and a remote snapshot: newest wins, mirroring SyncCoordinator.swift. */
export function reconcile(local: Snapshot, remote: Snapshot | null): Snapshot {
  if (!remote) return local
  return Date.parse(remote.updatedAt) >= Date.parse(local.updatedAt) ? remote : local
}
