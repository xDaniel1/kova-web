import { config } from '../lib/config'
import { Icon } from './Icon'

export type RailItem = 'saved' | 'recents'

interface Props {
  active: RailItem | null
  savedCount: number
  onSelect: (item: RailItem) => void
  onMenu: () => void
}

/** Google Maps' left icon rail: menu, Saved, Recents, and a "Get app" link at the bottom. */
export function Rail({ active, savedCount, onSelect, onMenu }: Props) {
  return (
    <nav className="rail" aria-label="Main">
      <button className="rail-menu" onClick={onMenu} aria-label="Menu"><Icon name="menu" /></button>
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
    </nav>
  )
}
