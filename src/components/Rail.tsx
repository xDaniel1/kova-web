import { Icon } from './Icon'

export type RailItem = 'saved' | 'recents'

interface Props {
  active: RailItem | null
  savedCount: number
  onSelect: (item: RailItem) => void
}

/** Saved and Recents as Kova tiles under the search box. */
export function Dock({ active, savedCount, onSelect }: Props) {
  return (
    <nav className="dock-tabs" aria-label="Your places">
      <button className={'tile-btn' + (active === 'saved' ? ' on' : '')} aria-pressed={active === 'saved'} onClick={() => onSelect('saved')}>
        <Icon name="bookmark" fill={active === 'saved'} size={18} /> Saved{savedCount > 0 && <span className="tile-count">{savedCount}</span>}
      </button>
      <button className={'tile-btn' + (active === 'recents' ? ' on' : '')} aria-pressed={active === 'recents'} onClick={() => onSelect('recents')}>
        <Icon name="history" size={18} /> Recents
      </button>
    </nav>
  )
}
