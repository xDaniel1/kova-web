import { useCallback, useState } from 'react'

export interface Fix {
  latitude: number
  longitude: number
  accuracy: number
}

export function useGeolocation() {
  const [fix, setFix] = useState<Fix | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const locate = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setError('Location is not available in this browser.')
      return
    }
    setBusy(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setFix({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy })
        setError(null)
        setBusy(false)
      },
      (err) => {
        setError(err.code === err.PERMISSION_DENIED ? 'Location access was denied.' : 'Could not find your location.')
        setBusy(false)
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 },
    )
  }, [])

  return { fix, error, busy, locate }
}
