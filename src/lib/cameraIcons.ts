// Map icons for cameras, traffic lights and stop signs, drawn on a canvas so they stay crisp and
// need no image files. Matches iPhone's CameraMarker and TrafficSignalMarker: a rounded tile with
// a camera on it, a corner badge for the kind, the enforced limit underneath; a three-lamp light;
// a red octagon with STOP written on it (a plain red shape read as a red dot at map size).

import type { CameraKind } from './roadCameras'

export const TINT: Record<CameraKind, string> = {
  fixedRadar: '#32ade6',
  redLight: '#34c759',
  averageSpeed: '#af52de',
  tollGantry: '#5856d6',
  tollBooth: '#5856d6',
  trafficCamera: '#007aff',
}

const SCALE = 2 // drawn at 2x for sharp edges on high-density screens

function canvas(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = w * SCALE
  c.height = h * SCALE
  const g = c.getContext('2d')!
  g.scale(SCALE, SCALE)
  return { c, g }
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath()
  g.moveTo(x + r, y)
  g.arcTo(x + w, y, x + w, y + h, r)
  g.arcTo(x + w, y + h, x, y + h, r)
  g.arcTo(x, y + h, x, y, r)
  g.arcTo(x, y, x + w, y, r)
  g.closePath()
}

function cameraGlyph(g: CanvasRenderingContext2D, cx: number, cy: number) {
  g.fillStyle = '#fff'
  roundRect(g, cx - 7, cy - 4, 14, 10, 2)
  g.fill()
  g.fillRect(cx - 3, cy - 6, 6, 3)
  g.fillStyle = 'rgba(0,0,0,0.35)'
  g.beginPath()
  g.arc(cx, cy + 1, 3, 0, Math.PI * 2)
  g.fill()
}

function videoGlyph(g: CanvasRenderingContext2D, cx: number, cy: number) {
  g.fillStyle = '#fff'
  roundRect(g, cx - 7, cy - 4, 10, 8, 2)
  g.fill()
  g.beginPath()
  g.moveTo(cx + 3, cy)
  g.lineTo(cx + 8, cy - 4)
  g.lineTo(cx + 8, cy + 4)
  g.closePath()
  g.fill()
}

function dollar(g: CanvasRenderingContext2D, cx: number, cy: number, size: number, color: string) {
  g.fillStyle = color
  g.font = `900 ${size}px -apple-system, system-ui, Helvetica, Arial, sans-serif`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText('$', cx, cy + 0.5)
}

function badge(g: CanvasRenderingContext2D, kind: CameraKind, cx: number, cy: number) {
  if (kind === 'redLight') {
    // A tiny traffic light, the same three lamps as the map's signal markers.
    g.fillStyle = '#1a1a1a'
    roundRect(g, cx - 3, cy - 7, 6, 14, 3)
    g.fill()
    g.strokeStyle = '#fff'
    g.lineWidth = 1
    g.stroke()
    for (const [i, col] of ['#f2382f', '#ffcc1a', '#33cc59'].entries()) {
      g.fillStyle = col
      g.beginPath()
      g.arc(cx, cy - 4 + i * 4, 1.4, 0, Math.PI * 2)
      g.fill()
    }
    return
  }
  if (kind !== 'fixedRadar' && kind !== 'averageSpeed' && kind !== 'tollGantry') return
  g.fillStyle = '#fff'
  g.beginPath()
  g.arc(cx, cy, 6.5, 0, Math.PI * 2)
  g.fill()
  const tint = TINT[kind]
  g.strokeStyle = tint
  g.fillStyle = tint
  g.lineWidth = 1.4
  if (kind === 'tollGantry') dollar(g, cx, cy, 9, tint)
  else if (kind === 'averageSpeed') {
    // a timer: dial and one hand
    g.beginPath()
    g.arc(cx, cy, 3.6, 0, Math.PI * 2)
    g.stroke()
    g.beginPath()
    g.moveTo(cx, cy)
    g.lineTo(cx, cy - 2.6)
    g.stroke()
  } else {
    // a gauge: an arc and a needle
    g.beginPath()
    g.arc(cx, cy + 1.5, 3.8, Math.PI, 0)
    g.stroke()
    g.beginPath()
    g.moveTo(cx, cy + 1.5)
    g.lineTo(cx + 2.4, cy - 1.5)
    g.stroke()
  }
}

/** The image id for a camera marker. */
export function cameraIconId(kind: CameraKind, limit?: number): string {
  return limit === undefined ? `kova-cam-${kind}` : `kova-cam-${kind}-${limit}`
}

/** Draws a camera tile, with its limit under it when given. */
export function drawCamera(kind: CameraKind, limit?: number): ImageData {
  const w = 34, h = limit === undefined ? 34 : 48
  const { c, g } = canvas(w, h)
  g.shadowColor = 'rgba(0,0,0,0.3)'
  g.shadowBlur = 2
  g.shadowOffsetY = 1
  g.fillStyle = TINT[kind]
  roundRect(g, 3, 3, 26, 26, 7)
  g.fill()
  g.shadowColor = 'transparent'
  g.strokeStyle = '#fff'
  g.lineWidth = 1.5
  g.stroke()
  if (kind === 'tollBooth') dollar(g, 16, 16, 16, '#fff')
  else if (kind === 'trafficCamera') videoGlyph(g, 16, 16)
  else cameraGlyph(g, 16, 16)
  badge(g, kind, 27, 27)
  if (limit !== undefined) {
    const text = String(limit)
    g.font = '900 10px -apple-system, system-ui, Helvetica, Arial, sans-serif'
    const tw = Math.max(14, g.measureText(text).width + 8)
    g.fillStyle = '#fff'
    roundRect(g, 16 - tw / 2, 34, tw, 12, 3)
    g.fill()
    g.strokeStyle = '#000'
    g.lineWidth = 1
    g.stroke()
    g.fillStyle = '#000'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(text, 16, 40.5)
  }
  return g.getImageData(0, 0, c.width, c.height)
}

export function drawStopSign(): ImageData {
  const { c, g } = canvas(26, 26)
  const r = 11, cx = 13, cy = 13
  g.beginPath()
  for (let i = 0; i < 8; i++) {
    const a = Math.PI / 8 + (i * Math.PI) / 4
    const x = cx + r * Math.cos(a), y = cy + r * Math.sin(a)
    if (i) g.lineTo(x, y)
    else g.moveTo(x, y)
  }
  g.closePath()
  g.shadowColor = 'rgba(0,0,0,0.3)'
  g.shadowBlur = 2
  g.shadowOffsetY = 1
  g.fillStyle = '#d91f1f'
  g.fill()
  g.shadowColor = 'transparent'
  g.strokeStyle = '#fff'
  g.lineWidth = 1.6
  g.stroke()
  g.fillStyle = '#fff'
  g.font = '900 6.8px -apple-system, system-ui, Helvetica, Arial, sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText('STOP', cx, cy + 0.5)
  return g.getImageData(0, 0, c.width, c.height)
}

export function drawTrafficLight(): ImageData {
  const { c, g } = canvas(16, 32)
  g.shadowColor = 'rgba(0,0,0,0.3)'
  g.shadowBlur = 2
  g.shadowOffsetY = 1
  g.fillStyle = '#1a1a1a'
  roundRect(g, 2, 2, 12, 28, 6)
  g.fill()
  g.shadowColor = 'transparent'
  g.strokeStyle = '#fff'
  g.lineWidth = 1.5
  g.stroke()
  for (const [i, col] of ['#f2382f', '#ffcc1a', '#33cc59'].entries()) {
    g.fillStyle = col
    g.beginPath()
    g.arc(8, 8.5 + i * 7.5, 3, 0, Math.PI * 2)
    g.fill()
  }
  return g.getImageData(0, 0, c.width, c.height)
}

export const SIGNAL_ICON = { light: 'kova-signal-light', stop: 'kova-signal-stop' } as const
export const ICON_PIXEL_RATIO = SCALE
