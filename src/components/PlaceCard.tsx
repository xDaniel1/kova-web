import type { Place, TravelMode } from '../lib/types'

interface Props {
  place: Place
  isFavorite: boolean
  canRoute: boolean
  onDirections: (mode: TravelMode) => void
  onToggleFavorite: () => void
  onClose: () => void
}

export function PlaceCard({ place, isFavorite, canRoute, onDirections, onToggleFavorite, onClose }: Props) {
  return (
    <section className="panel card">
      <div className="row-between">
        <div>
          <h1>{place.title}</h1>
          <p className="muted">{place.subtitle}</p>
        </div>
        <button className="icon" onClick={onClose} aria-label="Close">✕</button>
      </div>
      <div className="actions">
        <button className="primary" disabled={!canRoute} title={canRoute ? '' : 'Share your location first'} onClick={() => onDirections('driving')}>
          🚗 Directions
        </button>
        <button onClick={() => onDirections('walking')} disabled={!canRoute}>🚶 Walk</button>
        <button onClick={() => onDirections('cycling')} disabled={!canRoute}>🚲 Bike</button>
        <button onClick={onToggleFavorite}>{isFavorite ? '★ Saved' : '☆ Save'}</button>
      </div>
      <p className="muted small">
        {place.latitude.toFixed(5)}, {place.longitude.toFixed(5)}
      </p>
    </section>
  )
}
