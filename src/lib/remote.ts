import { config as appConfig } from './config'
import { supabase } from './supabase'
import { APP_BUILD, APP_VERSION } from './version'

// Kova Tower's remote controls, per kova-admin docs/app-controls-contract.md. Mirrors the iOS
// RemoteConfig.swift. Every failure means "the app works normally": only an explicit, well-formed
// value can take something away.

export type Level = 'info' | 'warning' | 'critical'

export interface Announcement {
  enabled: boolean
  title: string
  body: string
  level: Level
  url: string | null
  startsAt: string | null
  endsAt: string | null
}

export interface RemoteConfig {
  maintenance: { enabled: boolean; message: string }
  minimumVersion: { web: string | null; message: string }
  latestVersion: { web: string | null; message: string; storeURL: string | null }
  features: { indoorMaps: boolean; trafficReports: boolean; feedback: boolean; incidentFeeds: boolean; sync: boolean }
  announcement: Announcement
}

export interface RemoteMessage {
  id: string
  title: string
  body: string
  level: Level
  url: string | null
  createdAt: string
}

export const NORMAL: RemoteConfig = {
  maintenance: { enabled: false, message: '' },
  minimumVersion: { web: null, message: '' },
  latestVersion: { web: null, message: '', storeURL: null },
  features: { indoorMaps: true, trafficReports: true, feedback: true, incidentFeeds: true, sync: true },
  announcement: { enabled: false, title: '', body: '', level: 'info', url: null, startsAt: null, endsAt: null },
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback)
const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback)
const level = (v: unknown): Level => (v === 'warning' || v === 'critical' ? v : 'info')
const version = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)
export function webURL(v: unknown): string | null {
  if (typeof v !== 'string') return null
  try {
    const u = new URL(v)
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null
  } catch {
    return null
  }
}
const isoDate = (v: unknown): string | null => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? v : null)

/** Builds a config from `[{key, value}]` rows. Unknown keys are ignored; each key decodes alone. */
export function parseConfig(rows: unknown): RemoteConfig | null {
  if (!Array.isArray(rows)) return null
  const c: RemoteConfig = structuredClone(NORMAL)
  for (const row of rows) {
    if (!isObj(row) || typeof row.key !== 'string' || !isObj(row.value)) continue
    const v = row.value
    switch (row.key) {
      case 'maintenance':
        c.maintenance = { enabled: v.enabled === true, message: str(v.message) }
        break
      case 'min_version':
        c.minimumVersion = { web: version(v.web), message: str(v.message) }
        break
      case 'latest_version':
        c.latestVersion = { web: version(v.web), message: str(v.message), storeURL: webURL(isObj(v.store_urls) ? v.store_urls.web : null) }
        break
      case 'features':
        c.features = {
          indoorMaps: bool(v.indoor_maps, true),
          trafficReports: bool(v.traffic_reports, true),
          feedback: bool(v.feedback, true),
          incidentFeeds: bool(v.incident_feeds, true),
          sync: bool(v.sync, true),
        }
        break
      case 'announcement':
        c.announcement = {
          enabled: v.enabled === true,
          title: str(v.title),
          body: str(v.body),
          level: level(v.level),
          url: webURL(v.url),
          startsAt: isoDate(v.starts_at),
          endsAt: isoDate(v.ends_at),
        }
        break
    }
  }
  return c
}

export function parseMessages(rows: unknown): RemoteMessage[] {
  if (!Array.isArray(rows)) return []
  return rows
    .filter(isObj)
    .filter((r) => typeof r.id === 'string' && typeof r.title === 'string' && typeof r.body === 'string')
    .map((r) => ({
      id: r.id as string,
      title: r.title as string,
      body: r.body as string,
      level: level(r.level),
      url: webURL(r.url),
      createdAt: isoDate(r.created_at) ?? '1970-01-01T00:00:00Z',
    }))
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
}

function parts(s: string): number[] | null {
  const p = s.trim().split('.')
  if (!p.length || p.some((x) => !/^\d+$/.test(x))) return null
  return p.map(Number)
}

/** Dotted-integer comparison; anything unparseable is never "below". */
export function isVersionBelow(current: string, target: string): boolean {
  const c = parts(current)
  const t = parts(target)
  if (!c || !t) return false
  for (let i = 0; i < Math.max(c.length, t.length); i++) {
    const a = c[i] ?? 0
    const b = t[i] ?? 0
    if (a !== b) return a < b
  }
  return false
}

export function requiresUpdate(cfg: RemoteConfig, current = APP_VERSION): boolean {
  return !!cfg.minimumVersion.web && isVersionBelow(current, cfg.minimumVersion.web)
}

export function updateAvailable(cfg: RemoteConfig, current = APP_VERSION): boolean {
  return !!cfg.latestVersion.web && !requiresUpdate(cfg, current) && isVersionBelow(current, cfg.latestVersion.web)
}

export type Feature = keyof RemoteConfig['features']
/** Whether a network feature may run. Maintenance pauses all of them. */
export function allows(cfg: RemoteConfig, feature: Feature): boolean {
  return !cfg.maintenance.enabled && cfg.features[feature]
}

export function announcementLive(a: Announcement, now = Date.now()): boolean {
  if (!a.enabled || (!a.title && !a.body)) return false
  if (a.startsAt && now < Date.parse(a.startsAt)) return false
  if (a.endsAt && now >= Date.parse(a.endsAt)) return false
  return true
}

export const announcementKey = (a: Announcement) => `${a.title}|${a.body}|${a.startsAt ?? ''}`

// ---- storage (every access guarded; a blocked localStorage must not break the app)
const K = { config: 'kova.remoteConfig.v1', seen: 'kova.remoteConfig.seenMessages', ann: 'kova.remoteConfig.dismissedAnnouncement', upd: 'kova.remoteConfig.dismissedUpdate', install: 'kova.installID' }
function get(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
function put(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* ignore */
  }
}

export function cachedConfig(): RemoteConfig {
  try {
    const raw = get(K.config)
    if (raw) return { ...structuredClone(NORMAL), ...(JSON.parse(raw) as RemoteConfig) }
  } catch {
    /* fall through */
  }
  return structuredClone(NORMAL)
}
export const cacheConfig = (c: RemoteConfig) => put(K.config, JSON.stringify(c))
export const seenMessages = (): string[] => {
  try {
    return JSON.parse(get(K.seen) ?? '[]') as string[]
  } catch {
    return []
  }
}
export const markSeen = (id: string) => put(K.seen, JSON.stringify([...seenMessages().filter((x) => x !== id), id].slice(-500)))
export const dismissedAnnouncement = () => get(K.ann)
export const dismissAnnouncement = (a: Announcement) => put(K.ann, announcementKey(a))
export const dismissedUpdate = () => get(K.upd)
export const dismissUpdate = (v: string) => put(K.upd, v)

export function installID(): string {
  const existing = get(K.install)
  if (existing) return existing
  const id = crypto.randomUUID()
  put(K.install, id)
  return id
}

// ---- network
const REST = `${appConfig.supabase.url}/rest/v1`

async function headers(): Promise<Record<string, string>> {
  let token = appConfig.supabase.anonKey
  try {
    const { data } = await supabase.auth.getSession()
    if (data.session?.access_token) token = data.session.access_token
  } catch {
    /* anon */
  }
  return { apikey: appConfig.supabase.anonKey, Authorization: `Bearer ${token}` }
}

async function getJSON(path: string): Promise<unknown> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 8000)
  try {
    const res = await fetch(`${REST}${path}`, { headers: await headers(), signal: ctrl.signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

export async function fetchConfig(): Promise<RemoteConfig | null> {
  try {
    return parseConfig(await getJSON('/app_config?select=key,value'))
  } catch {
    return null
  }
}

export async function fetchMessages(): Promise<RemoteMessage[] | null> {
  try {
    return parseMessages(await getJSON('/app_messages?select=id,title,body,level,url,created_at&limit=20'))
  } catch {
    return null
  }
}

export async function recordRead(messageID: string, userID: string): Promise<void> {
  try {
    await fetch(`${REST}/app_message_reads`, {
      method: 'POST',
      headers: { ...(await headers()), 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ message_id: messageID, user_id: userID }),
    })
  } catch {
    /* 409 / 23505 and network errors are all fine */
  }
}

export async function reportClient(): Promise<void> {
  // Automated browsers (Playwright end-to-end runs, Lighthouse, crawlers) are not installs.
  if (typeof navigator !== 'undefined' && navigator.webdriver) return
  try {
    const ua = navigator.userAgent
    const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : /Firefox\//.test(ua) ? 'Firefox' : 'Browser'
    const os = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : 'Web'
    await fetch(`${REST}/rpc/report_client`, {
      method: 'POST',
      headers: { ...(await headers()), 'Content-Type': 'application/json' },
      body: JSON.stringify({ install_id: installID(), platform: 'web', app_version: APP_VERSION, build: APP_BUILD.slice(0, 32), os_version: `${browser} on ${os}`.slice(0, 64) }),
    })
  } catch {
    /* fire and forget */
  }
}
