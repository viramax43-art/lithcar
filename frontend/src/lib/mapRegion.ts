import type { LatLng } from '../types'
import { zoneCentroid } from '../utils/serviceZones'

export type MapRegionId = 'lt' | 'az'

export interface MapRegionConfig {
  id: MapRegionId
  countryCode: string
  /** Nominatim viewbox: left,top,right,bottom (minLon,maxLat,maxLon,minLat). */
  viewbox: string
  defaultCenter: LatLng
  defaultZoom: number
  /** Rough bounds for assigning zones to a region. */
  bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number }
}

const MAP_REGIONS: Record<MapRegionId, MapRegionConfig> = {
  lt: {
    id: 'lt',
    countryCode: 'lt',
    viewbox: '20.9,56.5,26.9,53.9',
    defaultCenter: { lat: 54.6872, lng: 25.2797 },
    defaultZoom: 13,
    bounds: { minLat: 53.9, maxLat: 56.5, minLng: 20.9, maxLng: 26.9 },
  },
  az: {
    id: 'az',
    countryCode: 'az',
    viewbox: '44.75,41.95,50.45,38.35',
    defaultCenter: { lat: 40.4093, lng: 49.8671 },
    defaultZoom: 13,
    bounds: { minLat: 38.35, maxLat: 41.95, minLng: 44.75, maxLng: 50.45 },
  },
}

export const OPERATING_REGIONS: MapRegionId[] = ['lt', 'az']

export const OPERATING_COUNTRY_CODES = OPERATING_REGIONS.map((id) => MAP_REGIONS[id].countryCode).join(',')

const DEFAULT_REGION: MapRegionId = 'lt'

/** Max zone spread (km) to treat all zones as one local cluster. */
const COMPACT_ZONES_MAX_SPAN_KM = 450

interface ZoneLike {
  polygon: LatLng[]
  isActive: boolean
}

function activeZonePoints(zones: ZoneLike[]): LatLng[] {
  return zones.filter((zone) => zone.isActive && zone.polygon.length >= 3).flatMap((zone) => zone.polygon)
}

function haversineKm(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

function pointInBounds(point: LatLng, bounds: MapRegionConfig['bounds']): boolean {
  return (
    point.lat >= bounds.minLat &&
    point.lat <= bounds.maxLat &&
    point.lng >= bounds.minLng &&
    point.lng <= bounds.maxLng
  )
}

export function inferNearestRegionId(point: LatLng): MapRegionId {
  let best: MapRegionId = DEFAULT_REGION
  let bestDistance = Number.POSITIVE_INFINITY
  for (const regionId of OPERATING_REGIONS) {
    const distance = haversineKm(point, MAP_REGIONS[regionId].defaultCenter)
    if (distance < bestDistance) {
      bestDistance = distance
      best = regionId
    }
  }
  return best
}

function zonesBoundingSpanKm(zones: ZoneLike[]): number | null {
  const points = activeZonePoints(zones)
  if (points.length === 0) return null
  let maxSpan = 0
  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      maxSpan = Math.max(maxSpan, haversineKm(points[i], points[j]))
    }
  }
  return maxSpan
}

/** Bounding viewbox for Nominatim when zones form one local cluster. */
export function getCompactZonesViewbox(zones: ZoneLike[], paddingDeg = 0.08): string | null {
  const spanKm = zonesBoundingSpanKm(zones)
  if (spanKm === null || spanKm > COMPACT_ZONES_MAX_SPAN_KM) return null

  const points = activeZonePoints(zones)
  const lats = points.map((p) => p.lat)
  const lngs = points.map((p) => p.lng)
  const minLat = Math.min(...lats) - paddingDeg
  const maxLat = Math.max(...lats) + paddingDeg
  const minLng = Math.min(...lngs) - paddingDeg
  const maxLng = Math.max(...lngs) + paddingDeg
  return `${minLng},${maxLat},${maxLng},${minLat}`
}

export function getZonesCenter(zones: ZoneLike[]): LatLng | null {
  const points = activeZonePoints(zones)
  if (points.length === 0) return null

  const lat = points.reduce((sum, p) => sum + p.lat, 0) / points.length
  const lng = points.reduce((sum, p) => sum + p.lng, 0) / points.length
  return { lat, lng }
}

function filterZonesInRegion(zones: ZoneLike[], regionId: MapRegionId): ZoneLike[] {
  const bounds = MAP_REGIONS[regionId].bounds
  return zones.filter((zone) => {
    if (!zone.isActive || zone.polygon.length < 3) return false
    const centroid = zoneCentroid(zone)
    return centroid ? pointInBounds(centroid, bounds) : false
  })
}

export function getDefaultMapCenter(): LatLng {
  return MAP_REGIONS[DEFAULT_REGION].defaultCenter
}

export function getDefaultMapCenterTuple(): [number, number] {
  const center = getDefaultMapCenter()
  return [center.lat, center.lng]
}

export function getDefaultMapZoom(): number {
  return MAP_REGIONS[DEFAULT_REGION].defaultZoom
}

/**
 * Map center from service zones. With zones in both countries, prefers the cluster
 * nearest to hint (e.g. user geolocation or current map center).
 */
export function resolveMapCenter(zones: ZoneLike[], hint?: LatLng | null): LatLng {
  const compactCenter = getZonesCenter(zones)
  const compactViewbox = getCompactZonesViewbox(zones)
  if (compactCenter && compactViewbox) return compactCenter

  const ltZones = filterZonesInRegion(zones, 'lt')
  const azZones = filterZonesInRegion(zones, 'az')
  const ltCenter = getZonesCenter(ltZones)
  const azCenter = getZonesCenter(azZones)

  if (ltCenter && !azCenter) return ltCenter
  if (azCenter && !ltCenter) return azCenter

  if (ltCenter && azCenter) {
    if (hint) {
      const ltDistance = haversineKm(hint, ltCenter)
      const azDistance = haversineKm(hint, azCenter)
      return ltDistance <= azDistance ? ltCenter : azCenter
    }
    return getDefaultMapCenter()
  }

  if (hint) return hint
  return getDefaultMapCenter()
}

export interface GeocodeSearchScope {
  viewbox: string | null
  countryCodes: string
}

/**
 * Lithuania + Azerbaijan by default. Biases results to:
 * - compact service-zone cluster, or
 * - the operating region nearest to the current map center.
 */
export function resolveGeocodeSearchScope(
  zones: ZoneLike[] = [],
  mapCenter?: LatLng | null,
): GeocodeSearchScope {
  const compactViewbox = getCompactZonesViewbox(zones)
  if (compactViewbox) {
    return { viewbox: compactViewbox, countryCodes: OPERATING_COUNTRY_CODES }
  }

  if (mapCenter) {
    const regionId = inferNearestRegionId(mapCenter)
    return {
      viewbox: MAP_REGIONS[regionId].viewbox,
      countryCodes: OPERATING_COUNTRY_CODES,
    }
  }

  return { viewbox: null, countryCodes: OPERATING_COUNTRY_CODES }
}
