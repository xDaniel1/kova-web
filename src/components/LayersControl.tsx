import { useRef, useState } from 'react'
import type { BaseMap } from './MapView'
import { Icon } from './Icon'

interface Props {
  version: string
  transitAvailable: boolean
  transit: boolean
  onTransit: (v: boolean) => void
  speedLimitsAvailable: boolean
  trafficAvailable: boolean
  speedLimits: boolean
  onSpeedLimits: (enabled: boolean) => void
  base: BaseMap
  traffic: boolean
  reports: boolean
  signedIn: boolean
  reportsAvailable: boolean
  onBase: (b: BaseMap) => void
  onTraffic: (v: boolean) => void
  onReports: (v: boolean) => void
}

/** The bottom-left Layers tile: one click flips the base map; the panel holds detail toggles. */
export function LayersControl(p: Props) {
  const [open, setOpen] = useState(false)
  // Close after a short grace period so the pointer can cross the gap between the tile and the panel.
  const closeTimer = useRef<number | null>(null)
  const keepOpen = () => { if (closeTimer.current) window.clearTimeout(closeTimer.current); closeTimer.current = null; setOpen(true) }
  const closeSoon = () => { closeTimer.current = window.setTimeout(() => setOpen(false), 300) }
  const other: BaseMap = p.base === 'default' ? 'satellite' : 'default'
  return (
    <div className="layers" onMouseEnter={keepOpen} onMouseLeave={closeSoon}>
      <button className={'layers-tile ' + other} style={{ backgroundImage: `url(/layer-${other}.webp)` }} onClick={() => p.onBase(other)} onMouseEnter={keepOpen} aria-label={other === 'satellite' ? 'Layers: show satellite imagery' : 'Layers: show default map'}>
        <span className="layers-label"><Icon name="layers" size={16} /> Layers</span>
      </button>
      {open && (
        <div className="layers-panel">
          {p.trafficAvailable && <button className={p.traffic ? 'on' : ''} onClick={() => p.onTraffic(!p.traffic)}><span className="layer-ic traffic"><Icon name="traffic" /></span>Traffic</button>}
          <button className={p.base === 'satellite' ? 'on' : ''} onClick={() => p.onBase(p.base === 'satellite' ? 'default' : 'satellite')}><span className="layer-ic sat"><Icon name="satellite_alt" /></span>Satellite</button>
          {p.reportsAvailable && <button className={p.reports ? 'on' : ''} disabled={!p.signedIn} title={p.signedIn ? '' : 'Sign in to see drivers’ reports'} onClick={() => p.onReports(!p.reports)}><span className="layer-ic reports"><Icon name="warning" /></span>Reports</button>}
          {p.transitAvailable && <button className={p.transit ? 'on' : ''} aria-pressed={p.transit} onClick={() => p.onTransit(!p.transit)} title="Rail lines, stations and bus stops from Kova's transit data (Florida today)"><span className="layer-ic transit"><Icon name="directions_transit" /></span>Transit</button>}
          {p.speedLimitsAvailable && <button className={p.speedLimits ? 'on' : ''} aria-pressed={p.speedLimits} aria-label="Posted limits" onClick={() => p.onSpeedLimits(!p.speedLimits)} title="Published road limits where available. Zoom in to see them."><span className="layer-ic limits"><Icon name="speed" /></span>Limits</button>}
          <span className="layers-version">Kova Maps for web {p.version}</span>
        </div>
      )}
    </div>
  )
}
