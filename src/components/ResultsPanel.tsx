import { photoURL, type NearbyPlace } from '../lib/google'
import { Icon } from './Icon'
import { PRICE, Stars, openLine } from './Stars'

interface Props {
  title: string
  results: NearbyPlace[] | 'loading' | 'error'
  hovered: string | null
  onHover: (id: string | null) => void
  onPick: (p: NearbyPlace) => void
  onDirections: (p: NearbyPlace) => void
}

/** Google-style results list: name, rating, category, address, open status, thumbnail. */
export function ResultsPanel({ title, results, hovered, onHover, onPick, onDirections }: Props) {
  return (
    <div className="panel-body">
      <h2 className="results-title">Results</h2>
      <p className="muted small results-sub">{title}</p>
      {results === 'loading' && <div className="loading-rows">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton" />)}</div>}
      {results === 'error' && <p className="muted pad">Couldn't search right now. Try again in a moment.</p>}
      {Array.isArray(results) && results.length === 0 && <p className="muted pad">No results in this area. Try zooming out.</p>}
      {Array.isArray(results) && (
        <ul className="results">
          {results.map((r) => {
            const o = openLine(r.currentOpeningHours?.openNow, r.currentOpeningHours?.weekdayDescriptions)
            return (
              <li key={r.id} className={hovered === r.id ? 'hover' : ''} onMouseEnter={() => onHover(r.id)} onMouseLeave={() => onHover(null)}>
                <button className="result" onClick={() => onPick(r)}>
                  <div className="result-text">
                    <strong>{r.displayName?.text}</strong>
                    {r.rating !== undefined && (
                      <span className="rating-line">
                        {r.rating.toFixed(1)} <Stars rating={r.rating} size={12} /> <span className="muted">({r.userRatingCount?.toLocaleString()})</span>
                        {r.priceLevel && PRICE[r.priceLevel] && <span className="muted"> · {PRICE[r.priceLevel]}</span>}
                      </span>
                    )}
                    <span className="muted">{[r.primaryTypeDisplayName?.text, r.shortFormattedAddress].filter(Boolean).join(' · ')}</span>
                    {o.open !== undefined && (
                      <span><span className={o.open ? 'open' : 'closed'}>{o.open ? 'Open' : 'Closed'}</span>{o.text && <span className="muted"> · {o.text}</span>}</span>
                    )}
                  </div>
                  {r.photos?.[0] && <img className="result-thumb" src={photoURL(r.photos[0], 240)} alt="" loading="lazy" />}
                </button>
                <button className="result-dir" onClick={() => onDirections(r)} aria-label={`Directions to ${r.displayName?.text}`} title="Directions">
                  <Icon name="directions" />
                </button>
              </li>
            )
          })}
        </ul>
      )}
      <p className="muted tiny pad">Results and photos from Google.</p>
    </div>
  )
}
