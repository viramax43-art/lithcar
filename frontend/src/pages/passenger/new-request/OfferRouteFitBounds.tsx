import { useEffect } from 'react'
import L from 'leaflet'
import { useMap } from 'react-leaflet'
import type { LatLng } from '../../../types'

interface OfferRouteFitBoundsProps {
  from: LatLng | null
  to: LatLng | null
  offerId: string | null
}

export function OfferRouteFitBounds({ from, to, offerId }: OfferRouteFitBoundsProps) {
  const map = useMap()

  useEffect(() => {
    if (!offerId || !from || !to) return
    const bounds = L.latLngBounds([
      [from.lat, from.lng],
      [to.lat, to.lng],
    ])
    map.fitBounds(bounds, {
      paddingTopLeft: [56, 88],
      paddingBottomRight: [56, 200],
      maxZoom: 14,
      animate: true,
    })
  }, [from, map, offerId, to])

  return null
}
