import type { User } from '@supabase/supabase-js'
import { useState } from 'react'
import { signInWithGoogle, signOut } from '../lib/supabase'
import { Icon } from './Icon'
import { VERSION_LABEL } from '../lib/version'

export function AccountButton({ user, syncState, syncOn = true }: { user: User | null; syncState: 'idle' | 'syncing' | 'error'; syncOn?: boolean }) {
  const [open, setOpen] = useState(false)
  if (!user) {
    return <button className="signin" onClick={() => signInWithGoogle().catch((e) => alert(e.message))}>Sign in</button>
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
