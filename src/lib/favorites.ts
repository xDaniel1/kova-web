import type { FavoritePlace } from './types'

export type FavoritePatch = Partial<Pick<FavoritePlace, 'customTitle' | 'emoji' | 'colorHex' | 'role'>>
export const roleLabel = (role: unknown): string | null => role === 'home' ? 'Home' : role === 'work' ? 'Work' : null

/** Like iOS FavoritesStore.update: assigning a role removes it from its previous holder. */
export function updateFavorite(favorites: FavoritePlace[], id: string, patch: FavoritePatch): FavoritePlace[] {
  if (!favorites.some((f) => f.id === id)) return favorites
  return favorites.map((f) => f.id === id ? { ...f, ...patch }
    : patch.role && f.role === patch.role ? { ...f, role: null } : f)
}

export function sortedFavorites(favorites: FavoritePlace[]): FavoritePlace[] {
  const rank = (f: FavoritePlace) => f.role === 'home' ? 0 : f.role === 'work' ? 1 : 2
  return [...favorites].sort((a, b) => rank(a) - rank(b))
}
