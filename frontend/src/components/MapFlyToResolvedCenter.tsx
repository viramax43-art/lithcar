import { useEffect, useRef } from 'react'
import { useMap } from 'react-leaflet'
import type { LatLng } from '../types'

interface MapFlyToResolvedCenterProps {
  center: LatLng
  /** Changes when the center source changes (e.g. service zones loaded). */
  flyKey: string
  zoom?: number
  enabled?: boolean
}

/** Fly map to the resolved operating center once per flyKey (e.g. when zones load). */
export function MapFlyToResolvedCenter({ center, flyKey, zoom, enabled = true }: MapFlyToResolvedCenterProps) {
  const map = useMap()
  const flownKey = useRef<string | null>(null)

  useEffect(() => {
    if (!enabled) return
    if (flownKey.current === flyKey) return
    flownKey.current = flyKey
    map.flyTo([center.lat, center.lng], zoom ?? map.getZoom(), { duration: 0.6 })
  }, [center.lat, center.lng, enabled, flyKey, map, zoom])

  return null
}
