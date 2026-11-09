import type { User } from '@supabase/supabase-js'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AccountMenu } from './components/AccountMenu'
import { DirectionsPanel } from './components/DirectionsPanel'
import { MapView } from './components/MapView'
import { PlaceCard } from './components/PlaceCard'
import { SearchPanel } from './components/SearchPanel'
import { useGeolocation } from './hooks/useGeolocation'
import { config } from './lib/config'
import { reverseGeocode } from './lib/geocode'
import { fetchRoute } from './lib/routing'
import { supabase } from './lib/supabase'
import { fetchRemote, loadLocal, pushRemote, reconcile, saveLocal, type Snapshot } from './lib/sync'
import { newUUID, type FavoritePlace, type Place, type RecentSearch, type Route, type TravelMode } from './lib/types'

type Mode = { kind: 'browse' } | { kind: 'place'; place: Place } | { kind: 'directions'; place: Place; travel: TravelMode }

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [snapshot, setSnapshot] = useState<Snapshot>(() => loadLocal())
  const [syncState, setSyncState] = useState<'idle' | 'syncing' | 'error'>('idle')
  const [mode, setMode] = useState<Mode>({ kind: 'browse' })
  const [route, setRoute] = useState<Route | null>(null)
  const [routeBusy, setRouteBusy] = useState(false)
  const [routeError, setRouteError] = useState<string | null>(null)
  const [flyTo, setFlyTo] = useState<{ latitude: number; longitude: number; zoom?: number } | null>(null)
  const geo = useGeolocation()
  const pushTimer = useRef<number | null>(null)

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
        const rest = s.recents.filter((r) => !(Math.abs(r.latitude - place.latitude) < 1e-6 && Math.abs(r.longitude - place.longitude) < 1e-6))
        return { recents: [entry, ...rest].slice(0, 20) }
      })
    },
    [commit],
  )

  const pick = useCallback(
    (place: Place) => {
      setRoute(null)
      setMode({ kind: 'place', place })
      setFlyTo({ latitude: place.latitude, longitude: place.longitude, zoom: 15 })
      addRecent(place)
    },
    [addRecent],
  )

  const onMapClick = useCallback(
    async (latitude: number, longitude: number) => {
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
    [mode.kind],
  )

  const selected = mode.kind === 'browse' ? null : mode.place
  const favoriteOf = useMemo(
    () => (p: Place | null): FavoritePlace | undefined =>
      p ? snapshot.favorites.find((f) => Math.abs(f.latitude - p.latitude) < 1e-6 && Math.abs(f.longitude - p.longitude) < 1e-6) : undefined,
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

  // Routing: re-run whenever the destination, mode or user fix changes.
  useEffect(() => {
    if (mode.kind !== 'directions' || !geo.fix) return
    const controller = new AbortController()
    setRouteBusy(true)
    setRouteError(null)
    fetchRoute(geo.fix, mode.place, mode.travel, controller.signal)
      .then((r) => {
        if (!controller.signal.aborted) setRoute(r)
      })
      .catch((e) => {
        if (!controller.signal.aborted) setRouteError((e as Error).message)
      })
      .finally(() => !controller.signal.aborted && setRouteBusy(false))
    return () => controller.abort()
  }, [mode, geo.fix])

  const startDirections = (travel: TravelMode) => {
    if (mode.kind === 'browse') return
    if (!geo.fix) geo.locate()
    setMode({ kind: 'directions', place: mode.place, travel })
  }

  useEffect(() => {
    if (geo.fix && mode.kind === 'browse') setFlyTo({ latitude: geo.fix.latitude, longitude: geo.fix.longitude, zoom: 14 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geo.fix])

  return (
    <div className="app">
      <MapView selected={selected} favorites={snapshot.favorites} route={route} user={geo.fix} flyTo={flyTo} onMapClick={onMapClick} />

      <header className="topbar">
        <a className="brand" href={config.siteURL} title="Kova Maps">
          <img src="/favicon.svg" alt="" width={28} height={28} /> Kova Maps <span className="beta">web beta</span>
        </a>
        <AccountMenu user={user} syncState={syncState} />
      </header>

      <aside className="sidebar">
        {mode.kind === 'directions' ? (
          <DirectionsPanel
            destination={mode.place}
            route={route}
            mode={mode.travel}
            busy={routeBusy || (!geo.fix && geo.busy)}
            error={routeError ?? (!geo.fix && !geo.busy ? geo.error ?? 'Share your location to get directions.' : null)}
            onMode={(travel) => setMode({ kind: 'directions', place: mode.place, travel })}
            onClose={() => {
              setRoute(null)
              setMode({ kind: 'place', place: mode.place })
            }}
          />
        ) : (
          <>
            <SearchPanel
              near={geo.fix}
              favorites={snapshot.favorites}
              recents={snapshot.recents}
              onPick={pick}
              onClearRecents={() => commit(() => ({ recents: [] }))}
            />
            {mode.kind === 'place' && (
              <PlaceCard
                place={mode.place}
                isFavorite={!!favoriteOf(mode.place)}
                canRoute={true}
                onDirections={startDirections}
                onToggleFavorite={toggleFavorite}
                onClose={() => setMode({ kind: 'browse' })}
              />
            )}
          </>
        )}
      </aside>

      <button className="locate" onClick={geo.locate} title="Your location" aria-label="Show my location" disabled={geo.busy}>
        {geo.busy ? '…' : '➤'}
      </button>
      {geo.error && <div className="toast">{geo.error}</div>}
    </div>
  )
}
