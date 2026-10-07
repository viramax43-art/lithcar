import type { LatLng } from '../types'

const pointKey = (point: LatLng) => `${point.lat}:${point.lng}`

const cross = (origin: LatLng, a: LatLng, b: LatLng) =>
  (a.lng - origin.lng) * (b.lat - origin.lat) -
  (a.lat - origin.lat) * (b.lng - origin.lng)

/** Builds a convex outside boundary whose edges cannot cross each other. */
export function buildSimpleZoneBoundary(points: LatLng[]): LatLng[] {
  const unique = Array.from(new Map(points.map((point) => [pointKey(point), point])).values())
  if (unique.length < 3) return unique

  const sorted = [...unique].sort((a, b) => a.lng - b.lng || a.lat - b.lat)
  const lower: LatLng[] = []
  for (const point of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) {
      lower.pop()
    }
    lower.push(point)
  }

  const upper: LatLng[] = []
  for (let index = sorted.length - 1; index >= 0; index -= 1) {
    const point = sorted[index]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) {
      upper.pop()
    }
    upper.push(point)
  }

  return lower.slice(0, -1).concat(upper.slice(0, -1))
}
