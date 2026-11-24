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
  const cardRef = useRef<HTMLDivElement>(null)

  // One frame at a time: the next load starts after the last one settles, so a slow frame can
  // never land on top of a newer one. Paused while the tab is hidden.
  useEffect(() => {
    if (!camera.imageUrl) return
    let live = true
    let timer: ReturnType<typeof setTimeout> | undefined
    let img: HTMLImageElement | null = null
    const load = () => {
      clearTimeout(timer)
      if (!live || document.visibilityState === 'hidden') return
      const src = frameURL(camera.imageUrl!, Date.now())
      const next = new Image()
      img = next
      const settle = (ok: boolean) => {
        if (!live || img !== next) return
        if (ok) { setShown(src); setFailed(false) } else setFailed(true)
        timer = setTimeout(load, REFRESH_MS)
      }
      next.onload = () => settle(true)
      next.onerror = () => settle(false)
      next.src = src
    }
    const visibility = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', visibility)
    load()
    return () => { live = false; clearTimeout(timer); img = null; document.removeEventListener('visibilitychange', visibility) }
  }, [camera.imageUrl])

  // A modal dialog: focus moves in, Tab stays inside, Escape closes, focus goes back on close.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    closeRef.current?.focus()
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return }
      if (e.key !== 'Tab' || !cardRef.current) return
      const focusable = [...cardRef.current.querySelectorAll<HTMLElement>('button, [href], [tabindex]:not([tabindex="-1"])')]
      if (!focusable.length) return
      const first = focusable[0], last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', key)
    return () => { window.removeEventListener('keydown', key); opener?.focus?.() }
  }, [onClose])

  return (
    <div className="webcam-backdrop" onClick={onClose}>
      <div ref={cardRef} className="webcam-card" role="dialog" aria-modal="true" aria-label={`Traffic camera${camera.name ? `: ${camera.name}` : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="webcam-head">
          <strong><Icon name="videocam" size={18} /> Traffic Camera</strong>
          <button ref={closeRef} className="link-plain" onClick={onClose}>Done</button>
        </div>
        {camera.name && <div className="muted small">{camera.name}</div>}
        <div className="webcam-frame">
          {shown ? <img src={shown} alt={`Live picture from ${camera.name ?? 'the traffic camera'}`} /> : failed ? <span className="muted small">Picture unavailable</span> : <span className="muted small">Loading…</span>}
        </div>
        <div className="muted tiny" aria-live="polite">{shown && failed ? 'Picture paused: the camera is not answering, showing its last frame' : 'Live from NYC DOT · updates every few seconds'}</div>
      </div>
    </div>
  )
}
