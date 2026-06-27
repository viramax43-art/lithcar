import type { LatLng } from '../types'

/** True when two coordinates are within maxMeters (default ~15 m). */
export function coordsNear(a: LatLng, b: LatLng, maxMeters = 15): boolean {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  const distanceM = 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
  return distanceM <= maxMeters
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
