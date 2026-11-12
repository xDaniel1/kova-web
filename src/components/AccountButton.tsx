import type { User } from '@supabase/supabase-js'
import { useState } from 'react'
import { signInWithApple, signInWithGoogle, signOut } from '../lib/supabase'
import { Icon } from './Icon'
import { VERSION_LABEL } from '../lib/version'

export function AccountButton({ user, syncState, syncOn = true }: { user: User | null; syncState: 'idle' | 'syncing' | 'error'; syncOn?: boolean }) {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState<'google' | 'apple' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const connect = async (provider: 'google' | 'apple') => {
    setError(null)
    setPending(provider)
    try { await (provider === 'apple' ? signInWithApple() : signInWithGoogle()) }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not start sign-in. Please try again.'); setPending(null) }
  }
  if (!user) {
    return (
      <div className="account" onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false) }}>
        <button className="signin" aria-expanded={open} onClick={() => setOpen((o) => !o)}>Sign in</button>
        {open && <div className="account-menu" role="dialog" aria-label="Sign in to Kova Maps" aria-busy={!!pending}>
          <strong>Sign in to Kova Maps</strong>
          <span className="muted small">Sync saved places across your devices.</span>
          <button disabled={!!pending} onClick={() => void connect('google')}>{pending === 'google' ? 'Connecting to Google…' : 'Continue with Google'}</button>
          <button disabled={!!pending} onClick={() => void connect('apple')}>{pending === 'apple' ? 'Connecting to Apple…' : 'Continue with Apple'}</button>
          {error && <p className="error small" role="alert">{error}</p>}
          <span className="muted tiny version-line">Kova Maps for web {VERSION_LABEL}</span>
        </div>}
      </div>
    )
  }
  const name = (user.user_metadata?.full_name as string | undefined) ?? user.email ?? 'Account'
  const avatar = user.user_metadata?.avatar_url as string | undefined
  return (
    <div className="account">
      <button className="avatar-btn" onClick={() => setOpen((o) => !o)} aria-label={`Account: ${name}`} aria-expanded={open}>
        {avatar ? <img src={avatar} alt="" referrerPolicy="no-referrer" /> : <span>{name[0]?.toUpperCase()}</span>}
        {syncState !== 'idle' && <span className={'sync-dot ' + syncState} title={syncState === 'error' ? 'Sync failed; changes are kept on this device' : 'Syncing'} />}
      </button>
      {open && (
        <div className="account-menu">
          <strong>{name}</strong>
          {user.email && name !== user.email && <span className="muted small">{user.email}</span>}
          <span className="muted small"><Icon name={syncOn ? 'cloud_done' : 'cloud_off'} size={14} /> {syncOn ? 'Saved places sync with the iPhone app' : 'Sync is paused right now; changes stay on this device'}</span>
          <span className="muted tiny version-line">Kova Maps for web {VERSION_LABEL}</span>
          <button onClick={() => { setOpen(false); signOut() }}>Sign out</button>
        </div>
      )}
    </div>
  )
}
