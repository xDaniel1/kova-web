import { useCallback, useEffect, useRef, useState } from 'react'
import {
  announcementKey, announcementLive, effectiveAnnouncement, cacheConfig, cachedConfig, dismissAnnouncement, dismissUpdate, dismissedAnnouncement,
  dismissedUpdate, fetchConfig, fetchMessages, markSeen, recordRead, reportClient, requiresUpdate, seenMessages, updateAvailable,
  type RemoteConfig, type RemoteMessage,
} from '../lib/remote'

/**
 * Kova Tower's controls for the web app. Renders immediately from the cached config (or the
 * all-on defaults) and applies fresh values when they arrive. Refetches when the tab becomes
 * visible, at most every 30 seconds.
 */
export function useRemoteControls(userID: string | null) {
  const [config, setConfig] = useState<RemoteConfig>(cachedConfig)
  const [messages, setMessages] = useState<RemoteMessage[]>([])
  const [annDismissed, setAnnDismissed] = useState<string | null>(dismissedAnnouncement)
  const [updDismissed, setUpdDismissed] = useState<string | null>(dismissedUpdate)
  const [checking, setChecking] = useState(false)
  const last = useRef(0)
  const reported = useRef(false)

  const refresh = useCallback(async (force = false) => {
    if (!force && Date.now() - last.current < 30_000) return
    last.current = Date.now()
    setChecking(true)
    // Independent: one failing never blocks the other.
    const [cfg, msgs] = await Promise.all([fetchConfig(), fetchMessages()])
    if (cfg) {
      setConfig(cfg)
      cacheConfig(cfg)
    }
    if (msgs) {
      const seen = new Set(seenMessages())
      setMessages(msgs.filter((m) => !seen.has(m.id)))
    }
    setChecking(false)
    if (!reported.current) {
      reported.current = true
      void reportClient()
    }
  }, [])

  useEffect(() => {
    void refresh(true)
    const onVisible = () => document.visibilityState === 'visible' && void refresh()
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [refresh])

  // Signing in or out changes which messages are addressed to us.
  useEffect(() => {
    void refresh(true)
  }, [userID, refresh])

  const ann = effectiveAnnouncement(config)
  return {
    config,
    checking,
    refresh,
    updateRequired: requiresUpdate(config),
    maintenance: config.maintenance.enabled,
    updateNudge: updateAvailable(config) && config.latestVersion.web !== updDismissed,
    announcement: announcementLive(ann) && announcementKey(ann) !== annDismissed ? ann : null,
    message: messages[0] ?? null,
    dismissAnnouncement: () => {
      dismissAnnouncement(ann)
      setAnnDismissed(announcementKey(ann))
    },
    dismissUpdate: () => {
      if (!config.latestVersion.web) return
      dismissUpdate(config.latestVersion.web)
      setUpdDismissed(config.latestVersion.web)
    },
    readMessage: (m: RemoteMessage) => {
      markSeen(m.id)
      setMessages((all) => all.filter((x) => x.id !== m.id))
      if (userID) void recordRead(m.id, userID)
    },
  }
}
