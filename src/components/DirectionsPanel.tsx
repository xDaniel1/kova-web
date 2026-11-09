import { useState } from 'react'
import { formatArrival, formatDistance, formatDuration } from '../lib/format'
import type { Route, TravelMode } from '../lib/types'
import type { Stop } from '../lib/url'
import { StopField } from './StopField'

interface Props {
  stops: Stop[]
  routes: Route[]
  selectedRoute: number
  mode: TravelMode
  busy: boolean
  error: string | null
  near: { latitude: number; longitude: number } | null
  onStops: (stops: Stop[]) => void
  onMode: (mode: TravelMode) => void
  onSelectRoute: (index: number) => void
  onClose: () => void
}

const modes: { id: TravelMode; label: string }[] = [
  { id: 'driving', label: '🚗 Drive' },
  { id: 'walking', label: '🚶 Walk' },
  { id: 'cycling', label: '🚲 Bike' },
  { id: 'transit', label: '🚇 Transit' },
]

function clock(iso?: string): string {
  return iso ? new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : ''
}

function stopName(s: Stop | null): string {
  return s?.kind === 'me' ? 'My location' : s?.kind === 'place' ? s.place.title : ''
}

const LANE_GLYPHS: Record<string, string> = { left: '↰', slight_left: '↖', sharp_left: '↙', through: '↑', right: '↱', slight_right: '↗', sharp_right: '↘', reverse: '↶', merge_to_left: '↰', merge_to_right: '↱', none: '↑' }
function laneGlyph(lane: string): string {
  return lane.split(';').map((l) => LANE_GLYPHS[l] ?? '↑').join('')
}

export function DirectionsPanel(p: Props) {
  const { stops, routes, selectedRoute, mode, busy, error, near, onStops, onMode, onSelectRoute, onClose } = p
  const route = routes[selectedRoute] ?? null
  const [openLeg, setOpenLeg] = useState<number | null>(stops.length <= 2 ? 0 : null)

  const setStop = (i: number, s: Stop) => onStops(stops.map((x, j) => (j === i ? s : x)))
  const remove = (i: number) => onStops(stops.filter((_, j) => j !== i))
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= stops.length) return
    const next = [...stops]
    ;[next[i], next[j]] = [next[j], next[i]]
    onStops(next)
  }
  const swap = () => onStops([...stops].reverse())
  const addStop = () => onStops([...stops.slice(0, -1), { kind: 'place', place: { title: '', subtitle: '', latitude: NaN, longitude: NaN } }, stops[stops.length - 1]])

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      alert('Link copied')
    } catch {
      prompt('Copy this link', window.location.href)
    }
  }

  return (
    <section className="panel card directions">
      <div className="row-between">
        <h1>Directions</h1>
        <div className="row-gap">
          <button className="icon" onClick={copyLink} aria-label="Copy link to this route" title="Copy link">🔗</button>
          <button className="icon" onClick={onClose} aria-label="Close directions">✕</button>
        </div>
      </div>

      <ol className="stops">
        {stops.map((s, i) => {
          const isLast = i === stops.length - 1
          const unresolved = s.kind === 'place' && !Number.isFinite(s.place.latitude)
          return (
            <li key={i} className={isLast ? 'dest' : ''}>
              <span className="stop-dot" aria-hidden>{isLast ? '◉' : i === 0 ? '●' : '○'}</span>
              <StopField
                stop={unresolved ? null : s}
                placeholder={i === 0 ? 'From' : isLast ? 'To' : 'Add a stop'}
                near={near}
                allowMe={!stops.some((x, j) => j !== i && x.kind === 'me')}
                autoFocus={unresolved}
                onChange={(stop) => setStop(i, stop)}
              />
              <div className="stop-tools">
                {stops.length > 2 && <button className="mini" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">↑</button>}
                {stops.length > 2 && <button className="mini" onClick={() => move(i, 1)} disabled={isLast} aria-label="Move down">↓</button>}
                {stops.length > 2 && <button className="mini" onClick={() => remove(i)} aria-label={`Remove ${stopName(s) || 'stop'}`}>✕</button>}
              </div>
            </li>
          )
        })}
      </ol>
      <div className="row-gap">
        <button className="link" onClick={swap}>⇅ Reverse</button>
        <button className="link" onClick={addStop} disabled={stops.length >= 10}>+ Add stop</button>
      </div>

      <div className="segmented" role="tablist">
        {modes.map((m) => (
          <button key={m.id} role="tab" aria-selected={mode === m.id} className={mode === m.id ? 'on' : ''} onClick={() => onMode(m.id)}>
            {m.label}
          </button>
        ))}
      </div>

      {busy && <p className="muted">Finding a route…</p>}
      {error && !busy && <p className="error">{error}</p>}

      {routes.length > 1 && !busy && (
        <ul className="alternatives">
          {routes.map((r, i) => (
            <li key={i}>
              <button className={i === selectedRoute ? 'on' : ''} onClick={() => onSelectRoute(i)}>
                <strong>{formatDuration(r.durationSeconds)}</strong>
                <small>{formatDistance(r.distanceMeters)}{i === 0 ? ' · fastest' : ''}</small>
              </button>
            </li>
          ))}
        </ul>
      )}

      {route && !busy && (
        <>
          <p className="eta">
            <strong>{formatDuration(route.durationSeconds)}</strong>
            <span className="muted"> · {formatDistance(route.distanceMeters)} · arrive {formatArrival(route.durationSeconds)}{route.fare ? ` · ${route.fare}` : ''}</span>
          </p>
          {route.mode === 'transit' && (
            <div className="transit-summary">
              {route.steps.map((s, i) =>
                s.transit ? (
                  <span key={i} className="line-badge" style={{ background: s.transit.color, color: s.transit.textColor }}>{s.transit.line}</span>
                ) : (
                  <span key={i} className="walk-badge" title={formatDuration(s.durationSeconds ?? 0)}>🚶</span>
                ),
              )}
            </div>
          )}
          {route.legs.map((leg, li) => {
            const legMeters = leg.reduce((a, s) => a + s.distanceMeters, 0)
            const open = openLeg === li
            return (
              <div key={li} className="leg">
                {route.legs.length > 1 && (
                  <button className="leg-head" onClick={() => setOpenLeg(open ? null : li)} aria-expanded={open}>
                    <span>{stopName(stops[li])} → {stopName(stops[li + 1])}</span>
                    <small className="muted">{formatDistance(legMeters)} {open ? '▴' : '▾'}</small>
                  </button>
                )}
                {(open || route.legs.length === 1) && (
                  <ol className="steps">
                    {leg.map((s, i) => (
                      <li key={i} className={s.transit ? 'ride' : ''} style={s.transit ? { borderLeftColor: s.transit.color } : undefined}>
                        {s.transit ? (
                          <span>
                            <span className="line-badge" style={{ background: s.transit.color, color: s.transit.textColor }}>{s.transit.line}</span>{' '}
                            {s.transit.vehicle}{s.transit.headsign ? ` toward ${s.transit.headsign}` : ''}
                            <br />
                            <small className="muted">
                              {clock(s.transit.departureTime)} {s.transit.from} → {clock(s.transit.arrivalTime)} {s.transit.to}
                              {s.transit.stops ? ` · ${s.transit.stops} ${s.transit.stops === 1 ? 'stop' : 'stops'}` : ''}
                            </small>
                          </span>
                        ) : (
                          <span>
                            {s.instruction}
                            {s.speedLimit && <span className="speed-sign" title="Posted speed limit">{s.speedLimit}</span>}
                            {s.lanes && s.lanes.length > 0 && (
                              <span className="lanes" title="Lanes at the turn">
                                {s.lanes.map((l, j) => <span key={j} className="lane">{laneGlyph(l)}</span>)}
                              </span>
                            )}
                          </span>
                        )}
                        <small className="muted">{s.durationSeconds && s.transit ? formatDuration(s.durationSeconds) : s.distanceMeters > 0 ? formatDistance(s.distanceMeters) : ''}</small>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            )
          })}
        </>
      )}
    </section>
  )
}
