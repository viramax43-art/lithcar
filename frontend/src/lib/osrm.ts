import type { LatLng } from '../types'

const OSRM_BASE = import.meta.env.VITE_OSRM_BASE_URL || 'https://router.project-osrm.org'

export const OSRM_ERROR_KEYS = {
  optimizeRouteUnavailable: 'errors.osrmOptimizeRouteUnavailable',
  similarTripsUnavailable: 'errors.osrmSimilarTripsUnavailable',
  roadRouteFailed: 'errors.osrmRoadRouteFailed',
} as const
export interface DistanceDurationMatrix {
  distanceKm: number[][]
  durationMin: number[][]
}

/**
 * Get NxN road-distance matrix (km) via OSRM /table endpoint.
 * Returns null on failure.
 */
export async function osrmDistanceMatrixKm(
  points: LatLng[],
): Promise<number[][] | null> {
  if (points.length < 2) return null
  const coords = points.map((p) => `${p.lng},${p.lat}`).join(';')
  const url = `${OSRM_BASE}/table/v1/driving/${coords}?annotations=distance`
  try {
    const resp = await fetch(url)
    if (!resp.ok) return null
    const data = await resp.json()
    if (data.code !== 'Ok') return null
    return (data.distances as number[][]).map((row: number[]) =>
      row.map((m: number) => m / 1000),
    )
  } catch {
    return null
  }
}

/**
 * Get NxN road distance (km) and duration (min) matrix via OSRM /table endpoint.
 * Returns null on failure.
 */
export async function osrmDistanceDurationMatrix(
  points: LatLng[],
): Promise<DistanceDurationMatrix | null> {
  if (points.length < 2) return null
  const coords = points.map((p) => `${p.lng},${p.lat}`).join(';')
  const url = `${OSRM_BASE}/table/v1/driving/${coords}?annotations=distance,duration`
  try {
    const resp = await fetch(url)
    if (!resp.ok) return null
    const data = await resp.json()
    if (data.code !== 'Ok') return null
    const distances = (data.distances as number[][]).map((row: number[]) => row.map((m: number) => m / 1000))
    const durations = (data.durations as number[][]).map((row: number[]) => row.map((s: number) => s / 60))
    return { distanceKm: distances, durationMin: durations }
  } catch {
    return null
  }
}

/**
 * Get distance matrix from OSRM only.
 * Throws when routing service is unavailable.
 */
export async function getDistanceMatrixKm(points: LatLng[]): Promise<number[][]> {
  const osrm = await osrmDistanceMatrixKm(points)
  if (osrm) return osrm
  throw new Error(OSRM_ERROR_KEYS.optimizeRouteUnavailable)
}

/**
 * Get distance+duration matrix from OSRM only.
 * Throws when routing service is unavailable.
 */
export async function getDistanceDurationMatrix(points: LatLng[]): Promise<DistanceDurationMatrix> {
  const osrm = await osrmDistanceDurationMatrix(points)
  if (osrm) return osrm
  throw new Error(OSRM_ERROR_KEYS.similarTripsUnavailable)
}

/**
 * Build a road polyline (GeoJSON) through all waypoints in order.
 * Throws when OSRM is unavailable.
 */
export async function getRoadRoutePolyline(points: LatLng[]): Promise<LatLng[]> {
  if (points.length < 2) return points
  const coords = points.map((p) => `${p.lng},${p.lat}`).join(';')
  const url = `${OSRM_BASE}/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=false`
  try {
    const resp = await fetch(url)
    if (!resp.ok) throw new Error('OSRM route response not ok')
    const data = await resp.json()
    if (data.code !== 'Ok' || !data.routes?.[0]?.geometry?.coordinates) {
      throw new Error('OSRM route has no geometry')
    }
    const coordinates = data.routes[0].geometry.coordinates as [number, number][]
    return coordinates.map(([lng, lat]) => ({ lat, lng }))
  } catch {
    throw new Error(OSRM_ERROR_KEYS.roadRouteFailed)
  }
}
