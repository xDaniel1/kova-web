import { formatArrival, formatDistance, formatDuration } from '../lib/format'
import type { Place, Route, TravelMode } from '../lib/types'

interface Props {
  destination: Place
  route: Route | null
  mode: TravelMode
  busy: boolean
  error: string | null
  onMode: (mode: TravelMode) => void
  onClose: () => void
}

const modes: { id: TravelMode; label: string }[] = [
  { id: 'driving', label: '🚗 Drive' },
  { id: 'walking', label: '🚶 Walk' },
  { id: 'cycling', label: '🚲 Bike' },
]

export function DirectionsPanel({ destination, route, mode, busy, error, onMode, onClose }: Props) {
  return (
    <section className="panel card">
      <div className="row-between">
        <div>
          <p className="muted small">Directions to</p>
          <h1>{destination.title}</h1>
        </div>
        <button className="icon" onClick={onClose} aria-label="Close directions">✕</button>
      </div>
      <div className="segmented" role="tablist">
        {modes.map((m) => (
          <button key={m.id} role="tab" aria-selected={mode === m.id} className={mode === m.id ? 'on' : ''} onClick={() => onMode(m.id)}>
            {m.label}
          </button>
        ))}
      </div>
      {busy && <p className="muted">Finding a route…</p>}
      {error && <p className="error">{error}</p>}
      {route && !busy && (
        <>
          <p className="eta">
            <strong>{formatDuration(route.durationSeconds)}</strong>
            <span className="muted"> · {formatDistance(route.distanceMeters)} · arrive {formatArrival(route.durationSeconds)}</span>
          </p>
          <ol className="steps">
            {route.steps.map((s, i) => (
              <li key={i}>
                <span>{s.instruction}</span>
                {s.distanceMeters > 0 && <small className="muted">{formatDistance(s.distanceMeters)}</small>}
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  )
}
