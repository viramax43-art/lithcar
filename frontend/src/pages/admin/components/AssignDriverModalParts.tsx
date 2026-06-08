import L from 'leaflet'
import type { LatLng, RideRequest } from '../../../types'

export type ActivePoint = 'from' | 'to'

export interface RideDraft {
  requestId: string
  fromAddress: string
  fromLatLng: LatLng
  toAddress: string
  toLatLng: LatLng
  active: ActivePoint
  originalFromAddress: string
  originalFromLatLng: LatLng
  originalToAddress: string
  originalToLatLng: LatLng
}

const iconA = L.divIcon({
  className: '',
  html: '<div class="marker-a">A</div>',
  iconSize: [36, 36],
  iconAnchor: [18, 18],
})
const iconB = L.divIcon({
  className: '',
  html: '<div class="marker-b">B</div>',
  iconSize: [36, 36],
  iconAnchor: [18, 18],
})
const iconADim = L.divIcon({
  className: '',
  html: '<div class="marker-a-sm"></div>',
  iconSize: [16, 16],
  iconAnchor: [8, 8],
})
const iconBDim = L.divIcon({
  className: '',
  html: '<div class="marker-b-sm"></div>',
  iconSize: [16, 16],
  iconAnchor: [8, 8],
})

export function toRideDraft(request: RideRequest): RideDraft {
  return {
    requestId: request.id,
    fromAddress: request.from.address,
    fromLatLng: { lat: request.from.latlng.lat, lng: request.from.latlng.lng },
    toAddress: request.to.address,
    toLatLng: { lat: request.to.latlng.lat, lng: request.to.latlng.lng },
    active: 'from',
    originalFromAddress: request.from.address,
    originalFromLatLng: { lat: request.from.latlng.lat, lng: request.from.latlng.lng },
    originalToAddress: request.to.address,
    originalToLatLng: { lat: request.to.latlng.lat, lng: request.to.latlng.lng },
  }
}

export function getRouteEditMarkerIcon(point: ActivePoint, active: ActivePoint): L.DivIcon {
  if (point === 'from') return active === 'from' ? iconA : iconADim
  return active === 'to' ? iconB : iconBDim
}

export function isOverridden(draft: RideDraft): boolean {
  return (
    Math.abs(draft.fromLatLng.lat - draft.originalFromLatLng.lat) > 1e-6 ||
    Math.abs(draft.fromLatLng.lng - draft.originalFromLatLng.lng) > 1e-6 ||
    Math.abs(draft.toLatLng.lat - draft.originalToLatLng.lat) > 1e-6 ||
    Math.abs(draft.toLatLng.lng - draft.originalToLatLng.lng) > 1e-6 ||
    draft.fromAddress.trim() !== draft.originalFromAddress.trim() ||
    draft.toAddress.trim() !== draft.originalToAddress.trim()
  )
}
