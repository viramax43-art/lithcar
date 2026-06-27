import { useEffect, useState } from 'react'
import type { LatLng } from '../types'

/** One-shot coarse geolocation hint for map center / search bias. */
export function useMapUserLocationHint(enabled = true): LatLng | null {
  const [hint, setHint] = useState<LatLng | null>(null)

  useEffect(() => {
    if (!enabled || hint || typeof navigator === 'undefined' || !navigator.geolocation) return

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setHint({ lat: pos.coords.latitude, lng: pos.coords.longitude })
      },
      () => undefined,
      { enableHighAccuracy: false, timeout: 7000, maximumAge: 120_000 },
    )
  }, [enabled, hint])

  return hint
}
