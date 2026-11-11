import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { suggest, type Suggestion } from '../lib/mapbox'
import type { FavoritePlace, RecentSearch } from '../lib/types'
import { Icon } from './Icon'

interface Props {
  value: string
  near: { latitude: number; longitude: number } | null
  favorites: FavoritePlace[]
  recents: RecentSearch[]
  showClose: boolean
  onValue: (v: string) => void
  onSuggestion: (s: Suggestion) => void
  onSubmit: (query: string) => void
  onFavorite: (f: FavoritePlace) => void
  onRecent: (r: RecentSearch) => void
  onDirections: () => void
  onClose: () => void
  /** Extra control at the end of the row (the account button on phones). */
  accessory?: ReactNode
}

const KIND_ICON: Record<string, string> = { poi: 'location_on', address: 'home_pin', street: 'add_road', place: 'location_city', neighborhood: 'location_city', postcode: 'markunread_mailbox', category: 'search' }

/** Kova search, with pointer and keyboard accessible suggestions. */
export function SearchCard(p: Props) {
  const listId = useId()
  const [status, setStatus] = useState('')
  const [focused, setFocused] = useState(false)
  const [items, setItems] = useState<Suggestion[]>([])
  const [active, setActive] = useState(-1)
  const abort = useRef<AbortController | null>(null)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const q = p.value.trim()
    abort.current?.abort()
    setActive(-1)
    setItems([])
    setStatus('')
    if (!focused || q.length < 2) {
      setItems([])
      return
    }
    const c = new AbortController()
    abort.current = c
    setStatus('Searching…')
    const t = setTimeout(() => {
      suggest(q, p.near ?? undefined, c.signal).then((r) => {
        if (c.signal.aborted) return
        setItems(r)
        setStatus(r.length ? '' : 'No suggestions. Press Search to find places.')
      }).catch(() => {
        if (!c.signal.aborted) setStatus('Suggestions unavailable. Press Search to try a full search.')
      })
    }, 180)
    return () => { clearTimeout(t); c.abort() }
  }, [p.value, focused, p.near])

  // "/" focuses search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault()
        input.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const choose = (s: Suggestion) => {
    setFocused(false)
    input.current?.blur()
    p.onSuggestion(s)
  }
  const submit = () => {
    if (active >= 0 && items[active]) return choose(items[active])
    const q = p.value.trim()
    if (!q) return
    setFocused(false)
    input.current?.blur()
    p.onSubmit(q)
  }

  const typing = p.value.trim().length >= 2
  const showDropdown = focused && (typing ? items.length > 0 : p.favorites.length + p.recents.length > 0)

  return (
    <div className={'search-card' + (showDropdown ? ' open' : '')} onBlur={(e) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false)
    }}>
      <form className="search-row" role="search" onSubmit={(e) => { e.preventDefault(); submit() }}>
        <input
          ref={input}
          value={p.value}
          onChange={(e) => p.onValue(e.target.value)}
          onFocus={() => setFocused(true)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(items.length - 1, a + 1)) }
            if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(-1, a - 1)) }
            if (e.key === 'Escape') input.current?.blur()
          }}
          placeholder="Search Kova Maps"
          aria-label="Search Kova Maps"
          role="combobox"
          aria-expanded={showDropdown}
          aria-controls={listId}
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          autoComplete="off"
        />
        <button type="submit" className="icon-btn" aria-label="Search"><Icon name="search" /></button>
        {p.showClose ? (
          <button type="button" className="icon-btn" aria-label="Close" onClick={p.onClose}><Icon name="close" /></button>
        ) : (
          <button type="button" className="icon-btn accent" aria-label="Directions" title="Directions" onClick={p.onDirections}><Icon name="directions" fill /></button>
        )}
        {p.accessory}
      </form>
      {focused && typing && status && <p className="search-status" role="status">{status}</p>}
      {showDropdown && (
        <ul id={listId} className="suggestions" role="listbox" aria-label="Search suggestions">
          {typing
            ? items.map((s, i) => (
                <li id={`${listId}-${i}`} key={s.id} role="option" aria-selected={i === active}>
                  <button className={i === active ? 'active' : ''} onPointerDown={(e) => e.preventDefault()} onClick={() => choose(s)}>
                    <span className="sug-icon"><Icon name={KIND_ICON[s.kind] ?? 'location_on'} /></span>
                    <span className="sug-text"><strong>{s.name}</strong><small>{s.address}</small></span>
                  </button>
                </li>
              ))
            : (
              <>
                {p.favorites.slice(0, 4).map((f) => (
                  <li key={f.id}>
                    <button onPointerDown={(e) => e.preventDefault()} onClick={() => { setFocused(false); p.onFavorite(f) }}>
                      <span className="sug-icon fav" style={{ background: f.colorHex ?? undefined }}>{f.emoji ?? <Icon name="star" fill />}</span>
                      <span className="sug-text"><strong>{f.customTitle || f.title}</strong><small>{f.subtitle}</small></span>
                    </button>
                  </li>
                ))}
                {p.recents.slice(0, 5).map((r) => (
                  <li key={r.id}>
                    <button onPointerDown={(e) => e.preventDefault()} onClick={() => { setFocused(false); p.onRecent(r) }}>
                      <span className="sug-icon"><Icon name="history" /></span>
                      <span className="sug-text"><strong>{r.title}</strong><small>{r.subtitle}</small></span>
                    </button>
                  </li>
                ))}
              </>
            )}
        </ul>
      )}
    </div>
  )
}
