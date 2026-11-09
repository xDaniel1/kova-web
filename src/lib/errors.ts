import { supabase } from './supabase'

// Browser error reporting into public.client_errors (insert-only; admins read it in Tower).
// Deduped per message per session and capped so a render loop can't flood the table.

const seen = new Set<string>()
let budget = 10

export async function reportError(message: string, stack?: string): Promise<void> {
  const key = message.slice(0, 200)
  if (seen.has(key) || budget <= 0) return
  seen.add(key)
  budget--
  try {
    const { data } = await supabase.auth.getSession()
    await supabase.from('client_errors').insert({
      app: 'web',
      message: message.slice(0, 2000),
      stack: stack?.slice(0, 8000) ?? null,
      url: window.location.href.slice(0, 2000),
      user_agent: navigator.userAgent.slice(0, 500),
      user_id: data.session?.user.id ?? null,
    })
  } catch {
    // Never let error reporting cause an error.
  }
}

export function installErrorReporting(): void {
  if (import.meta.env.DEV) return
  window.addEventListener('error', (e) => reportError(e.message || 'Unknown error', e.error?.stack))
  window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason
    reportError(reason instanceof Error ? reason.message : String(reason), reason instanceof Error ? reason.stack : undefined)
  })
}
