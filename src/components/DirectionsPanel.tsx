import { useState } from 'react'
import { formatArrival, formatDistance, formatDuration } from '../lib/format'
import type { Lane, Route, RouteStep, TravelMode } from '../lib/types'
import type { Stop } from '../lib/url'
import { Icon } from './Icon'
import { StopField } from './StopField'

export type When = { kind: 'now' } | { kind: 'depart'; at: string } | { kind: 'arrive'; at: string }

interface Props {
  transitAvailable: boolean
  speedLimitsAvailable: boolean
  trafficAvailable: boolean
  stops: Stop[]
  routes: Route[]
  selectedRoute: number
  mode: TravelMode
  busy: boolean
  error: string | null
  near: { latitude: number; longitude: number } | null
  when: When
  modeTimes: Partial<Record<TravelMode, number>>
  onStops: (stops: Stop[]) => void
  onMode: (mode: TravelMode) => void
  onWhen: (w: When) => void
  onSelectRoute: (index: number) => void
  onToast: (msg: string) => void
}

const MODES: { id: TravelMode; icon: string; label: string }[] = [
  { id: 'driving', icon: 'directions_car', label: 'Driving' },
  { id: 'transit', icon: 'directions_transit', label: 'Transit' },
  { id: 'walking', icon: 'directions_walk', label: 'Walking' },
  { id: 'cycling', icon: 'directions_bike', label: 'Cycling' },
]

const MANEUVER_ICON: Record<string, string> = {
  'turn left': 'turn_left', 'turn right': 'turn_right', 'turn slight left': 'turn_slight_left', 'turn slight right': 'turn_slight_right',
  'turn sharp left': 'turn_sharp_left', 'turn sharp right': 'turn_sharp_right', 'turn uturn': 'u_turn_left',
  'fork left': 'fork_left', 'fork right': 'fork_right', 'merge left': 'merge', 'merge right': 'merge', 'roundabout': 'roundabout_right', 'rotary': 'roundabout_right',
  'on ramp right': 'ramp_right', 'on ramp left': 'ramp_left', 'off ramp right': 'ramp_right', 'off ramp left': 'ramp_left', 'arrive': 'location_on', 'depart': 'navigation',
}
function maneuverIcon(s: RouteStep): string {
  const m = s.maneuver
  if (!m) return 'straight'
  return MANEUVER_ICON[`${m.type} ${m.modifier ?? ''}`.trim()] ?? MANEUVER_ICON[m.type] ?? (m.modifier?.includes('left') ? 'turn_left' : m.modifier?.includes('right') ? 'turn_right' : 'straight')
}
const LANE_ICON: Record<string, string> = { left: 'turn_left', 'slight left': 'turn_slight_left', 'sharp left': 'turn_sharp_left', straight: 'straight', right: 'turn_right', 'slight right': 'turn_slight_right', 'sharp right': 'turn_sharp_right', uturn: 'u_turn_left' }
function LaneBar({ lanes }: { lanes: Lane[] }) {
  return (
    <span className="lanes" title="Use the highlighted lanes">
      {lanes.map((l, i) => <span key={i} className={'lane' + (l.valid ? ' valid' : '')}><Icon name={LANE_ICON[l.directions[0]] ?? 'straight'} size={14} /></span>)}
    </span>
  )
}
function clock(iso?: string) {
  return iso ? new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : ''
}
function stopName(s: Stop | undefined) {
  return s?.kind === 'me' ? 'Your location' : s?.kind === 'place' ? s.place.title : ''
}
function via(r: Route): string {
  // The longest named road, as Google's "via I-95 S".
  const byName = new Map<string, number>()
  for (const s of r.steps) if (s.name && !s.transit) byName.set(s.name, (byName.get(s.name) ?? 0) + s.distanceMeters)
  return [...byName.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''
}
function delayLabel(r: Route): string | null {
  if (!r.congestion?.length) return null
  const heavy = r.congestion.filter((c) => c === 'heavy' || c === 'severe').length / r.congestion.length
  const moderate = r.congestion.filter((c) => c === 'moderate').length / r.congestion.length
  if (heavy > 0.15) return 'Heavy traffic'
  if (heavy > 0.05 || moderate > 0.2) return 'Some traffic'
  return 'Light traffic'
}

export function DirectionsPanel(p: Props) {
  const { stops, routes, selectedRoute, mode, busy, error, near, onStops, onMode, onSelectRoute } = p
  const [details, setDetails] = useState(false)
  const route = routes[selectedRoute] ?? null

  const setStop = (i: number, s: Stop) => onStops(stops.map((x, j) => (j === i ? s : x)))
  const remove = (i: number) => onStops(stops.filter((_, j) => j !== i))
  const blank: Stop = { kind: 'place', place: { title: '', subtitle: '', latitude: NaN, longitude: NaN } }
  const addStop = () => onStops([...stops, blank])

  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      p.onToast('Link to these directions copied')
    } catch { /* ignore */ }
  }

  return (
    <div className="panel-body directions">
      <div className="mode-tabs" role="tablist">
        {MODES.filter((m) => m.id !== 'transit' || p.transitAvailable).map((m) => (
          <button key={m.id} role="tab" aria-selected={mode === m.id} aria-label={m.label} title={m.label} className={mode === m.id ? 'on' : ''} onClick={() => { onMode(m.id); setDetails(false) }}>
            <Icon name={m.icon} fill={mode === m.id} />
            <span>{p.modeTimes[m.id] !== undefined ? formatDuration(p.modeTimes[m.id]!) : ''}</span>
          </button>
        ))}
      </div>

      <div className="stops-box">
        <ol className="stops">
          {stops.map((s, i) => {
            const isLast = i === stops.length - 1
            const unresolved = s.kind === 'place' && !Number.isFinite(s.place.latitude)
            return (
              <li key={i}>
                <span className={'stop-dot' + (isLast ? ' dest' : i === 0 ? ' origin' : '')} aria-hidden>{isLast ? <Icon name="location_on" fill size={18} /> : null}</span>
                <StopField
                  stop={unresolved ? null : s}
                  placeholder={i === 0 ? 'Choose starting point' : isLast ? 'Choose destination' : 'Add a stop'}
                  near={near}
                  allowMe={!stops.some((x, j) => j !== i && x.kind === 'me')}
                  autoFocus={unresolved}
                  onChange={(stop) => setStop(i, stop)}
                />
                {stops.length > 2 && <button className="icon-btn small" onClick={() => remove(i)} aria-label={`Remove ${stopName(s) || 'stop'}`}><Icon name="close" size={18} /></button>}
              </li>
            )
          })}
        </ol>
        {stops.length === 2 && <button className="swap" onClick={() => onStops([...stops].reverse())} aria-label="Reverse starting point and destination"><Icon name="swap_vert" /></button>}
      </div>
      <div className="dir-tools">
        {mode !== 'transit' && stops.length < 10 && <button className="link-plain" onClick={addStop}><Icon name="add_circle" size={18} /> Add destination</button>}
        <select
          className="when"
          value={p.when.kind}
          onChange={(e) => {
            const kind = e.target.value as When['kind']
            const at = new Date(Date.now() + 15 * 60_000)
            const local = new Date(at.getTime() - at.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
            p.onWhen(kind === 'now' ? { kind: 'now' } : { kind, at: 'at' in p.when ? p.when.at : local })
          }}
          aria-label="When"
        >
          <option value="now">Leave now</option>
          <option value="depart">Depart at</option>
          <option value="arrive">Arrive by</option>
        </select>
        {p.when.kind !== 'now' && (
          <input type="datetime-local" className="when" value={p.when.at} onChange={(e) => p.onWhen({ kind: p.when.kind as 'depart' | 'arrive', at: e.target.value })} />
        )}
        <button className="icon-btn small" onClick={share} aria-label="Copy link to these directions" title="Share"><Icon name="share" size={18} /></button>
      </div>

      {busy && <div className="loading-rows">{[0, 1].map((i) => <div key={i} className="skeleton tall" />)}</div>}
      {error && !busy && <p className="error pad">{error}</p>}

      {!busy && !details && routes.length > 0 && (
        <ul className="route-options">
          {routes.map((r, i) => {
            const delay = p.trafficAvailable ? delayLabel(r) : null
            return (
              <li key={i} className={i === selectedRoute ? 'on' : ''}>
                <button className="route-option" onClick={() => onSelectRoute(i)}>
                  <Icon name={MODES.find((m) => m.id === r.mode)?.icon ?? 'directions'} className="route-mode" />
                  <div className="route-main">
                    {r.mode === 'transit' ? (
                      <>
                        <div className="route-lines">
                          {r.steps.map((s, j) => s.transit
                            ? <span key={j} className="line-badge" style={{ background: s.transit.color, color: s.transit.textColor }}>{s.transit.line}</span>
                            : <Icon key={j} name="directions_walk" size={16} className="muted" />)}
                        </div>
                        <div className="muted small">{clock(r.steps.find((s) => s.transit)?.transit?.departureTime)} – {clock([...r.steps].reverse().find((s) => s.transit)?.transit?.arrivalTime)}{r.fare ? ` · ${r.fare}` : ''}</div>
                      </>
                    ) : (
                      <>
                        <div><strong>via {via(r) || 'local roads'}</strong></div>
                        <div className="muted small">{i === 0 ? 'Fastest route' : ''}{i === 0 && delay ? ' · ' : ''}{delay && <span className={delay === 'Heavy traffic' ? 'closed' : delay === 'Some traffic' ? 'warn' : 'open'}>{delay}</span>}</div>
                      </>
                    )}
                    {i === selectedRoute && <button className="link-plain details-link" onClick={(e) => { e.stopPropagation(); setDetails(true) }}>Details</button>}
                  </div>
                  <div className="route-time">
                    <strong className={p.trafficAvailable && r.mode === 'driving' && delayLabel(r) === 'Heavy traffic' ? 'closed' : p.trafficAvailable && r.mode === 'driving' && delayLabel(r) === 'Some traffic' ? 'warn' : 'open'}>{formatDuration(r.durationSeconds)}</strong>
                    <span className="muted small">{formatDistance(r.distanceMeters)}</span>
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {!busy && details && route && (
        <div className="route-details">
          <button className="link-plain back" onClick={() => setDetails(false)}><Icon name="arrow_back" size={18} /> Back to routes</button>
          <div className="details-head">
            <strong>{formatDuration(route.durationSeconds)}</strong> <span className="muted">({formatDistance(route.distanceMeters)})</span>
            <div className="muted small">Arrive around {formatArrival(route.durationSeconds)}{route.fare ? ` · ${route.fare}` : ''}</div>
          </div>
          {route.legs.map((leg, li) => (
            <div key={li} className="leg">
              <div className="leg-head"><Icon name={li === 0 ? 'trip_origin' : 'location_on'} size={18} /> {stopName(stops[li])}</div>
              <ol className="steps">
                {leg.map((s, i) => (
                  <li key={i} className={s.transit ? 'ride' : ''} style={s.transit ? { borderLeftColor: s.transit.color } : undefined}>
                    {s.transit ? (
                      <>
                        <span className="step-icon"><Icon name={s.transit.vehicle.toLowerCase().includes('ferry') ? 'directions_boat' : s.transit.vehicle.toLowerCase().includes('bus') ? 'directions_bus' : 'subway'} /></span>
                        <div className="step-text">
                          <div><span className="line-badge" style={{ background: s.transit.color, color: s.transit.textColor }}>{s.transit.line}</span> {s.transit.headsign ? `toward ${s.transit.headsign}` : s.transit.vehicle}</div>
                          <div className="muted small">{clock(s.transit.departureTime)} {s.transit.from}</div>
                          <div className="muted small">{s.transit.stops ? `${s.transit.stops} ${s.transit.stops === 1 ? 'stop' : 'stops'} · ` : ''}{formatDuration(s.durationSeconds ?? 0)}</div>
                          <div className="muted small">{clock(s.transit.arrivalTime)} {s.transit.to}</div>
                        </div>
                      </>
                    ) : (
                      <>
                        <span className="step-icon"><Icon name={route.mode === 'transit' ? 'directions_walk' : maneuverIcon(s)} /></span>
                        <div className="step-text">
                          <div>{s.instruction}</div>
                          {(s.lanes || (p.speedLimitsAvailable && s.speedLimit)) && (
                            <div className="step-extras">
                              {s.lanes && <LaneBar lanes={s.lanes} />}
                              {p.speedLimitsAvailable && s.speedLimit && <span className="speed-sign" title="Posted speed limit"><small>LIMIT</small>{s.speedLimit.replace(/ (mph|km\/h)$/, '')}</span>}
                            </div>
                          )}
                          {s.distanceMeters > 0 && <div className="muted small step-dist">{formatDistance(s.distanceMeters)}</div>}
                        </div>
                      </>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          ))}
          <div className="leg-head"><Icon name="location_on" fill size={18} /> {stopName(stops[stops.length - 1])}</div>
        </div>
      )}
    </div>
  )
}
