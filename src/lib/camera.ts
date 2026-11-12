export interface CameraPosition { longitude: number; latitude: number; zoom: number }
export const FIRST_VISIT: CameraPosition = { longitude: -73.9857, latitude: 40.7484, zoom: 12 }
export const CAMERA_KEY = 'kova.camera.v1'

export function parseCamera(value: string | null): CameraPosition | null {
  if (!value) return null
  try {
    const c = JSON.parse(value)
    if (!c || !Number.isFinite(c.longitude) || !Number.isFinite(c.latitude) || !Number.isFinite(c.zoom)) return null
    if (Math.abs(c.longitude) > 180 || Math.abs(c.latitude) > 85 || c.zoom < 0 || c.zoom > 22) return null
    return { longitude: c.longitude, latitude: c.latitude, zoom: c.zoom }
  } catch { return null }
}
export function initialCamera(): CameraPosition {
  try { return parseCamera(localStorage.getItem(CAMERA_KEY)) ?? FIRST_VISIT } catch { return FIRST_VISIT }
}
export function rememberCamera(camera: CameraPosition): void {
  // World copies may report longitude beyond ±180; normalize before saving.
  const longitude = ((camera.longitude + 180) % 360 + 360) % 360 - 180
  try { localStorage.setItem(CAMERA_KEY, JSON.stringify({ ...camera, longitude })) } catch { /* Storage is optional. */ }
}
