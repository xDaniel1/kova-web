import type { User } from '@supabase/supabase-js'
import type { Map as MapboxMap } from 'mapbox-gl'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AccountButton } from './components/AccountButton'
import { CATEGORIES, CategoryChips } from './components/CategoryChips'
import { DirectionsPanel, type When } from './components/DirectionsPanel'
import { Icon } from './components/Icon'
import { IndoorLayer } from './components/IndoorLayer'
import { LayersControl } from './components/LayersControl'
import { MapView, type BaseMap, type ResultPin } from './components/MapView'
import { PlacePanel } from './components/PlacePanel'
import { Rail, type RailItem } from './components/Rail'
import { ResultsPanel } from './components/ResultsPanel'
import { RecentsPanel, SavedPanel } from './components/SavedPanel'
import { SearchCard } from './components/SearchCard'
import { useGeolocation } from './hooks/useGeolocation'
import { config } from './lib/config'
import { listPlaces, toPlace, type NearbyPlace } from './lib/google'
import { retrieve, reverseGeocode } from './lib/mapbox'
import { deleteReport, fetchReports, flagReport, type Bounds, type TrafficReport } from './lib/reports'
import { fetchRoutes } from './lib/routing'
import { supabase } from './lib/supabase'
import { fetchRemote, loadLocal, pushRemote, reconcile, saveLocal, type Snapshot } from './lib/sync'
import { newUUID, type FavoritePlace, type Place, type RecentSearch, type Route, type TravelMode } from './lib/types'
import { decodeView, encodeView, type Stop } from './lib/url'

type View =
  | { kind: 'home' }
  | { kind: 'results'; query: string; label: string; back?: View }
  | { kind: 'place'; place: Place; back?: View }
  | { kind: 'directions'; stops: Stop[]; travel: TravelMode; back?: View }
  | { kind: 'saved' }
  | { kind: 'recents' }

const PANEL_WIDTH = 408
const RAIL_WIDTH = 72
const samePoint = (a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) =>
  Math.abs(a.latitude - b.latitude) < 1e-5 && Math.abs(a.longitude - b.longitude) < 1e-5

function viewFromURL(): View {
  const v = decodeView(window.location.search)
  if (v.directions) return { kind: 'directions', stops: v.directions.stops, travel: v.directions.mode }
  if (v.search) return { kind: 'results', query: v.search, label: v.search }
  if (v.place) return { kind: 'place', place: v.place }
  return { kind: 'home' }
}

function usePrefersDark() {
  const [dark, setDark] = useState(() => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false)
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
    const on = (e: MediaQueryListEvent) => setDark(e.matches)
    mq?.addEventListener('change', on)
    return () => mq?.removeEventListener('change', on)
  }, [])
  return dark
}

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [snapshot, setSnapshot] = useState<Snapshot>(() => loadLocal())
  const [syncState, setSyncState] = useState<'idle' | 'syncing' | 'error'>('idle')
  const [view, setView] = useState<View>(viewFromURL)
  const [collapsed, setCollapsed] = useState(false)
  const [query, setQuery] = useState(() => {
    const v = viewFromURL()
    return v.kind === 'results' ? v.query : v.kind === 'place' ? v.place.title : ''
  })
  const [results, setResults] = useState<NearbyPlace[] | 'loading' | 'error'>([])
  const [hovered, setHovered] = useState<string | null>(null)
  const [routes, setRoutes] = useState<Route[]>([])
  const [selectedRoute, setSelectedRoute] = useState(0)
  const [routeBusy, setRouteBusy] = useState(false)
  const [routeError, setRouteError] = useState<string | null>(null)
  const [modeTimes, setModeTimes] = useState<Partial<Record<TravelMode, number>>>({})
  const [when, setWhen] = useState<When>({ kind: 'now' })
  const [base, setBase] = useState<BaseMap>('default')
  const [traffic, setTraffic] = useState(false)
  const [showReports, setShowReports] = useState(true)
  const [reports, setReports] = useState<TrafficReport[]>([])
  const [camera, setCamera] = useState<{ bounds: Bounds; center: { latitude: number; longitude: number }; zoom: number } | null>(null)
  const [flyTo, setFlyTo] = useState<{ latitude: number; longitude: number; zoom?: number } | null>(() => {
    const v = viewFromURL()
    return v.kind === 'place' ? { latitude: v.place.latitude, longitude: v.place.longitude, zoom: 16 } : null
  })
  const [fitTo, setFitTo] = useState<Bounds | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [mapInstance, setMapInstance] = useState<MapboxMap | null>(null)
  const [isNarrow, setIsNarrow] = useState(() => window.innerWidth < 760)
  const dark = usePrefersDark()
  const geo = useGeolocation()
  const pushTimer = useRef<number | null>(null)

  useEffect(() => {
    const on = () => setIsNarrow(window.innerWidth < 760)
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])

  const notify = useCallback((msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast((t) => (t === msg ? null : t)), 3200)
  }, [])

  // ---- URL <-> view
  useEffect(() => {
    const search = encodeView(
      view.kind === 'directions'
        ? { directions: { stops: view.stops.filter((s) => s.kind === 'me' || Number.isFinite(s.place.latitude)), mode: view.travel } }
        : view.kind === 'place' ? { place: view.place }
        : view.kind === 'results' ? { search: view.query }
        : {},
    )
    if (search !== window.location.search) history.pushState(null, '', window.location.pathname + search)
  }, [view])
  useEffect(() => {
    const onPop = () => {
      setRoutes([])
      const v = viewFromURL()
      setView(v)
      if (v.kind === 'place') setFlyTo({ latitude: v.place.latitude, longitude: v.place.longitude })
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  // ---- auth + sync (same sync_snapshots row as the iPhone app)
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user ?? null))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => setUser(session?.user ?? null))
    return () => sub.subscription.unsubscribe()
  }, [])
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
    return () => { cancelled = true }
  }, [user])
  const commit = useCallback((update: (s: Snapshot) => Partial<Snapshot>) => {
    setSnapshot((prev) => {
      const next: Snapshot = { ...prev, ...update(prev), updatedAt: new Date().toISOString() }
      saveLocal(next)
      if (user) {
        if (pushTimer.current) window.clearTimeout(pushTimer.current)
        pushTimer.current = window.setTimeout(() => {
          setSyncState('syncing')
          pushRemote(user.id, next).then(() => setSyncState('idle')).catch(() => setSyncState('error'))
        }, 800)
      }
      return next
    })
  }, [user])
  const addRecent = useCallback((place: Place) => {
    commit((s) => {
      const entry: RecentSearch = { id: newUUID(), title: place.title, subtitle: place.subtitle, latitude: place.latitude, longitude: place.longitude, date: new Date().toISOString() }
      return { recents: [entry, ...s.recents.filter((r) => !samePoint(r, place))].slice(0, 30) }
    })
  }, [commit])

  // ---- traffic reports (signed in only, per RLS)
  const reloadReports = useCallback(() => {
    if (!user || !camera || !showReports || camera.zoom < 10) return setReports([])
    fetchReports(camera.bounds).then(setReports).catch(() => {})
  }, [user, camera, showReports])
  useEffect(() => {
    reloadReports()
    const t = window.setInterval(reloadReports, 60_000)
    return () => window.clearInterval(t)
  }, [reloadReports])

  // ---- navigation helpers
  const openPlace = useCallback((place: Place, opts: { back?: View; fly?: boolean } = {}) => {
    setRoutes([])
    setCollapsed(false)
    setView({ kind: 'place', place, back: opts.back })
    setQuery(place.title)
    if (opts.fly !== false) setFlyTo({ latitude: place.latitude, longitude: place.longitude, zoom: 16 })
    addRecent(place)
  }, [addRecent])

  const runSearch = useCallback((q: string, label = q) => {
    setRoutes([])
    setCollapsed(false)
    setQuery(label === q ? q : label)
    setView({ kind: 'results', query: q, label })
  }, [])

  // Results: fetch for the current map area when the query or (on first load) camera is known.
  const resultsQuery = view.kind === 'results' ? view.query : null
  const cameraReady = camera !== null
  useEffect(() => {
    if (!resultsQuery || !cameraReady || !camera) return
    let cancelled = false
    setResults('loading')
    const { bounds, center } = camera
    const radius = Math.min(30000, Math.max(500, ((bounds.north - bounds.south) * 111_320) / 2))
    listPlaces(resultsQuery, center, radius)
      .then((r) => {
        if (cancelled) return
        setResults(r)
        if (r.length) {
          const lats = r.map((p) => p.location.latitude), lngs = r.map((p) => p.location.longitude)
          setFitTo({ south: Math.min(...lats), north: Math.max(...lats), west: Math.min(...lngs), east: Math.max(...lngs) })
        }
      })
      .catch(() => !cancelled && setResults('error'))
    return () => { cancelled = true }
    // Only re-run when the query changes or the camera first becomes known.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultsQuery, cameraReady])

  const resultPins: ResultPin[] = useMemo(
    () => (view.kind === 'results' && Array.isArray(results) ? results.map((r) => ({ id: r.id, place: toPlace(r), label: r.displayName?.text ?? '' })) : []),
    [view.kind, results],
  )

  const onMapClick = useCallback(async (latitude: number, longitude: number) => {
    if (view.kind === 'directions') return
    const pin: Place = { title: 'Dropped pin', subtitle: `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`, latitude, longitude }
    setCollapsed(false)
    setView({ kind: 'place', place: pin, back: view.kind === 'results' ? view : undefined })
    const named = await reverseGeocode(latitude, longitude)
    setView((v) => (v.kind === 'place' && v.place === pin ? { ...v, place: { ...named, title: named.title === 'Dropped pin' ? 'Dropped pin' : named.title } } : v))
  }, [view])

  // ---- favorites
  const favoriteOf = useCallback((p: Place | null) => (p ? snapshot.favorites.find((f) => samePoint(f, p)) : undefined), [snapshot.favorites])
  const toggleFavorite = (place: Place) => {
    const existing = favoriteOf(place)
    commit((s) => ({
      favorites: existing
        ? s.favorites.filter((f) => f.id !== existing.id)
        : [...s.favorites, { id: newUUID(), title: place.title, subtitle: place.subtitle, latitude: place.latitude, longitude: place.longitude }],
    }))
    notify(existing ? 'Removed from Saved' : user ? 'Saved. It will appear on your iPhone too.' : 'Saved on this device. Sign in to sync it.')
  }
  const editFavorite = (place: Place, patch: Partial<Pick<FavoritePlace, 'customTitle' | 'emoji' | 'colorHex'>>) => {
    const existing = favoriteOf(place)
    if (!existing) return
    commit((s) => ({ favorites: s.favorites.map((f) => (f.id === existing.id ? { ...f, ...patch } : f)) }))
  }

  // ---- directions
  const needsFix = view.kind === 'directions' && view.stops.some((s) => s.kind === 'me')
  useEffect(() => {
    if (needsFix && !geo.fix && !geo.busy && !geo.error) geo.locate()
  }, [needsFix, geo])
  const resolvedStops: Place[] | null = useMemo(() => {
    if (view.kind !== 'directions') return null
    const out: Place[] = []
    for (const s of view.stops) {
      if (s.kind === 'me') {
        if (!geo.fix) return null
        out.push({ title: 'Your location', subtitle: '', latitude: geo.fix.latitude, longitude: geo.fix.longitude })
      } else {
        if (!Number.isFinite(s.place.latitude)) return null
        out.push(s.place)
      }
    }
    return out.length >= 2 ? out : null
  }, [view, geo.fix])
  const travel = view.kind === 'directions' ? view.travel : null
  useEffect(() => {
    if (!resolvedStops || !travel) return
    const controller = new AbortController()
    setRouteBusy(true)
    setRouteError(null)
    fetchRoutes(resolvedStops, travel, controller.signal, when)
      .then((r) => {
        if (controller.signal.aborted) return
        setRoutes(r)
        setSelectedRoute(0)
        setModeTimes((t) => ({ ...t, [travel]: r[0].durationSeconds }))
      })
      .catch((e) => {
        if (controller.signal.aborted) return
        setRoutes([])
        setRouteError((e as Error).message)
      })
      .finally(() => !controller.signal.aborted && setRouteBusy(false))
    return () => controller.abort()
  }, [resolvedStops, travel, when])
  // Times under each mode icon, like Google's mode row.
  useEffect(() => {
    if (!resolvedStops) return setModeTimes({})
    const controller = new AbortController()
    setModeTimes({})
    const modes: TravelMode[] = resolvedStops.length === 2 ? ['driving', 'transit', 'walking', 'cycling'] : ['driving', 'walking', 'cycling']
    for (const m of modes) {
      fetchRoutes(resolvedStops, m, controller.signal, when)
        .then((r) => !controller.signal.aborted && setModeTimes((t) => ({ ...t, [m]: r[0].durationSeconds })))
        .catch(() => {})
    }
    return () => controller.abort()
  }, [resolvedStops, when])

  const startDirections = (to?: Place) => {
    setCollapsed(false)
    const back = view.kind === 'home' ? undefined : view
    const dest: Stop = to ? { kind: 'place', place: to } : { kind: 'place', place: { title: '', subtitle: '', latitude: NaN, longitude: NaN } }
    setView({ kind: 'directions', stops: [{ kind: 'me' }, dest], travel: 'driving', back })
  }

  const closePanel = () => {
    setRoutes([])
    setQuery('')
    setView({ kind: 'home' })
  }
  const goBack = () => {
    setRoutes([])
    const back = 'back' in view ? view.back : undefined
    if (back) {
      setView(back)
      setQuery(back.kind === 'results' ? back.label : back.kind === 'place' ? back.place.title : '')
    } else closePanel()
  }

  // Esc closes like Google Maps.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && view.kind !== 'home' && document.activeElement?.tagName !== 'INPUT') goBack()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  useEffect(() => {
    if (geo.fix && view.kind === 'home') setFlyTo({ latitude: geo.fix.latitude, longitude: geo.fix.longitude, zoom: 15 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geo.fix])

  const panelOpen = view.kind !== 'home' && !collapsed
  const leftInset = isNarrow ? 0 : RAIL_WIDTH + (panelOpen ? PANEL_WIDTH : 0)
  const selected = view.kind === 'place' ? view.place : null
  const directionsError = routeError ?? (needsFix && !geo.fix && !geo.busy ? geo.error ?? 'Allow location access, or choose a starting point.' : null)
  const activeChip = view.kind === 'results' ? CATEGORIES.find((c) => c.query === view.query)?.label ?? null : null

  return (
    <div className={'app' + (panelOpen ? ' panel-open' : '') + (view.kind === 'directions' ? ' directions-mode' : '')}>
      <MapView
        base={base}
        dark={dark}
        traffic={traffic}
        selected={selected}
        results={resultPins}
        hoveredResult={hovered}
        favorites={snapshot.favorites}
        routes={routes}
        selectedRoute={selectedRoute}
        stops={view.kind === 'directions' ? resolvedStops ?? [] : []}
        user={geo.fix}
        reports={showReports ? reports : []}
        currentUserID={user?.id ?? null}
        flyTo={flyTo}
        fitTo={fitTo}
        leftInset={leftInset}
        onSelectRoute={setSelectedRoute}
        onReportDelete={(id) => deleteReport(id).then(reloadReports).catch(() => notify('Could not remove the report.'))}
        onReportFlag={(id) => user && flagReport(id, user.id).then(() => { notify('Thanks, flagged.'); reloadReports() }).catch(() => notify('Already flagged, or not allowed.'))}
        onMoveEnd={(bounds, center, zoom) => setCamera({ bounds, center, zoom })}
        onMapClick={onMapClick}
        onPoiClick={(p) => openPlace(p, { back: view.kind === 'results' ? view : undefined, fly: false })}
        onResultClick={(id) => {
          const r = Array.isArray(results) ? results.find((x) => x.id === id) : undefined
          if (r && view.kind === 'results') openPlace(toPlace(r), { back: view, fly: false })
        }}
        onReady={setMapInstance}
      />
      <IndoorLayer map={mapInstance} />

      {!isNarrow && <Rail active={view.kind === 'saved' || view.kind === 'recents' ? (view.kind as RailItem) : null} savedCount={snapshot.favorites.length} onSelect={(item) => { setCollapsed(false); setRoutes([]); setView(view.kind === item ? { kind: 'home' } : { kind: item }) }} onMenu={() => setCollapsed((c) => !c)} />}

      {view.kind !== 'directions' && (
        <div className="search-wrap" style={{ left: isNarrow ? 8 : RAIL_WIDTH + 16 }}>
          <SearchCard
            value={query}
            near={camera?.center ?? geo.fix}
            favorites={snapshot.favorites}
            recents={snapshot.recents}
            showClose={view.kind !== 'home'}
            onValue={setQuery}
            onSuggestion={async (s) => {
              if (s.kind === 'category') return runSearch(s.name)
              try { openPlace(await retrieve(s)) } catch { notify('Could not open that place.') }
            }}
            onSubmit={(q) => runSearch(q)}
            onFavorite={(f) => openPlace({ title: f.customTitle || f.title, subtitle: f.subtitle, latitude: f.latitude, longitude: f.longitude })}
            onRecent={(r) => openPlace(r)}
            onDirections={() => startDirections()}
            onClose={closePanel}
            accessory={isNarrow ? <span className="search-account"><AccountButton user={user} syncState={syncState} /></span> : undefined}
          />
        </div>
      )}

      {view.kind !== 'directions' && (
        <div className="chips-wrap" style={{ left: isNarrow ? 8 : leftInset + (panelOpen ? 16 : 408 + 16) }}>
          <CategoryChips active={activeChip} onPick={(label, q) => runSearch(q, label)} />
        </div>
      )}

      {view.kind !== 'home' && (
        <aside className={'side-panel' + (collapsed ? ' collapsed' : '') + (view.kind === 'directions' ? ' with-header' : '')} style={isNarrow ? undefined : { left: RAIL_WIDTH }} aria-label="Details">
          {view.kind === 'directions' && (
            <div className="dir-header">
              <button className="icon-btn" onClick={goBack} aria-label="Close directions"><Icon name="close" /></button>
              <strong>Directions</strong>
            </div>
          )}
          {view.kind !== 'directions' && 'back' in view && view.back && (
            <button className="back-btn" onClick={goBack}><Icon name="arrow_back" size={18} /> Back to {view.back.kind === 'results' ? view.back.label : 'results'}</button>
          )}
          {view.kind === 'results' && (
            <ResultsPanel
              title={`${view.label} near ${camera ? 'this area' : 'you'}`}
              results={results}
              hovered={hovered}
              onHover={setHovered}
              onPick={(r) => openPlace(toPlace(r), { back: view })}
              onDirections={(r) => startDirections(toPlace(r))}
            />
          )}
          {view.kind === 'place' && (
            <PlacePanel
              place={view.place}
              favorite={favoriteOf(view.place)}
              onDirections={() => startDirections(view.place)}
              onToggleFavorite={() => toggleFavorite(view.place)}
              onEditFavorite={(patch) => editFavorite(view.place, patch)}
              onNearby={(p) => { setFlyTo({ latitude: p.latitude, longitude: p.longitude, zoom: 16 }); runSearch('restaurants', 'Restaurants') }}
              onToast={notify}
            />
          )}
          {view.kind === 'directions' && (
            <DirectionsPanel
              stops={view.stops}
              routes={routes}
              selectedRoute={selectedRoute}
              mode={view.travel}
              busy={routeBusy || (needsFix && !geo.fix && geo.busy)}
              error={directionsError}
              near={camera?.center ?? geo.fix}
              when={when}
              modeTimes={modeTimes}
              onStops={(stops) => { setRoutes([]); setView({ ...view, stops }) }}
              onMode={(t) => { setRoutes([]); setView({ ...view, travel: t }) }}
              onWhen={setWhen}
              onSelectRoute={setSelectedRoute}
              onToast={notify}
            />
          )}
          {view.kind === 'saved' && (
            <SavedPanel
              favorites={snapshot.favorites}
              signedIn={!!user}
              onPick={(f) => openPlace({ title: f.customTitle || f.title, subtitle: f.subtitle, latitude: f.latitude, longitude: f.longitude }, { back: { kind: 'saved' } as View })}
              onRemove={(f) => commit((s) => ({ favorites: s.favorites.filter((x) => x.id !== f.id) }))}
            />
          )}
          {view.kind === 'recents' && (
            <RecentsPanel recents={snapshot.recents} onPick={(r) => openPlace(r)} onClear={() => commit(() => ({ recents: [] }))} />
          )}
        </aside>
      )}
      {view.kind !== 'home' && !isNarrow && (
        <button className="collapse-tab" style={{ left: RAIL_WIDTH + (collapsed ? 0 : PANEL_WIDTH) }} onClick={() => setCollapsed((c) => !c)} aria-label={collapsed ? 'Expand side panel' : 'Collapse side panel'} title={collapsed ? 'Expand side panel' : 'Collapse side panel'}>
          <Icon name={collapsed ? 'arrow_right' : 'arrow_left'} />
        </button>
      )}

      <div className="top-right">
        <a className="get-app-pill" href={config.testFlightURL} target="_blank" rel="noreferrer"><Icon name="smartphone" size={18} /> Get the iPhone app</a>
        <AccountButton user={user} syncState={syncState} />
      </div>

      <div className="map-controls">
        <button className="ctrl" onClick={geo.locate} disabled={geo.busy} aria-label="Show your location" title="Show your location"><Icon name={geo.fix ? 'my_location' : 'location_searching'} /></button>
        <div className="ctrl-group">
          <button className="ctrl" onClick={() => mapInstance?.zoomIn()} aria-label="Zoom in"><Icon name="add" /></button>
          <button className="ctrl" onClick={() => mapInstance?.zoomOut()} aria-label="Zoom out"><Icon name="remove" /></button>
        </div>
      </div>

      <div className="layers-wrap" style={{ left: (isNarrow ? 8 : leftInset + 16) }}>
        <LayersControl base={base} traffic={traffic} reports={showReports} signedIn={!!user} onBase={setBase} onTraffic={setTraffic} onReports={setShowReports} />
      </div>

      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  )
}
