import { useEffect, useRef, useState } from 'react'
import { searchPlaces } from '../lib/geocode'
import type { Place } from '../lib/types'
import type { Stop } from '../lib/url'

interface Props {
  stop: Stop | null
  placeholder: string
  near: { latitude: number; longitude: number } | null
  allowMe: boolean
  autoFocus?: boolean
  onChange: (stop: Stop) => void
}

/** A search box that resolves to a stop: a place from the geocoder, or "My location". */
export function StopField({ stop, placeholder, near, allowMe, autoFocus, onChange }: Props) {
  const label = stop?.kind === 'me' ? 'My location' : stop?.kind === 'place' ? stop.place.title : ''
  const [text, setText] = useState(label)
  const [editing, setEditing] = useState(false)
  const [results, setResults] = useState<Place[]>([])
  const abort = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!editing) setText(label)
  }, [label, editing])

  useEffect(() => {
    if (!editing) return
    abort.current?.abort()
    const q = text.trim()
    if (q.length < 2) {
      setResults([])
      return
    }
    const c = new AbortController()
    abort.current = c
    const t = setTimeout(() => {
      searchPlaces(q, near ?? undefined, c.signal)
        .then((r) => !c.signal.aborted && setResults(r))
        .catch(() => {})
    }, 250)
    return () => clearTimeout(t)
  }, [text, editing, near])

  const choose = (s: Stop) => {
    onChange(s)
    setEditing(false)
    setResults([])
  }

  return (
    <div className="stop-field">
      <input
        value={text}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onFocus={(e) => {
          setEditing(true)
          e.currentTarget.select()
        }}
        onBlur={() => setTimeout(() => setEditing(false), 150)}
        onChange={(e) => setText(e.target.value)}
        aria-label={placeholder}
      />
      {editing && (allowMe || results.length > 0) && (
        <ul className="dropdown">
          {allowMe && text.trim().length < 2 && (
            <li>
              <button onMouseDown={() => choose({ kind: 'me' })}>📍 My location</button>
            </li>
          )}
          {results.map((p, i) => (
            <li key={i}>
              <button onMouseDown={() => choose({ kind: 'place', place: p })}>
                <strong>{p.title}</strong>
                <small>{p.subtitle}</small>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
