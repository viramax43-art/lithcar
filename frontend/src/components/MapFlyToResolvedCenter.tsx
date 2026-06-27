import { useEffect, useRef } from 'react'
import { useMap } from 'react-leaflet'
import type { LatLng } from '../types'

interface MapFlyToResolvedCenterProps {
  center: LatLng
  /** Changes when the center source changes (e.g. service zones loaded). */
  flyKey: string
  zoom?: number
}

/** Fly map to the resolved operating center once per flyKey (e.g. when zones load). */
export function MapFlyToResolvedCenter({ center, flyKey, zoom }: MapFlyToResolvedCenterProps) {
  const map = useMap()
  const flownKey = useRef<string | null>(null)

  useEffect(() => {
    if (flownKey.current === flyKey) return
    flownKey.current = flyKey
    map.flyTo([center.lat, center.lng], zoom ?? map.getZoom(), { duration: 0.6 })
  }, [center.lat, center.lng, flyKey, map, zoom])

  return null
}
