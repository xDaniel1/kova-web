import { useEffect, useRef, useState } from 'react'
import type { RoadCamera } from '../lib/roadCameras'
import { Icon } from './Icon'

/** NYC DOT refreshes each still every few seconds; the viewer reloads it on the same beat. */
export const REFRESH_MS = 4000

/** The picture's URL for this beat: a new `t` each time, so no cache hands back the old frame. */
export function frameURL(base: string, stamp: number): string {
  const u = new URL(base)
  u.searchParams.set('t', String(stamp))
  return u.toString()
}

/** A traffic camera's live picture. Keeps the last good frame through a dropped refresh. */
export function TrafficCameraView({ camera, onClose }: { camera: RoadCamera; onClose: () => void }) {
  const [shown, setShown] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!camera.imageUrl) return
    let live = true
    const load = () => {
      const src = frameURL(camera.imageUrl!, Date.now())
      const img = new Image()
      img.onload = () => { if (live) { setShown(src); setFailed(false) } }
      img.onerror = () => { if (live) setFailed(true) }
      img.src = src
    }
    load()
    const timer = setInterval(load, REFRESH_MS)
    return () => { live = false; clearInterval(timer) }
  }, [camera.imageUrl])

  useEffect(() => {
    closeRef.current?.focus()
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onClose])

  return (
    <div className="webcam-backdrop" onClick={onClose}>
      <div className="webcam-card" role="dialog" aria-modal="true" aria-label={`Traffic camera${camera.name ? `: ${camera.name}` : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="webcam-head">
          <strong><Icon name="videocam" size={18} /> Traffic Camera</strong>
          <button ref={closeRef} className="link-plain" onClick={onClose}>Done</button>
        </div>
        {camera.name && <div className="muted small">{camera.name}</div>}
        <div className="webcam-frame">
          {shown ? <img src={shown} alt={`Live picture from ${camera.name ?? 'the traffic camera'}`} /> : failed ? <span className="muted small">Picture unavailable</span> : <span className="muted small">Loading…</span>}
        </div>
        <div className="muted tiny">Live from NYC DOT · updates every few seconds</div>
      </div>
    </div>
  )
}
