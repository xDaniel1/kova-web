import type { User } from '@supabase/supabase-js'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AccountMenu } from './components/AccountMenu'
import { DirectionsPanel } from './components/DirectionsPanel'
import { MapView } from './components/MapView'
import { PlaceCard } from './components/PlaceCard'
import { ReportsControl } from './components/ReportsControl'
import { SearchPanel } from './components/SearchPanel'
import { useGeolocation } from './hooks/useGeolocation'
import { config } from './lib/config'
import { reverseGeocode } from './lib/geocode'
import { deleteReport, fetchReports, fileReport, flagReport, type Bounds, type ReportKind, type TrafficReport } from './lib/reports'
import { fetchRoutes } from './lib/routing'
import { supabase } from './lib/supabase'
import { fetchRemote, loadLocal, pushRemote, reconcile, saveLocal, type Snapshot } from './lib/sync'
import { newUUID, type FavoritePlace, type Place, type RecentSearch, type Route, type TravelMode } from './lib/types'
import { decodeView, encodeView, type Stop } from './lib/url'

type Mode =
  | { kind: 'browse' }
  | { kind: 'place'; place: Place }
  | { kind: 'directions'; stops: Stop[]; travel: TravelMode; returnTo: Place | null }

const samePoint = (a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) =>
  Math.abs(a.latitude - b.latitude) < 1e-6 && Math.abs(a.longitude - b.longitude) < 1e-6

function initialMode(): Mode {
  const v = decodeView(window.location.search)
  if (v.directions) return { kind: 'directions', stops: v.directions.stops, travel: v.directions.mode, returnTo: null }
  if (v.place) return { kind: 'place', place: v.place }
  return { kind: 'browse' }
}

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [snapshot, setSnapshot] = useState<Snapshot>(() => loadLocal())
  const [syncState, setSyncState] = useState<'idle' | 'syncing' | 'error'>('idle')
  const [mode, setMode] = useState<Mode>(initialMode)
  const [routes, setRoutes] = useState<Route[]>([])
  const [selectedRoute, setSelectedRoute] = useState(0)
  const [routeBusy, setRouteBusy] = useState(false)
  const [routeError, setRouteError] = useState<string | null>(null)
  const [flyTo, setFlyTo] = useState<{ latitude: number; longitude: number; zoom?: number } | null>(() => {
    const m = initialMode()
    return m.kind === 'place' ? { latitude: m.place.latitude, longitude: m.place.longitude, zoom: 15 } : null
  })
  const geo = useGeolocation()
  const pushTimer = useRef<number | null>(null)
  const [reports, setReports] = useState<TrafficReport[]>([])
  const [arming, setArming] = useState<ReportKind | null>(null)
  const [bounds, setBounds] = useState<Bounds | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const notify = useCallback((msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast((t) => (t === msg ? null : t)), 3000)
  }, [])

  // Traffic reports: signed-in users see everyone's recent reports in view. Refresh on pan and every minute.
  const reloadReports = useCallback(() => {
    if (!user || !bounds) {
      setReports([])
      return
    }
    fetchReports(bounds).then(setReports).catch(() => {})
  }, [user, bounds])
  useEffect(() => {
    reloadReports()
    const t = window.setInterval(reloadReports, 60_000)
    return () => window.clearInterval(t)
  }, [reloadReports])

  // Keep the address bar in step with the view, and follow back/forward.
  useEffect(() => {
    const search = encodeView(
      mode.kind === 'directions'
        ? { directions: { stops: mode.stops.filter((s) => s.kind === 'me' || Number.isFinite(s.place.latitude)), mode: mode.travel } }
        : mode.kind === 'place'
          ? { place: mode.place }
          : {},
    )
    if (search !== window.location.search) history.pushState(null, '', window.location.pathname + search)
  }, [mode])
  useEffect(() => {
    const onPop = () => {
      setRoutes([])
      setMode(initialMode())
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  // Auth session.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user ?? null))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => setUser(session?.user ?? null))
    return () => sub.subscription.unsubscribe()
  }, [])

  // Pull the remote snapshot on sign-in, merge newest-wins, and push if local was newer.
  useEffect(() => {
    if (!user) return
    let cancelled = false
    setSyncState('syncing')
    fetchRemote(user.id)
      .then(async (remote) => {
        if (cancelled) return
        const local = loadLocal()
        const merged = reconcile(local, remote)
        setSnapshot(merged)
        saveLocal(merged)
        if (merged === local && (!remote || local.updatedAt !== remote.updatedAt)) await pushRemote(user.id, local)
        setSyncState('idle')
      })
      .catch(() => !cancelled && setSyncState('error'))
    return () => {
      cancelled = true
    }
  }, [user])

  const commit = useCallback(
    (update: (s: Snapshot) => Partial<Snapshot>) => {
      setSnapshot((prev) => {
        const next: Snapshot = { ...prev, ...update(prev), updatedAt: new Date().toISOString() }
        saveLocal(next)
        if (user) {
          if (pushTimer.current) window.clearTimeout(pushTimer.current)
          pushTimer.current = window.setTimeout(() => {
            setSyncState('syncing')
            pushRemote(user.id, next)
              .then(() => setSyncState('idle'))
              .catch(() => setSyncState('error'))
          }, 800)
        }
        return next
      })
    },
    [user],
  )

  const addRecent = useCallback(
    (place: Place) => {
      commit((s) => {
        const entry: RecentSearch = {
          id: newUUID(),
          title: place.title,
          subtitle: place.subtitle,
          latitude: place.latitude,
          longitude: place.longitude,
          date: new Date().toISOString(),
        }
        return { recents: [entry, ...s.recents.filter((r) => !samePoint(r, place))].slice(0, 20) }
      })
    },
    [commit],
  )

  const pick = useCallback(
    (place: Place) => {
      setRoutes([])
      setMode({ kind: 'place', place })
      setFlyTo({ latitude: place.latitude, longitude: place.longitude, zoom: 15 })
      addRecent(place)
    },
    [addRecent],
  )

  const onMapClick = useCallback(
    async (latitude: number, longitude: number) => {
      if (arming && user) {
        const kind = arming
        setArming(null)
        try {
          await fileReport(user.id, kind, latitude, longitude)
          notify(`${kind} reported. Thanks for helping other drivers.`)
          reloadReports()
        } catch (e) {
          notify((e as Error).message.includes('policy') ? 'Your account cannot file reports.' : 'Could not file the report.')
        }
        return
      }
      if (mode.kind === 'directions') return
      const pin: Place = { title: 'Dropped pin', subtitle: `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`, latitude, longitude }
      setMode({ kind: 'place', place: pin })
      try {
        const named = await reverseGeocode(latitude, longitude)
        setMode((m) => (m.kind === 'place' && m.place === pin ? { kind: 'place', place: named } : m))
      } catch {
        // Keep the coordinate label.
      }
    },
    [mode.kind, arming, user, notify, reloadReports],
  )

  const selected = mode.kind === 'place' ? mode.place : null
  const favoriteOf = useMemo(
    () => (p: Place | null): FavoritePlace | undefined => (p ? snapshot.favorites.find((f) => samePoint(f, p)) : undefined),
    [snapshot.favorites],
  )

  const toggleFavorite = () => {
    if (!selected) return
    const existing = favoriteOf(selected)
    commit((s) => ({
      favorites: existing
        ? s.favorites.filter((f) => f.id !== existing.id)
        : [...s.favorites, { id: newUUID(), title: selected.title, subtitle: selected.subtitle, latitude: selected.latitude, longitude: selected.longitude }],
    }))
  }

  const editFavorite = (patch: Partial<Pick<FavoritePlace, 'customTitle' | 'emoji' | 'colorHex'>>) => {
    const existing = favoriteOf(selected)
    if (!existing) return
    commit((s) => ({ favorites: s.favorites.map((f) => (f.id === existing.id ? { ...f, ...patch } : f)) }))
  }

  // Resolve stops to coordinates; "me" needs a location fix.
  const needsFix = mode.kind === 'directions' && mode.stops.some((s) => s.kind === 'me')
  useEffect(() => {
    if (needsFix && !geo.fix && !geo.busy && !geo.error) geo.locate()
  }, [needsFix, geo])

  const resolvedStops: Place[] | null = useMemo(() => {
    if (mode.kind !== 'directions') return null
    const out: Place[] = []
    for (const s of mode.stops) {
      if (s.kind === 'me') {
        if (!geo.fix) return null
        out.push({ title: 'My location', subtitle: '', latitude: geo.fix.latitude, longitude: geo.fix.longitude })
      } else {
        if (!Number.isFinite(s.place.latitude)) return null
        out.push(s.place)
      }
    }
    return out.length >= 2 ? out : null
  }, [mode, geo.fix])

  // Routing: re-run whenever the resolved stops or travel mode change.
  const travel = mode.kind === 'directions' ? mode.travel : null
  useEffect(() => {
    if (!resolvedStops || !travel) return
    const controller = new AbortController()
    setRouteBusy(true)
    setRouteError(null)
    fetchRoutes(resolvedStops, travel, controller.signal)
      .then((r) => {
        if (controller.signal.aborted) return
        setRoutes(r)
        setSelectedRoute(0)
      })
      .catch((e) => {
        if (controller.signal.aborted) return
        setRoutes([])
        setRouteError((e as Error).message)
      })
      .finally(() => !controller.signal.aborted && setRouteBusy(false))
    return () => controller.abort()
  }, [resolvedStops, travel])

  const startDirections = () => {
    if (mode.kind !== 'place') return
    setMode({ kind: 'directions', stops: [{ kind: 'me' }, { kind: 'place', place: mode.place }], travel: 'driving', returnTo: mode.place })
  }

  useEffect(() => {
    if (geo.fix && mode.kind === 'browse') setFlyTo({ latitude: geo.fix.latitude, longitude: geo.fix.longitude, zoom: 14 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geo.fix])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && mode.kind !== 'browse') {
        setRoutes([])
        setMode(mode.kind === 'directions' && mode.returnTo ? { kind: 'place', place: mode.returnTo } : { kind: 'browse' })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mode])

  const directionsError =
    routeError ??
    (mode.kind === 'directions' && needsFix && !geo.fix && !geo.busy ? geo.error ?? 'Share your location, or pick a starting place.' : null)

  return (
    <div className="app">
      <MapView
        selected={selected}
        favorites={snapshot.favorites}
        routes={routes}
        selectedRoute={selectedRoute}
        onSelectRoute={setSelectedRoute}
        stops={resolvedStops ?? []}
        user={geo.fix}
        reports={reports}
        currentUserID={user?.id ?? null}
        onReportDelete={(id) => deleteReport(id).then(reloadReports).catch(() => notify('Could not remove the report.'))}
        onReportFlag={(id) => user && flagReport(id, user.id).then(() => { notify('Thanks, flagged.'); reloadReports() }).catch(() => notify('Already flagged, or not allowed.'))}
        onMoveEnd={setBounds}
        flyTo={flyTo}
        onMapClick={onMapClick}
      />
      <ReportsControl signedIn={!!user} arming={arming} count={reports.length} onArm={setArming} />

      <header className="topbar">
        <a className="brand" href={config.siteURL} title="Kova Maps">
          <img src="/favicon.svg" alt="" width={28} height={28} /> Kova Maps <span className="beta">web beta</span>
        </a>
        <AccountMenu user={user} syncState={syncState} />
      </header>

      <aside className="sidebar">
        {mode.kind === 'directions' ? (
          <DirectionsPanel
            stops={mode.stops}
            routes={routes}
            selectedRoute={selectedRoute}
            mode={mode.travel}
            busy={routeBusy || (needsFix && !geo.fix && geo.busy)}
            error={directionsError}
            near={geo.fix}
            onStops={(stops) => {
              setRoutes([])
              setMode({ ...mode, stops })
            }}
            onMode={(t) => setMode({ ...mode, travel: t })}
            onSelectRoute={setSelectedRoute}
            onClose={() => {
              setRoutes([])
              setMode(mode.returnTo ? { kind: 'place', place: mode.returnTo } : { kind: 'browse' })
            }}
          />
        ) : (
          <>
            <SearchPanel
              near={geo.fix}
              favorites={snapshot.favorites}
              recents={snapshot.recents}
              onPick={pick}
              onDirections={() => setMode({ kind: 'directions', stops: [{ kind: 'me' }, { kind: 'place', place: { title: '', subtitle: '', latitude: NaN, longitude: NaN } }], travel: 'driving', returnTo: null })}
              onClearRecents={() => commit(() => ({ recents: [] }))}
            />
            {mode.kind === 'place' && (
              <PlaceCard
                place={mode.place}
                favorite={favoriteOf(mode.place)}
                onDirections={startDirections}
                onToggleFavorite={toggleFavorite}
                onEditFavorite={editFavorite}
                onClose={() => setMode({ kind: 'browse' })}
              />
            )}
          </>
        )}
      </aside>

      <button className="locate" onClick={geo.locate} title="Your location" aria-label="Show my location" disabled={geo.busy}>
        {geo.busy ? '…' : '➤'}
      </button>
      {(toast ?? (geo.error && mode.kind !== 'directions' ? geo.error : null)) && <div className="toast">{toast ?? geo.error}</div>}
    </div>
  )
}
