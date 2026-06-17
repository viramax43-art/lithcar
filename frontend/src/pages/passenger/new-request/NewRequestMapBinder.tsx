import { useEffect, type MutableRefObject } from 'react'
import L from 'leaflet'
import { useMap, useMapEvents } from 'react-leaflet'
import type { LatLng } from '../../../types'
import { DEFAULT_PIN_ANCHOR_Y_FRAC } from '../../../lib/mapPinAnchor'

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

/** Smaller A/B for driver offers on the passenger map (non-selected). */
export const iconOfferA = L.divIcon({
  className: '',
  html: '<div class="marker-a marker-a--offer">A</div>',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
})

export const iconOfferB = L.divIcon({
  className: '',
  html: '<div class="marker-b marker-b--offer">B</div>',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
})

export function MapBinder({
  registerMap,
  pinAnchorYFracRef,
  enabled = true,
  onPanStart,
  onPanEnd,
}: {
  registerMap: (m: L.Map) => void
  pinAnchorYFracRef: MutableRefObject<number>
  enabled?: boolean
  onPanStart: () => void
  onPanEnd: (latlng: LatLng) => void
}) {
  const map = useMap()

  const readPinLatLng = () => {
    const size = map.getSize()
    const frac = pinAnchorYFracRef.current ?? DEFAULT_PIN_ANCHOR_Y_FRAC
    const px = L.point(size.x * 0.5, size.y * frac)
    const ll = map.containerPointToLatLng(px)
    return { lat: ll.lat, lng: ll.lng }
  }

  useEffect(() => {
    registerMap(map)
    onPanEnd(readPinLatLng())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map])

  useMapEvents({
    movestart() {
      if (!enabled) return
      onPanStart()
    },
    moveend() {
      if (!enabled) return
      onPanEnd(readPinLatLng())
    },
  })

  return null
}
