import { useEffect, useState } from 'react'
import { lookupPlace, photoURL, type PlaceDetails as Details } from '../lib/google'
import type { Place } from '../lib/types'

interface Props {
  place: Place
  onAddress?: (address: string) => void
}

const PRICE: Record<string, string> = {
  PRICE_LEVEL_INEXPENSIVE: '$',
  PRICE_LEVEL_MODERATE: '$$',
  PRICE_LEVEL_EXPENSIVE: '$$$',
  PRICE_LEVEL_VERY_EXPENSIVE: '$$$$',
}

function Stars({ rating }: { rating: number }) {
  return (
    <span className="stars" aria-label={`${rating} out of 5`}>
      {'★★★★★'.slice(0, Math.round(rating))}
      <span className="dim">{'★★★★★'.slice(Math.round(rating))}</span>
    </span>
  )
}

/** Photos, rating, hours, phone, website and reviews from Google, via the Edge Function. */
export function PlaceDetails({ place, onAddress }: Props) {
  const [details, setDetails] = useState<Details | null | 'loading' | 'error'>('loading')
  const [showHours, setShowHours] = useState(false)
  const [showReviews, setShowReviews] = useState(false)

  useEffect(() => {
    let cancelled = false
    setDetails('loading')
    lookupPlace(place)
      .then((d) => {
        if (cancelled) return
        setDetails(d)
        if (d?.formattedAddress) onAddress?.(d.formattedAddress)
      })
      .catch(() => !cancelled && setDetails('error'))
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [place])

  if (details === 'loading') return <p className="muted small">Loading details…</p>
  if (details === 'error') return <p className="muted small">Details unavailable right now.</p>
  if (!details) return null

  const photos = details.photos?.slice(0, 6) ?? []
  const hours = details.currentOpeningHours
  const today = (new Date().getDay() + 6) % 7 // weekdayDescriptions start on Monday
  const host = details.websiteUri ? new URL(details.websiteUri).hostname.replace(/^www\./, '') : null

  return (
    <div className="details">
      {photos.length > 0 && (
        <div className="photos">
          {photos.map((p) => (
            <a key={p.name} href={photoURL(p, 1600)} target="_blank" rel="noreferrer">
              <img src={photoURL(p, 400)} alt="" loading="lazy" />
            </a>
          ))}
        </div>
      )}

      <div className="facts">
        {details.rating !== undefined && (
          <span>
            <strong>{details.rating.toFixed(1)}</strong> <Stars rating={details.rating} />
            <span className="muted"> ({details.userRatingCount?.toLocaleString()})</span>
          </span>
        )}
        {details.priceLevel && PRICE[details.priceLevel] && <span className="muted">{PRICE[details.priceLevel]}</span>}
        {details.primaryTypeDisplayName && <span className="muted">{details.primaryTypeDisplayName.text}</span>}
        {details.businessStatus === 'CLOSED_PERMANENTLY' && <span className="error">Permanently closed</span>}
      </div>

      {details.editorialSummary && <p className="summary">{details.editorialSummary.text}</p>}

      {hours && (
        <div className="fact-row">
          <button className="link" onClick={() => setShowHours((v) => !v)} aria-expanded={showHours}>
            <span className={hours.openNow ? 'open' : 'closed'}>{hours.openNow ? 'Open' : 'Closed'}</span>
            {hours.weekdayDescriptions && <span className="muted"> · {hours.weekdayDescriptions[today]?.replace(/^[A-Za-z]+: /, '')}</span>}
            <span className="muted"> {showHours ? '▴' : '▾'}</span>
          </button>
          {showHours && hours.weekdayDescriptions && (
            <ul className="hours">
              {hours.weekdayDescriptions.map((d, i) => (
                <li key={d} className={i === today ? 'today' : ''}>{d}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {details.internationalPhoneNumber && (
        <div className="fact-row">📞 <a href={`tel:${details.internationalPhoneNumber.replace(/\s/g, '')}`}>{details.internationalPhoneNumber}</a></div>
      )}
      {host && details.websiteUri && (
        <div className="fact-row">🌐 <a href={details.websiteUri} target="_blank" rel="noreferrer">{host}</a></div>
      )}

      {details.reviews && details.reviews.length > 0 && (
        <div className="fact-row">
          <button className="link" onClick={() => setShowReviews((v) => !v)} aria-expanded={showReviews}>
            {details.reviews.length} reviews {showReviews ? '▴' : '▾'}
          </button>
          {showReviews && (
            <ul className="reviews">
              {details.reviews.map((r, i) => (
                <li key={i}>
                  <div className="row-between">
                    <strong>{r.authorAttribution?.displayName ?? 'Anonymous'}</strong>
                    <small className="muted">{r.relativePublishTimeDescription}</small>
                  </div>
                  <Stars rating={r.rating} />
                  {r.text?.text && <p>{r.text.text}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <p className="muted tiny">Place details and photos from Google.</p>
    </div>
  )
}
