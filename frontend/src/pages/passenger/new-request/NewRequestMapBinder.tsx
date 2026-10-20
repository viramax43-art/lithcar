import { useEffect, type MutableRefObject } from 'react'
import L from 'leaflet'
import { useMap, useMapEvents } from 'react-leaflet'
import type { LatLng } from '../../../types'
import { DEFAULT_PIN_ANCHOR_Y_FRAC } from '../../../lib/mapPinAnchor'
import type { OfferViewportBounds } from '../../../lib/offerMapColors'

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

/**
 * Reports the visible map rectangle after every pan/zoom. Offer colours are
 * recalculated only for this rectangle, so the palette is never "wasted" on
 * rides outside the area the passenger is currently looking at.
 */
export function OfferMapViewportWatcher({
  onChange,
}: {
  onChange: (bounds: OfferViewportBounds) => void
}) {
  const map = useMap()

  useEffect(() => {
    const reportBounds = () => {
      const bounds = map.getBounds()
      onChange({
        south: bounds.getSouth(),
        west: bounds.getWest(),
        north: bounds.getNorth(),
        east: bounds.getEast(),
      })
    }

    reportBounds()
    map.on('moveend zoomend', reportBounds)
    return () => {
      map.off('moveend zoomend', reportBounds)
    }
  }, [map, onChange])

  return null
}
