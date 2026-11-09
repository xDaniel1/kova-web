import { useEffect, useState } from 'react'
import { nearbyPlaces, photoURL, toPlace, type NearbyPlace } from '../lib/google'
import type { Place } from '../lib/types'

// Same five themes as the iOS Discover shelves, assembled from top-rated nearby places.
const GUIDES = [
  { id: 'coffee', title: 'Great Coffee', emoji: '☕', types: ['coffee_shop', 'cafe'] },
  { id: 'dinner', title: 'Dinner Tonight', emoji: '🍽️', types: ['restaurant'] },
  { id: 'parks', title: 'Parks & Outdoors', emoji: '🌳', types: ['park', 'hiking_area', 'national_park'] },
  { id: 'nightlife', title: 'Nightlife', emoji: '🍸', types: ['bar', 'night_club'] },
  { id: 'arts', title: 'Arts & Culture', emoji: '🎭', types: ['museum', 'art_gallery', 'performing_arts_theater'] },
]

interface Props {
  near: { latitude: number; longitude: number } | null
  onPick: (place: Place) => void
}

export function GuidesShelf({ near, onPick }: Props) {
  const [open, setOpen] = useState<string | null>(null)
  const [places, setPlaces] = useState<NearbyPlace[] | 'loading' | 'error'>('loading')

  useEffect(() => {
    if (!open || !near) return
    const guide = GUIDES.find((g) => g.id === open)!
    let cancelled = false
    setPlaces('loading')
    nearbyPlaces(near, guide.types)
      .then((p) => !cancelled && setPlaces(p))
      .catch(() => !cancelled && setPlaces('error'))
    return () => {
      cancelled = true
    }
  }, [open, near])

  if (!near) return null
  const guide = GUIDES.find((g) => g.id === open)

  if (guide) {
    return (
      <>
        <div className="row-between">
          <h2>{guide.emoji} {guide.title}</h2>
          <button className="link" onClick={() => setOpen(null)}>Back</button>
        </div>
        {places === 'loading' && <p className="muted small">Finding places…</p>}
        {places === 'error' && <p className="muted small">Couldn't load this guide right now.</p>}
        {Array.isArray(places) && (
          <ul className="list guide-list">
            {places.map((p) => (
              <li key={p.id}>
                <button onClick={() => onPick(toPlace(p))}>
                  {p.photos?.[0] ? <img src={photoURL(p.photos[0], 200)} alt="" loading="lazy" /> : <span className="thumb-fallback">{guide.emoji}</span>}
                  <span>
                    <strong>{p.displayName?.text}</strong>
                    <small>{p.rating?.toFixed(1)} ★ ({p.userRatingCount?.toLocaleString()}) · {p.formattedAddress?.split(',')[0]}</small>
                  </span>
                </button>
              </li>
            ))}
            {places.length === 0 && <li className="muted">Nothing well-rated nearby.</li>}
          </ul>
        )}
        <p className="muted tiny">Assembled from top-rated nearby places on Google, not editorial picks.</p>
      </>
    )
  }

  return (
    <>
      <h2>Discover nearby</h2>
      <div className="guides">
        {GUIDES.map((g) => (
          <button key={g.id} className="guide-card" onClick={() => setOpen(g.id)}>
            <span className="guide-emoji">{g.emoji}</span>
            {g.title}
          </button>
        ))}
      </div>
    </>
  )
}
