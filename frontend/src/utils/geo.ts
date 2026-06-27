import type { LatLng } from '../types'

/** ~5 m — enough to ignore pin-anchor jitter without blocking real map moves. */
const DEFAULT_COORD_EPSILON_DEG = 0.00005

export function coordsNear(a: LatLng, b: LatLng, epsilonDeg = DEFAULT_COORD_EPSILON_DEG): boolean {
  return Math.abs(a.lat - b.lat) < epsilonDeg && Math.abs(a.lng - b.lng) < epsilonDeg
}

/**
 * Ray-casting point-in-polygon check.
 */
export function isPointInPolygon(point: LatLng, polygon: LatLng[]): boolean {
  if (polygon.length < 3) return false
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lat, yi = polygon[i].lng
    const xj = polygon[j].lat, yj = polygon[j].lng
    const intersect =
      yi > point.lng !== yj > point.lng &&
      point.lat < ((xj - xi) * (point.lng - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }
  return inside
}

/**
 * Check if point is inside any active service zone.
 */
export function isPointInAnyZone(point: LatLng, zones: { polygon: LatLng[]; isActive: boolean }[]): boolean {
  return zones.some((z) => z.isActive && isPointInPolygon(point, z.polygon))
}
