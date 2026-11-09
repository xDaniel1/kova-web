export function formatDistance(meters: number, units: 'imperial' | 'metric' = 'imperial'): string {
  if (units === 'metric') {
    if (meters < 1000) return `${Math.round(meters)} m`
    return `${(meters / 1000).toFixed(meters < 10_000 ? 1 : 0)} km`
  }
  const feet = meters * 3.28084
  if (feet < 1000) return `${Math.round(feet / 10) * 10} ft`
  const miles = meters / 1609.344
  return `${miles.toFixed(miles < 10 ? 1 : 0)} mi`
}

export function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60)
  if (minutes < 1) return '1 min'
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `${hours} hr` : `${hours} hr ${rest} min`
}

export function formatArrival(seconds: number, now: Date = new Date()): string {
  const eta = new Date(now.getTime() + seconds * 1000)
  return eta.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}
