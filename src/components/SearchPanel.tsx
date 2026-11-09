import { useEffect, useRef, useState } from 'react'
import { searchPlaces } from '../lib/geocode'
import type { FavoritePlace, Place, RecentSearch } from '../lib/types'
import { GuidesShelf } from './GuidesShelf'

interface Props {
  near: { latitude: number; longitude: number } | null
  favorites: FavoritePlace[]
  recents: RecentSearch[]
  onPick: (place: Place) => void
  onDirections: () => void
  onClearRecents: () => void
}

export function SearchPanel({ near, favorites, recents, onPick, onDirections, onClearRecents }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Place[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const abort = useRef<AbortController | null>(null)

  useEffect(() => {
    const q = query.trim()
    abort.current?.abort()
    if (q.length < 2) {
      setResults([])
      setBusy(false)
      return
    }
    const controller = new AbortController()
    abort.current = controller
    setBusy(true)
    const t = setTimeout(async () => {
      try {
        const found = await searchPlaces(q, near ?? undefined, controller.signal)
        if (!controller.signal.aborted) {
          setResults(found)
          setError(null)
        }
      } catch (e) {
        if (!controller.signal.aborted) setError((e as Error).message)
      } finally {
        if (!controller.signal.aborted) setBusy(false)
      }
    }, 250)
    return () => clearTimeout(t)
  }, [query, near])

  const showResults = query.trim().length >= 2

  return (
    <section className="panel">
      <div className="search-field">
        <span aria-hidden>🔍</span>
        <input
          type="search"
          placeholder="Search Kova Maps"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
          aria-label="Search places"
        />
        {busy && <span className="spinner" aria-label="Searching" />}
        <button className="icon accent" onClick={onDirections} aria-label="Directions" title="Directions">⤴</button>
      </div>

      {error && <p className="error">{error}</p>}

      {showResults ? (
        <ul className="list">
          {results.map((p, i) => (
            <li key={i}>
              <button onClick={() => { onPick(p); setQuery('') }}>
                <strong>{p.title}</strong>
                <small>{p.subtitle}</small>
              </button>
            </li>
          ))}
          {!busy && results.length === 0 && <li className="muted">No results</li>}
        </ul>
      ) : (
        <>
          {favorites.length > 0 && (
            <>
              <h2>Favorites</h2>
              <ul className="chips">
                {favorites.map((f) => (
                  <li key={f.id}>
                    <button onClick={() => onPick({ title: f.customTitle || f.title, subtitle: f.subtitle, latitude: f.latitude, longitude: f.longitude })}>
                      <span className="chip-icon" style={{ background: f.colorHex ?? '#ff9500' }}>{f.emoji ?? '★'}</span>
                      {f.customTitle || f.title}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
          {recents.length > 0 && (
            <>
              <div className="row-between">
                <h2>Recents</h2>
                <button className="link" onClick={onClearRecents}>Clear</button>
              </div>
              <ul className="list">
                {recents.slice(0, 8).map((r) => (
                  <li key={r.id}>
                    <button onClick={() => onPick(r)}>
                      <strong>{r.title}</strong>
                      <small>{r.subtitle}</small>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
          {favorites.length === 0 && recents.length === 0 && (
            <p className="muted">Search for a place, or click anywhere on the map to drop a pin.</p>
          )}
          <GuidesShelf near={near} onPick={onPick} />
        </>
      )}
    </section>
  )
}
