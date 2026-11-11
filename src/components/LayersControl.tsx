import { useState } from 'react'
import type { BaseMap } from './MapView'
import { Icon } from './Icon'

interface Props {
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
  const other: BaseMap = p.base === 'default' ? 'satellite' : 'default'
  return (
    <div className="layers" onMouseLeave={() => setOpen(false)}>
      <button className={'layers-tile ' + other} style={{ backgroundImage: `url(/layer-${other}.webp)` }} onClick={() => p.onBase(other)} onMouseEnter={() => setOpen(true)} aria-label={other === 'satellite' ? 'Layers: show satellite imagery' : 'Layers: show default map'}>
        <span className="layers-label"><Icon name="layers" size={16} /> Layers</span>
      </button>
      {open && (
        <div className="layers-panel">
          <button className={p.traffic ? 'on' : ''} onClick={() => p.onTraffic(!p.traffic)}><span className="layer-ic traffic"><Icon name="traffic" /></span>Traffic</button>
          <button className={p.base === 'satellite' ? 'on' : ''} onClick={() => p.onBase(p.base === 'satellite' ? 'default' : 'satellite')}><span className="layer-ic sat"><Icon name="satellite_alt" /></span>Satellite</button>
          {p.reportsAvailable && <button className={p.reports ? 'on' : ''} disabled={!p.signedIn} title={p.signedIn ? '' : 'Sign in to see drivers’ reports'} onClick={() => p.onReports(!p.reports)}><span className="layer-ic reports"><Icon name="warning" /></span>Reports</button>}
        </div>
      )}
    </div>
  )
}
