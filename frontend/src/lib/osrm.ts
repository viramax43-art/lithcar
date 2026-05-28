import type { LatLng } from '../types'

const OSRM_BASE = 'https://router.project-osrm.org'

/**
 * Get NxN road-distance matrix (km) via OSRM /table endpoint.
 * Returns null on failure so caller can fall back to haversine.
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
 * Haversine fallback — straight-line distance matrix.
 */
function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const sinLat = Math.sin(dLat / 2)
  const sinLng = Math.sin(dLng / 2)
  const h =
    sinLat * sinLat +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * sinLng * sinLng
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

function haversineMatrix(points: LatLng[]): number[][] {
  const n = points.length
  const m: number[][] = Array.from({ length: n }, () => Array(n).fill(0))
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = haversineKm(points[i], points[j])
      m[i][j] = d
      m[j][i] = d
    }
  }
  return m
}

/**
 * Get distance matrix — tries OSRM, falls back to haversine.
 */
export async function getDistanceMatrixKm(points: LatLng[]): Promise<number[][]> {
  const osrm = await osrmDistanceMatrixKm(points)
  if (osrm) return osrm
  return haversineMatrix(points)
}
