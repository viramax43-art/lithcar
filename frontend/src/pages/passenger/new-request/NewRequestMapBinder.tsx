import { useEffect } from 'react'
import L from 'leaflet'
import { useMap, useMapEvents } from 'react-leaflet'
import type { LatLng } from '../../../types'

export const PIN_ANCHOR_Y_FRAC = 0.42

export const iconA = L.divIcon({
  className: '',
  html: '<div class="marker-a">A</div>',
  iconSize: [36, 36],
  iconAnchor: [18, 18],
})

export const iconB = L.divIcon({
  className: '',
  html: '<div class="marker-b">B</div>',
  iconSize: [36, 36],
  iconAnchor: [18, 18],
})

export function MapBinder({
  registerMap,
  enabled = true,
  onPanStart,
  onPanEnd,
}: {
  registerMap: (m: L.Map) => void
  enabled?: boolean
  onPanStart: () => void
  onPanEnd: (latlng: LatLng) => void
}) {
  const map = useMap()

  useEffect(() => {
    registerMap(map)
    const size = map.getSize()
    const px = L.point(size.x * 0.5, size.y * PIN_ANCHOR_Y_FRAC)
    const ll = map.containerPointToLatLng(px)
    onPanEnd({ lat: ll.lat, lng: ll.lng })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map])

  useMapEvents({
    movestart() {
      if (!enabled) return
      onPanStart()
    },
    moveend() {
      if (!enabled) return
      const size = map.getSize()
      const px = L.point(size.x * 0.5, size.y * PIN_ANCHOR_Y_FRAC)
      const ll = map.containerPointToLatLng(px)
      onPanEnd({ lat: ll.lat, lng: ll.lng })
    },
  })

  return null
}
