import type { Announcement, RemoteMessage } from '../lib/remote'
import { VERSION_LABEL } from '../lib/version'
import { Icon } from './Icon'
import { LogoMark } from './Logo'

const LEVEL_ICON = { info: 'info', warning: 'warning', critical: 'error' } as const

export function UpdateRequired({ message }: { message: string }) {
  return (
    <div className="gate" role="alertdialog" aria-modal="true" aria-labelledby="gate-title">
      <div className="gate-card">
        <LogoMark size={56} />
        <h1 id="gate-title">Update required</h1>
        <p>{message || 'This version of Kova Maps is no longer supported. Reload to get the latest version.'}</p>
        <button className="gate-primary" onClick={() => window.location.reload()}><Icon name="refresh" /> Reload Kova Maps</button>
        <p className="muted small">You're on {VERSION_LABEL}</p>
      </div>
    </div>
  )
}

export function Maintenance({ message, checking, onRetry }: { message: string; checking: boolean; onRetry: () => void }) {
  return (
    <div className="gate" role="alertdialog" aria-modal="true" aria-labelledby="gate-title">
      <div className="gate-card">
        <LogoMark size={56} />
        <h1 id="gate-title">We'll be right back</h1>
        <p>{message || 'Kova Maps is down for maintenance. Please try again in a few minutes.'}</p>
        <button className="gate-primary" onClick={onRetry} disabled={checking}><Icon name="refresh" /> {checking ? 'Checking…' : 'Try again'}</button>
      </div>
    </div>
  )
}

export function AnnouncementBanner({ a, onDismiss }: { a: Announcement; onDismiss: () => void }) {
  return (
    <div className={`announce ${a.level}`} role="status">
      <Icon name={LEVEL_ICON[a.level]} fill />
      <div className="announce-text">
        {a.title && <strong>{a.title}</strong>}
        {a.body && <span>{a.body}</span>}
        {a.url && <a href={a.url} target="_blank" rel="noreferrer">Learn more</a>}
      </div>
      <button className="icon-btn small" onClick={onDismiss} aria-label="Dismiss announcement"><Icon name="close" size={18} /></button>
    </div>
  )
}

export function UpdateNudge({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div className="announce info nudge" role="status">
      <Icon name="system_update" />
      <div className="announce-text">
        <strong>A new version of Kova Maps is available</strong>
        {message && <span>{message}</span>}
      </div>
      <button className="announce-action" onClick={() => window.location.reload()}>Reload</button>
      <button className="icon-btn small" onClick={onDismiss} aria-label="Dismiss"><Icon name="close" size={18} /></button>
    </div>
  )
}

export function MessageCard({ m, onDone }: { m: RemoteMessage; onDone: () => void }) {
  return (
    <div className="message-scrim" role="dialog" aria-modal="true" aria-labelledby="msg-title">
      <div className={`message-card ${m.level}`}>
        <div className="message-icon"><Icon name={LEVEL_ICON[m.level]} fill /></div>
        <h2 id="msg-title">{m.title}</h2>
        <p>{m.body}</p>
        <div className="message-actions">
          {m.url && <a className="gate-secondary" href={m.url} target="_blank" rel="noreferrer">Learn more</a>}
          <button className="gate-primary" onClick={onDone} autoFocus>Got it</button>
        </div>
      </div>
    </div>
  )
}
