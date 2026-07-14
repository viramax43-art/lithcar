import type { LatLng, ServiceZone } from '../types'
import { coordsNear, isPointInAnyZone, isPointInPolygon } from './geo'

export function isPickupZoneCheckActive(activeField: 'from' | 'to', hasZones: boolean): boolean {
  return activeField === 'from' && hasZones
}

export function zoneCentroid(zone: { polygon: LatLng[] }): LatLng | null {
  if (zone.polygon.length === 0) return null
  const lat = zone.polygon.reduce((sum, point) => sum + point.lat, 0) / zone.polygon.length
  const lng = zone.polygon.reduce((sum, point) => sum + point.lng, 0) / zone.polygon.length
  return { lat, lng }
}

/** Top-center of zone bounding box — anchor for map labels above the polygon. */
export function zoneLabelPosition(zone: { polygon: LatLng[] }): LatLng | null {
  if (zone.polygon.length === 0) return null
  const lats = zone.polygon.map((point) => point.lat)
  const lngs = zone.polygon.map((point) => point.lng)
  return {
    lat: Math.max(...lats),
    lng: (Math.min(...lngs) + Math.max(...lngs)) / 2,
  }
}

function haversineMeters(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

export function rankRecommendedPickupZones(
  zones: ServiceZone[],
  referencePoint: LatLng,
  limit = 10,
): ServiceZone[] {
  const active = zones.filter((zone) => zone.isActive && zone.polygon.length >= 3)
  return [...active]
    .map((zone) => {
      const centroid = zoneCentroid(zone)
      const distanceM = centroid ? haversineMeters(referencePoint, centroid) : Number.POSITIVE_INFINITY
      return { zone, distanceM }
    })
    .sort((a, b) => a.distanceM - b.distanceM)
    .slice(0, limit)
    .map((entry) => entry.zone)
}

export function findClosestPickupZone(point: LatLng, zones: ServiceZone[]): ServiceZone | null {
  const active = zones.filter((zone) => zone.isActive && zone.polygon.length >= 3)
  if (active.length === 0) return null

  if (isPointInAnyZone(point, active)) {
    return active.find((zone) => isPointInPolygon(point, zone.polygon)) ?? null
  }

  let best: ServiceZone | null = null
  let bestDistance = Number.POSITIVE_INFINITY
  for (const zone of active) {
    const centroid = zoneCentroid(zone)
    if (!centroid) continue
    const distanceM = haversineMeters(point, centroid)
    if (distanceM < bestDistance) {
      best = zone
      bestDistance = distanceM
    }
  }
  return best
}

export function findNearestPickupZone(
  point: LatLng,
  zones: ServiceZone[],
  maxMeters = 80,
): ServiceZone | null {
  const active = zones.filter((zone) => zone.isActive && zone.polygon.length >= 3)
  if (active.length === 0) return null

  if (isPointInAnyZone(point, active)) {
    return active.find((zone) => isPointInPolygon(point, zone.polygon)) ?? null
  }

  let best: ServiceZone | null = null
  let bestDistance = Number.POSITIVE_INFINITY
  for (const zone of active) {
    const centroid = zoneCentroid(zone)
    if (!centroid) continue
    const distanceM = haversineMeters(point, centroid)
    if (distanceM <= maxMeters && distanceM < bestDistance) {
      best = zone
      bestDistance = distanceM
    }
  }
  return best
}

export type PickupLocationResolution = {
  latlng: LatLng
  zone: ServiceZone | null
  snapped: boolean
}

/** Pickup point inside a zone stays put; otherwise snap to the nearest active zone centroid. */
export function resolvePickupLocation(point: LatLng, zones: ServiceZone[]): PickupLocationResolution {
  const active = zones.filter((zone) => zone.isActive && zone.polygon.length >= 3)
  if (active.length === 0) {
    return { latlng: point, zone: null, snapped: false }
  }

  if (isPointInAnyZone(point, active)) {
    const zone = active.find((entry) => isPointInPolygon(point, entry.polygon)) ?? null
    return { latlng: point, zone, snapped: false }
  }

  const closest = findClosestPickupZone(point, active)
  const centroid = closest ? zoneCentroid(closest) : null
  if (!closest || !centroid) {
    return { latlng: point, zone: null, snapped: false }
  }

  return { latlng: centroid, zone: closest, snapped: true }
}

export function isSameZonePoint(a: LatLng, b: LatLng, maxMeters = 15): boolean {
  return coordsNear(a, b, maxMeters)
}

export const HEX_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/

export function normalizeHexColor(value: string, fallback: string): string {
  const trimmed = value.trim()
  if (HEX_COLOR_PATTERN.test(trimmed)) return trimmed.toUpperCase()
  return fallback
}
