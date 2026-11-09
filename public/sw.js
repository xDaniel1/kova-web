// Kova Maps service worker. Caches the app shell and static files so repeat visits start fast.
// - /assets/* are content-hashed by Vite: cache-first, the oldest are dropped past 60 entries.
// - Google Fonts and Mapbox glyphs/sprites/styles: stale-while-revalidate.
// - Pages: network-first, falling back to the cached shell when offline.
// Map tiles, search, routing and Supabase are never cached here.
const VERSION = 'kova-v1'
const SHELL = `${VERSION}-shell`
const ASSETS = `${VERSION}-assets`
const RUNTIME = `${VERSION}-runtime`

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(['/', '/favicon.svg', '/manifest.webmanifest'])).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  )
})

const isRuntime = (url) =>
  url.hostname === 'fonts.googleapis.com' ||
  url.hostname === 'fonts.gstatic.com' ||
  (url.hostname === 'api.mapbox.com' && (url.pathname.startsWith('/fonts/') || /\/styles\/v1\/mapbox\/[^/]+(\/sprite|$)/.test(url.pathname)))

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)

  if (url.origin === location.origin && url.pathname.startsWith('/assets/')) {
    e.respondWith(
      caches.open(ASSETS).then(async (c) => {
        const hit = await c.match(req)
        if (hit) return hit
        const res = await fetch(req)
        if (res.ok) {
          await c.put(req, res.clone())
          const keys = await c.keys()
          for (const k of keys.slice(0, Math.max(0, keys.length - 60))) c.delete(k)
        }
        return res
      }),
    )
    return
  }

  if (isRuntime(url)) {
    e.respondWith(
      caches.open(RUNTIME).then(async (c) => {
        const hit = await c.match(req)
        const fresh = fetch(req).then((res) => {
          if (res.ok || res.type === 'opaque') c.put(req, res.clone())
          return res
        }).catch(() => hit)
        return hit ?? fresh
      }),
    )
    return
  }

  if (req.mode === 'navigate' && url.origin === location.origin) {
    e.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone()
        if (res.ok) caches.open(SHELL).then((c) => c.put('/', copy))
        return res
      }).catch(async () => (await caches.match('/')) ?? Response.error()),
    )
  }
})
