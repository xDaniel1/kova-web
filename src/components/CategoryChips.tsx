import { Icon } from './Icon'

export const CATEGORIES = [
  { label: 'Restaurants', icon: 'restaurant', query: 'restaurants' },
  { label: 'Coffee', icon: 'local_cafe', query: 'coffee' },
  { label: 'Hotels', icon: 'hotel', query: 'hotels' },
  { label: 'Things to do', icon: 'photo_camera', query: 'things to do' },
  { label: 'Bars', icon: 'local_bar', query: 'bars' },
  { label: 'Parks', icon: 'park', query: 'parks' },
  { label: 'Gas', icon: 'local_gas_station', query: 'gas station' },
  { label: 'EV charging', icon: 'ev_station', query: 'EV charging station' },
  { label: 'Parking', icon: 'local_parking', query: 'parking' },
  { label: 'Groceries', icon: 'local_grocery_store', query: 'grocery store' },
  { label: 'Pharmacies', icon: 'local_pharmacy', query: 'pharmacy' },
  { label: 'ATMs', icon: 'local_atm', query: 'ATM' },
]

export function CategoryChips({ active, onPick }: { active: string | null; onPick: (label: string, query: string) => void }) {
  return (
    <div className="chips-row" role="toolbar" aria-label="Search this area">
      {CATEGORIES.map((c) => (
        <button key={c.label} className={'chip' + (active === c.label ? ' on' : '')} onClick={() => onPick(c.label, c.query)}>
          <Icon name={c.icon} size={18} />
          {c.label}
        </button>
      ))}
    </div>
  )
}
