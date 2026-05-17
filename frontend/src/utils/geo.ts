import type { LatLng } from '../types'

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
