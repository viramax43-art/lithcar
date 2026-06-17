import type { CSSProperties } from 'react'
import { useEffect } from 'react'
import L from 'leaflet'
import { useMap, useMapEvents } from 'react-leaflet'
import type { LatLng } from '../../../types'

/** Must match `.center-pin` / `.center-pin-shadow` `top` in index.css (via --pin-anchor-y). */
export const PIN_ANCHOR_Y_FRAC = 0.42

export const pinAnchorYStyle: CSSProperties = {
  ['--pin-anchor-y' as string]: `${PIN_ANCHOR_Y_FRAC * 100}%`,
}

export function latLngAtPinAnchor(map: L.Map): LatLng {
  const size = map.getSize()
  const px = L.point(size.x * 0.5, size.y * PIN_ANCHOR_Y_FRAC)
  const ll = map.containerPointToLatLng(px)
  return { lat: ll.lat, lng: ll.lng }
}

/** Move the map so `target` sits under the fixed center pin tip (not the map geometric center). */
export function panMapToPinAnchor(map: L.Map, target: LatLng, zoom = 15) {
  const z = Math.max(map.getZoom(), zoom)
  const targetPx = map.project([target.lat, target.lng], z)
  const size = map.getSize()
  const dy = size.y * (0.5 - PIN_ANCHOR_Y_FRAC)
  const desiredCenterPx = targetPx.add(L.point(0, dy))
  const newCenter = map.unproject(desiredCenterPx, z)
  map.flyTo(newCenter, z, { duration: 0.5 })
}

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
    const ll = latLngAtPinAnchor(map)
    onPanEnd(ll)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map])

  useEffect(() => {
    if (!enabled) return
    const container = map.getContainer()
    const observeTarget = container.parentElement ?? container
    let raf = 0
    const syncAfterResize = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        map.invalidateSize({ animate: false })
        onPanEnd(latLngAtPinAnchor(map))
      })
    }
    const ro = new ResizeObserver(syncAfterResize)
    ro.observe(observeTarget)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [map, enabled, onPanEnd])

  useMapEvents({
    movestart() {
      if (!enabled) return
      onPanStart()
    },
    moveend() {
      if (!enabled) return
      onPanEnd(latLngAtPinAnchor(map))
    },
  })

  return null
}
