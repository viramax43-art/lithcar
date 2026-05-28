import type { LatLng } from '../types'

const OSRM_BASE = 'https://router.project-osrm.org'
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
  throw new Error('Сейчас не получается рассчитать оптимальный маршрут: сервис маршрутизации недоступен.')
}

/**
 * Get distance+duration matrix from OSRM only.
 * Throws when routing service is unavailable.
 */
export async function getDistanceDurationMatrix(points: LatLng[]): Promise<DistanceDurationMatrix> {
  const osrm = await osrmDistanceDurationMatrix(points)
  if (osrm) return osrm
  throw new Error('Сейчас не получается подобрать похожие поездки: сервис маршрутизации недоступен.')
}
