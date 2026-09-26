import { useEffect, useState } from 'react'
import { getUserGeolocation } from '../lib/mapGeolocation'
import type { LatLng } from '../types'

/** One-shot geolocation hint for map center / search bias. */
export function useMapUserLocationHint(enabled = true): LatLng | null {
  const [hint, setHint] = useState<LatLng | null>(null)

  useEffect(() => {
    if (!enabled || hint) return

    let cancelled = false
    void getUserGeolocation({ highAccuracy: true, timeoutMs: 10_000, maxAcceptableAccuracyM: 120 })
      .then((pos) => {
        if (!cancelled) setHint({ lat: pos.lat, lng: pos.lng })
      })
      .catch(() => undefined)

    return () => {
      cancelled = true
    }
  }, [enabled, hint])

  return hint
}
