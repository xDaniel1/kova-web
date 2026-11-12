import { roleLabel, type FavoritePatch } from '../lib/favorites'
import { useEffect, useState } from 'react'
import { lookupPlace, photoURL, type PlaceDetails } from '../lib/google'
import type { FavoritePlace, Place } from '../lib/types'
import { Icon } from './Icon'
import { PRICE, Stars, openLine } from './Stars'

interface Props {
  place: Place
  favorite: FavoritePlace | undefined
  onDirections: () => void
  onToggleFavorite: () => void
  onEditFavorite: (patch: FavoritePatch) => void
  onNearby: (place: Place) => void
  onToast: (msg: string) => void
}

const COLORS = ['#0e809c', '#2b3fa0', '#ea4335', '#fbbc04', '#34a853', '#a142f4', '#ff6d01', '#5f6368']
const EMOJI = ['★', '🏠', '💼', '☕', '🍽️', '🛒', '🏋️', '🎓', '✈️', '🏥', '🌳', '❤️']
type Tab = 'overview' | 'reviews' | 'about'

/** The full-height place panel: hero photo, name, rating, tabs, round actions, info rows. */
export function PlacePanel(p: Props) {
  const { place, favorite } = p
  const [details, setDetails] = useState<PlaceDetails | null | 'loading'>('loading')
  const [tab, setTab] = useState<Tab>('overview')
  const [showHours, setShowHours] = useState(false)
  const [editing, setEditing] = useState(false)
  const [photoIndex, setPhotoIndex] = useState(0)
  const [photoFailed, setPhotoFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    setDetails('loading')
    setTab('overview')
    setPhotoIndex(0)
    setEditing(false)
    setShowHours(false)
    setPhotoFailed(false)
    if (place.title === 'Dropped pin') {
      setDetails(null)
      return
    }
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)
    lookupPlace(place, controller.signal).then((d) => !cancelled && setDetails(d)).catch(() => !cancelled && setDetails(null)).finally(() => clearTimeout(timeout))
    return () => {
      cancelled = true
      clearTimeout(timeout)
      controller.abort()
    }
  }, [place])

  useEffect(() => setPhotoFailed(false), [photoIndex])

  const d = details === 'loading' ? null : details
  const photos = d?.photos ?? []
  const name = favorite?.customTitle || d?.displayName?.text || place.title
  const address = d?.formattedAddress || place.subtitle
  const hours = d?.currentOpeningHours
  const o = openLine(hours?.openNow, hours?.weekdayDescriptions)
  const today = (new Date().getDay() + 6) % 7

  const share = async () => {
    const url = window.location.href
    try {
      if (navigator.share) await navigator.share({ title: name, url })
      else {
        await navigator.clipboard.writeText(url)
        p.onToast('Link copied')
      }
    } catch {
      /* cancelled */
    }
  }
  const sendToPhone = async () => {
    // Opens in the iPhone app when installed (universal link), otherwise in Safari.
    const url = window.location.href
    try {
      await navigator.clipboard.writeText(url)
      p.onToast('Link copied. Open it on your phone, or AirDrop it.')
    } catch {
      window.prompt('Copy this link', url)
    }
  }
  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text)
      p.onToast(`${what} copied`)
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="panel-body place">
      {details === 'loading' ? (
        <div className="hero skeleton" />
      ) : photos.length > 0 ? (
        <div className="hero">
          <img src={photoURL(photos[photoIndex], 900)} alt={name} onError={() => setPhotoFailed(true)} style={photoFailed ? { display: 'none' } : undefined} />
          {photoFailed && <div className="photo-unavailable"><Icon name="location_on" />Photo unavailable</div>}
          {photos.length > 1 && (
            <div className="hero-nav">
              <button aria-label="Previous photo" onClick={() => setPhotoIndex((i) => (i - 1 + photos.length) % photos.length)}><Icon name="chevron_left" /></button>
              <span>{photoIndex + 1} / {photos.length}</span>
              <button aria-label="Next photo" onClick={() => setPhotoIndex((i) => (i + 1) % photos.length)}><Icon name="chevron_right" /></button>
            </div>
          )}
        </div>
      ) : null}

      <div className="place-head">
        {roleLabel(favorite?.role) && <span className="favorite-role">{roleLabel(favorite?.role)}</span>}
        <h1>{favorite?.emoji && <span className="title-emoji">{favorite.emoji}</span>}{name}</h1>
        {d?.rating !== undefined && (
          <div className="rating-line">
            <span>{d.rating.toFixed(1)}</span> <Stars rating={d.rating} /> {d.userRatingCount !== undefined && <button className="link-plain" onClick={() => setTab('reviews')}>({d.userRatingCount.toLocaleString()})</button>}
            {d.priceLevel && PRICE[d.priceLevel] && <span className="muted"> · {PRICE[d.priceLevel]}</span>}
          </div>
        )}
        <div className="muted">{d?.primaryTypeDisplayName?.text ?? (place.kind ? place.kind.replace(/_/g, ' ') : '')}</div>
        {d?.businessStatus === 'CLOSED_PERMANENTLY' && <div className="closed">Permanently closed</div>}
      </div>

      {d && (
        <div className="tabs" role="tablist">
          {(['overview', 'reviews', 'about'] as Tab[]).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
              {t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      )}

      {tab === 'overview' && (
        <>
          <div className="round-actions">
            <button className="primary" onClick={p.onDirections}><span><Icon name="directions" fill /></span>Directions</button>
            <button onClick={p.onToggleFavorite} className={favorite ? 'on' : ''}><span><Icon name="bookmark" fill={!!favorite} /></span>{favorite ? 'Saved' : 'Save'}</button>
            <button onClick={() => p.onNearby(place)}><span><Icon name="radar" /></span>Nearby</button>
            <button onClick={sendToPhone}><span><Icon name="send_to_mobile" /></span>Send to phone</button>
            <button onClick={share}><span><Icon name="share" /></span>Share</button>
          </div>

          {favorite && (
            <div className="fav-edit-row">
              <button className="link-plain" onClick={() => setEditing((e) => !e)}><Icon name="edit" size={16} /> {editing ? 'Done editing' : 'Edit saved place'}</button>
              {editing && (
                <div className="fav-editor">
                  <fieldset className="favorite-role-picker">
                    <legend>Use this place as</legend>
                    <div className="favorite-role-options">
                      {([null, 'home', 'work'] as const).map((role) => (
                        <label key={role ?? 'none'}>
                          <input type="radio" name="favorite-role" checked={role === null ? !roleLabel(favorite.role) : favorite.role === role} onChange={() => p.onEditFavorite({ role })} />
                          {roleLabel(role) ?? 'Other'}
                        </label>
                      ))}
                    </div>
                    <p className="muted small">One Home and one Work. Choosing either moves it from your previous saved place.</p>
                  </fieldset>
                  <label>Name<input value={favorite.customTitle ?? ''} placeholder={place.title} onChange={(e) => p.onEditFavorite({ customTitle: e.target.value || null })} /></label>
                  <div className="swatches" role="radiogroup" aria-label="Colour">
                    {COLORS.map((c) => (
                      <button key={c} role="radio" aria-checked={(favorite.colorHex ?? '#0e809c') === c} className={(favorite.colorHex ?? '#0e809c') === c ? 'on' : ''} style={{ background: c }} onClick={() => p.onEditFavorite({ colorHex: c })} aria-label={c} />
                    ))}
                  </div>
                  <div className="swatches" role="radiogroup" aria-label="Icon">
                    {EMOJI.map((e) => (
                      <button key={e} role="radio" aria-checked={(favorite.emoji ?? '★') === e} className={'glyph ' + ((favorite.emoji ?? '★') === e ? 'on' : '')} onClick={() => p.onEditFavorite({ emoji: e })}>{e}</button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {d?.editorialSummary && <p className="summary">{d.editorialSummary.text}</p>}

          <ul className="info-rows">
            {address && (
              <li><button onClick={() => copy(address, 'Address')} title="Copy address"><Icon name="location_on" /><span>{address}</span></button></li>
            )}
            {hours && (
              <li className="hours-row">
                <button onClick={() => setShowHours((v) => !v)} aria-expanded={showHours}>
                  <Icon name="schedule" />
                  <span><span className={o.open === undefined ? 'muted' : o.open ? 'open' : 'closed'}>{o.open === undefined ? (hours.weekdayDescriptions?.length ? 'Hours available; current status unknown' : 'Hours not provided') : o.open ? 'Open' : 'Closed'}</span>{o.text && <span> · {o.text}</span>}</span>
                  <Icon name={showHours ? 'expand_less' : 'expand_more'} className="trail" />
                </button>
                {showHours && hours.weekdayDescriptions && (
                  <table className="hours-table">
                    <tbody>
                      {hours.weekdayDescriptions.map((w, i) => {
                        const [day, ...rest] = w.split(': ')
                        return <tr key={w} className={i === today ? 'today' : ''}><td>{day}</td><td>{rest.join(': ')}</td></tr>
                      })}
                    </tbody>
                  </table>
                )}
              </li>
            )}
            {d?.websiteUri && (
              <li><a href={d.websiteUri} target="_blank" rel="noreferrer"><Icon name="public" /><span>{new URL(d.websiteUri).hostname.replace(/^www\./, '')}</span></a></li>
            )}
            {d?.internationalPhoneNumber && (
              <li><a href={`tel:${d.internationalPhoneNumber.replace(/\s/g, '')}`}><Icon name="call" /><span>{d.internationalPhoneNumber}</span></a></li>
            )}
            <li><button onClick={() => copy(`${place.latitude.toFixed(6)}, ${place.longitude.toFixed(6)}`, 'Coordinates')}><Icon name="my_location" /><span>{place.latitude.toFixed(5)}, {place.longitude.toFixed(5)}</span></button></li>
          </ul>

          {photos.length > 1 && (
            <>
              <h3 className="section-title">Photos</h3>
              <div className="photo-grid">
                {photos.slice(0, 9).map((ph, i) => (
                  <button key={ph.name} onClick={() => { setPhotoIndex(i); document.querySelector('.side-panel')?.scrollTo({ top: 0, behavior: 'smooth' }) }}>
                    <img src={photoURL(ph, 300)} alt="" loading="lazy" />
                  </button>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {tab === 'reviews' && d && (
        <div className="reviews-tab">
          {d.rating !== undefined && (
            <div className="review-summary">
              <div className="big-rating">{d.rating.toFixed(1)}</div>
              <div><Stars rating={d.rating} size={16} /><div className="muted small">{d.userRatingCount !== undefined ? `${d.userRatingCount.toLocaleString()} reviews` : 'Review count unavailable'}</div></div>
            </div>
          )}
          <ul className="reviews">
            {(d.reviews ?? []).map((r, i) => (
              <li key={i}>
                <div className="review-head">
                  {r.authorAttribution?.photoUri ? <img src={r.authorAttribution.photoUri} alt="" referrerPolicy="no-referrer" /> : <span className="avatar">{(r.authorAttribution?.displayName ?? '?')[0]}</span>}
                  <div><strong>{r.authorAttribution?.displayName ?? 'Anonymous'}</strong></div>
                </div>
                <div><Stars rating={r.rating} size={12} /> <span className="muted small">{r.relativePublishTimeDescription}</span></div>
                {r.text?.text && <p>{r.text.text}</p>}
              </li>
            ))}
            {(d.reviews ?? []).length === 0 && <li className="muted">No reviews available for this place.</li>}
          </ul>
          {d.googleMapsUri && <a className="link-plain pad" href={d.googleMapsUri} target="_blank" rel="noreferrer">More reviews on Google</a>}
        </div>
      )}

      {tab === 'about' && d && (
        <div className="about-tab">
          {d.editorialSummary && <p className="summary">{d.editorialSummary.text}</p>}
          <ul className="info-rows">
            {d.primaryTypeDisplayName && <li><span className="row"><Icon name="category" /><span>{d.primaryTypeDisplayName.text}</span></span></li>}
            {address && <li><span className="row"><Icon name="location_on" /><span>{address}</span></span></li>}
            {hours?.weekdayDescriptions && (
              <li>
                <table className="hours-table open-always">
                  <tbody>{hours.weekdayDescriptions.map((w, i) => { const [day, ...rest] = w.split(': '); return <tr key={w} className={i === today ? 'today' : ''}><td>{day}</td><td>{rest.join(': ')}</td></tr> })}</tbody>
                </table>
              </li>
            )}
          </ul>
        </div>
      )}

      {details === null && place.title !== 'Dropped pin' && <p className="muted small pad">Limited place details here. Directions, saving and coordinate sharing are still available.</p>}
      {details !== 'loading' && <a className="link-plain pad" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${place.latitude},${place.longitude}`)}`} target="_blank" rel="noreferrer">Open this location in Google Maps</a>}
      {d && <p className="muted tiny pad">Place details and photos from Google.</p>}
    </div>
  )
}
