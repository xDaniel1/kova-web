import { useState } from 'react'
import type { FavoritePlace, Place } from '../lib/types'

interface Props {
  place: Place
  favorite: FavoritePlace | undefined
  onDirections: () => void
  onToggleFavorite: () => void
  onEditFavorite: (patch: Partial<Pick<FavoritePlace, 'customTitle' | 'emoji' | 'colorHex'>>) => void
  onClose: () => void
}

// Same palette and glyph set the iOS favorites editor offers, so edits look right on both.
const COLORS = ['#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#0a84ff', '#5856d6', '#af52de', '#8e8e93']
const EMOJI = ['★', '🏠', '💼', '☕', '🍽️', '🛒', '🏋️', '🎓', '✈️', '🏥', '🌳', '❤️']

export function PlaceCard({ place, favorite, onDirections, onToggleFavorite, onEditFavorite, onClose }: Props) {
  const [editing, setEditing] = useState(false)

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      alert('Link copied')
    } catch {
      prompt('Copy this link', window.location.href)
    }
  }

  return (
    <section className="panel card">
      <div className="row-between">
        <div>
          <h1>
            {favorite?.emoji && <span className="chip-icon inline" style={{ background: favorite.colorHex ?? '#ff9500' }}>{favorite.emoji}</span>}
            {favorite?.customTitle || place.title}
          </h1>
          <p className="muted">{favorite?.customTitle ? place.title + ' · ' : ''}{place.subtitle}</p>
        </div>
        <button className="icon" onClick={onClose} aria-label="Close">✕</button>
      </div>
      <div className="actions">
        <button className="primary" onClick={onDirections}>🚗 Directions</button>
        <button onClick={onToggleFavorite}>{favorite ? '★ Saved' : '☆ Save'}</button>
        {favorite && <button onClick={() => setEditing((e) => !e)} aria-expanded={editing}>✎ Edit</button>}
        <button onClick={copyLink} aria-label="Copy link to this place">🔗 Share</button>
      </div>

      {favorite && editing && (
        <div className="fav-editor">
          <label>
            Name
            <input
              value={favorite.customTitle ?? ''}
              placeholder={place.title}
              onChange={(e) => onEditFavorite({ customTitle: e.target.value || null })}
            />
          </label>
          <div className="swatches" role="radiogroup" aria-label="Colour">
            {COLORS.map((c) => (
              <button
                key={c}
                role="radio"
                aria-checked={(favorite.colorHex ?? '#ff9500') === c}
                className={(favorite.colorHex ?? '#ff9500') === c ? 'on' : ''}
                style={{ background: c }}
                onClick={() => onEditFavorite({ colorHex: c })}
                aria-label={c}
              />
            ))}
          </div>
          <div className="swatches" role="radiogroup" aria-label="Icon">
            {EMOJI.map((e) => (
              <button
                key={e}
                role="radio"
                aria-checked={(favorite.emoji ?? '★') === e}
                className={'glyph ' + ((favorite.emoji ?? '★') === e ? 'on' : '')}
                onClick={() => onEditFavorite({ emoji: e })}
              >
                {e}
              </button>
            ))}
          </div>
        </div>
      )}

      <p className="muted small">{place.latitude.toFixed(5)}, {place.longitude.toFixed(5)}</p>
    </section>
  )
}
