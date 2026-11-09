import { useEffect, useRef, useState } from 'react'
import { retrieve, suggest, type Suggestion } from '../lib/mapbox'
import type { Stop } from '../lib/url'
import { Icon } from './Icon'

interface Props {
  stop: Stop | null
  placeholder: string
  near: { latitude: number; longitude: number } | null
  allowMe: boolean
  autoFocus?: boolean
  onChange: (stop: Stop) => void
}

export function StopField({ stop, placeholder, near, allowMe, autoFocus, onChange }: Props) {
  const label = stop?.kind === 'me' ? 'Your location' : stop?.kind === 'place' ? stop.place.title : ''
  const [text, setText] = useState(label)
  const [editing, setEditing] = useState(false)
  const [results, setResults] = useState<Suggestion[]>([])
  const abort = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!editing) setText(label)
  }, [label, editing])

  useEffect(() => {
    if (!editing) return
    abort.current?.abort()
    const q = text.trim()
    if (q.length < 2 || q === label) {
      setResults([])
      return
    }
    const c = new AbortController()
    abort.current = c
    const t = setTimeout(() => suggest(q, near ?? undefined, c.signal).then((r) => !c.signal.aborted && setResults(r)).catch(() => {}), 180)
    return () => clearTimeout(t)
  }, [text, editing, near, label])

  const choose = async (s: Suggestion) => {
    setEditing(false)
    setResults([])
    try {
      onChange({ kind: 'place', place: await retrieve(s) })
    } catch {
      /* keep the old stop */
    }
  }

  return (
    <div className="stop-field">
      <input
        value={text}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onFocus={(e) => { setEditing(true); e.currentTarget.select() }}
        onBlur={() => setTimeout(() => setEditing(false), 150)}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && results[0]) choose(results[0]) }}
        aria-label={placeholder}
      />
      {editing && (allowMe || results.length > 0) && (
        <ul className="suggestions floating">
          {allowMe && (
            <li><button onMouseDown={(e) => { e.preventDefault(); setEditing(false); onChange({ kind: 'me' }) }}><span className="sug-icon me"><Icon name="my_location" /></span><span className="sug-text"><strong>Your location</strong></span></button></li>
          )}
          {results.map((s) => (
            <li key={s.id}><button onMouseDown={(e) => { e.preventDefault(); choose(s) }}><span className="sug-icon"><Icon name="location_on" /></span><span className="sug-text"><strong>{s.name}</strong><small>{s.address}</small></span></button></li>
          ))}
        </ul>
      )}
    </div>
  )
}
