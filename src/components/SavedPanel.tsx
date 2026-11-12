import { roleLabel, sortedFavorites } from '../lib/favorites'
import type { FavoritePlace, RecentSearch } from '../lib/types'
import { Icon } from './Icon'
import { VERSION_LABEL } from '../lib/version'

export function SavedPanel({ favorites, signedIn, onPick, onRemove }: { favorites: FavoritePlace[]; signedIn: boolean; onPick: (f: FavoritePlace) => void; onRemove: (f: FavoritePlace) => void }) {
  return (
    <div className="panel-body">
      <h2 className="results-title">Saved</h2>
      <p className="muted small results-sub">{signedIn ? 'Synced with the Kova Maps iPhone app' : 'Kept on this device. Sign in to sync with your iPhone.'}</p>
      {favorites.length === 0 && <p className="muted pad">Places you save appear here. Open a place and tap Save.</p>}
      <ul className="results">
        {sortedFavorites(favorites).map((f) => (
          <li key={f.id}>
            <button className="result" onClick={() => onPick(f)}>
              <span className="sug-icon fav" style={{ background: f.colorHex ?? undefined }}>{f.emoji ?? <Icon name={f.role === 'home' ? 'home' : f.role === 'work' ? 'work' : 'star'} fill />}</span>
              <div className="result-text"><strong>{f.customTitle || f.title}</strong>{roleLabel(f.role) && <span className="favorite-role">{roleLabel(f.role)}</span>}<span className="muted">{f.subtitle}</span></div>
            </button>
            <button className="result-dir" onClick={() => onRemove(f)} aria-label={`Remove ${f.title}`} title="Remove"><Icon name="delete" /></button>
          </li>
        ))}
      </ul>
      <p className="muted tiny pad version-line">Kova Maps for web {VERSION_LABEL}</p>
    </div>
  )
}

export function RecentsPanel({ recents, onPick, onClear }: { recents: RecentSearch[]; onPick: (r: RecentSearch) => void; onClear: () => void }) {
  return (
    <div className="panel-body">
      <div className="row-between pad-x">
        <h2 className="results-title">Recents</h2>
        {recents.length > 0 && <button className="link-plain" onClick={onClear}>Clear all</button>}
      </div>
      {recents.length === 0 && <p className="muted pad">Places you look at appear here.</p>}
      <ul className="results">
        {recents.map((r) => (
          <li key={r.id}>
            <button className="result" onClick={() => onPick(r)}>
              <span className="sug-icon"><Icon name="history" /></span>
              <div className="result-text"><strong>{r.title}</strong><span className="muted">{r.subtitle}</span><span className="muted small">{new Date(r.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span></div>
            </button>
          </li>
        ))}
      </ul>
      <p className="muted tiny pad version-line">Kova Maps for web {VERSION_LABEL}</p>
    </div>
  )
}
