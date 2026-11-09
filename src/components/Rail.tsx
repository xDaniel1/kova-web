import { config } from '../lib/config'
import { Icon } from './Icon'
import { LogoMark } from './Logo'
import { APP_VERSION, VERSION_LABEL } from '../lib/version'

export type RailItem = 'saved' | 'recents'

interface Props {
  active: RailItem | null
  savedCount: number
  onSelect: (item: RailItem) => void
  onMenu: () => void
  onHome: () => void
}

/** Google Maps' left icon rail: menu, Saved, Recents, and a "Get app" link at the bottom. */
export function Rail({ active, savedCount, onSelect, onMenu, onHome }: Props) {
  return (
    <nav className="rail" aria-label="Main">
      <button className="rail-logo" onClick={onHome} aria-label="Kova Maps home" title="Kova Maps"><LogoMark size={36} /></button>
      <button className="rail-menu" onClick={onMenu} aria-label="Toggle side panel" title="Toggle side panel"><Icon name="menu" /></button>
      <button className={'rail-item' + (active === 'saved' ? ' on' : '')} onClick={() => onSelect('saved')}>
        <Icon name="bookmark" fill={active === 'saved'} />
        <span>Saved</span>
        {savedCount > 0 && <span className="rail-badge">{savedCount}</span>}
      </button>
      <button className={'rail-item' + (active === 'recents' ? ' on' : '')} onClick={() => onSelect('recents')}>
        <Icon name="history" />
        <span>Recents</span>
      </button>
      <div className="rail-spacer" />
      <a className="rail-item" href={config.testFlightURL} target="_blank" rel="noreferrer" title="Get the iPhone app (TestFlight beta)">
        <Icon name="smartphone" />
        <span>Get app</span>
      </a>
      <span className="rail-version" title={`Kova Maps for web ${VERSION_LABEL}`}>v{APP_VERSION}</span>
    </nav>
  )
}
