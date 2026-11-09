import type { User } from '@supabase/supabase-js'
import { signInWithApple, signInWithGoogle, signOut } from '../lib/supabase'

interface Props {
  user: User | null
  syncState: 'idle' | 'syncing' | 'error'
}

export function AccountMenu({ user, syncState }: Props) {
  if (!user) {
    return (
      <div className="account">
        <button onClick={() => signInWithGoogle().catch((e) => alert(e.message))}>Sign in with Google</button>
        <button onClick={() => signInWithApple().catch((e) => alert(e.message))}>Sign in with Apple</button>
      </div>
    )
  }
  const label = user.email ?? user.user_metadata?.full_name ?? 'Signed in'
  return (
    <div className="account">
      <span className="muted small" title={syncState === 'error' ? 'Sync failed; changes are kept on this device' : ''}>
        {syncState === 'syncing' ? 'Syncing…' : syncState === 'error' ? 'Sync error' : label}
      </span>
      <button onClick={() => signOut()}>Sign out</button>
    </div>
  )
}
