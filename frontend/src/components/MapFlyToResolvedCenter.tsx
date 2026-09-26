import { useEffect, useRef, type MutableRefObject } from 'react'
import { useMap } from 'react-leaflet'
import { computeMapCenterForLatLngUnderPin } from '../lib/mapGeolocation'
import type { LatLng } from '../types'

interface MapFlyToResolvedCenterProps {
  center: LatLng
  /** Changes when the center source changes (e.g. service zones loaded). */
  flyKey: string
  zoom?: number
  enabled?: boolean
  /** When set, places `center` under the selection pin instead of at the map center. */
  pinAnchorYFracRef?: MutableRefObject<number>
}

/** Fly map to the resolved operating center once per flyKey (e.g. when zones load). */
export function MapFlyToResolvedCenter({
  center,
  flyKey,
  zoom,
  enabled = true,
  pinAnchorYFracRef,
}: MapFlyToResolvedCenterProps) {
  const map = useMap()
  const flownKey = useRef<string | null>(null)

  useEffect(() => {
    if (!enabled) return
    if (flownKey.current === flyKey) return
    flownKey.current = flyKey

    const z = zoom ?? map.getZoom()
    if (pinAnchorYFracRef) {
      const mapCenter = computeMapCenterForLatLngUnderPin(map, center, pinAnchorYFracRef.current, z)
      map.flyTo([mapCenter.lat, mapCenter.lng], z, { duration: 0.6 })
      return
    }
    map.flyTo([center.lat, center.lng], z, { duration: 0.6 })
  }, [center.lat, center.lng, enabled, flyKey, map, pinAnchorYFracRef, zoom])

  return null
}
