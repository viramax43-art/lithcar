import i18n from '../../../i18n'
import type { LatLng, RideRequest } from '../../../types'
import { getDistanceMatrixKm } from '../../../lib/osrm'

export interface RouteStep {
  type: 'pickup' | 'dropoff'
  requestId: string
  passengerName: string
  location: LatLng
  address: string
}

export interface OptimizedRoute {
  steps: RouteStep[]
  totalDistanceKm: number
  savedDistanceKm: number
  explanation: string
}

/**
 * Greedy nearest-neighbor route optimization using OSRM road distances.
 * Generates a recommended order for picking up and dropping off passengers.
 * Constraints: a passenger can only be dropped off after being picked up.
 */
export async function optimizeRoute(
  requests: RideRequest[],
  driverLocation?: LatLng,
): Promise<OptimizedRoute> {
  if (requests.length === 0) {
    return { steps: [], totalDistanceKm: 0, savedDistanceKm: 0, explanation: i18n.t('admin.routeOptimizer.noRequests') }
  }

  if (requests.length === 1) {
    const r = requests[0]
    const steps: RouteStep[] = [
      { type: 'pickup', requestId: r.id, passengerName: r.passengerName, location: r.from.latlng, address: r.from.address },
      { type: 'dropoff', requestId: r.id, passengerName: r.passengerName, location: r.to.latlng, address: r.to.address },
    ]
    const pts: LatLng[] = [r.from.latlng, r.to.latlng]
    const m = await getDistanceMatrixKm(pts)
    const dist = m[0][1]
    return { steps, totalDistanceKm: dist, savedDistanceKm: 0, explanation: i18n.t('admin.routeOptimizer.singleRequest') }
  }

  // Build points: [start, pickup_0, dropoff_0, pickup_1, dropoff_1, ...]
  const startPoint: LatLng = driverLocation ?? requests[0].from.latlng
  const allPoints: LatLng[] = [startPoint]
  for (const r of requests) {
    allPoints.push(r.from.latlng)
    allPoints.push(r.to.latlng)
  }
  const matrix = await getDistanceMatrixKm(allPoints)

  type Candidate = RouteStep & { done: boolean; pointIdx: number }
  const pickups: Candidate[] = requests.map((r, i) => ({
    type: 'pickup',
    requestId: r.id,
    passengerName: r.passengerName,
    location: r.from.latlng,
    address: r.from.address,
    done: false,
    pointIdx: 1 + i * 2,
  }))
  const dropoffs: Candidate[] = requests.map((r, i) => ({
    type: 'dropoff',
    requestId: r.id,
    passengerName: r.passengerName,
    location: r.to.latlng,
    address: r.to.address,
    done: false,
    pointIdx: 2 + i * 2,
  }))

  const pickedUp = new Set<string>()
  const steps: RouteStep[] = []
  let currentIdx = 0
  let totalDist = 0

  const totalPoints = pickups.length + dropoffs.length

  for (let i = 0; i < totalPoints; i++) {
    let bestDist = Infinity
    let bestCandidate: Candidate | null = null

    for (const p of pickups) {
      if (p.done) continue
      const d = matrix[currentIdx][p.pointIdx]
      if (d < bestDist) {
        bestDist = d
        bestCandidate = p
      }
    }

    for (const d of dropoffs) {
      if (d.done) continue
      if (!pickedUp.has(d.requestId)) continue
      const dist = matrix[currentIdx][d.pointIdx]
      if (dist < bestDist) {
        bestDist = dist
        bestCandidate = d
      }
    }

    if (!bestCandidate) break

    bestCandidate.done = true
    totalDist += bestDist
    currentIdx = bestCandidate.pointIdx
    steps.push({
      type: bestCandidate.type,
      requestId: bestCandidate.requestId,
      passengerName: bestCandidate.passengerName,
      location: bestCandidate.location,
      address: bestCandidate.address,
    })

    if (bestCandidate.type === 'pickup') {
      pickedUp.add(bestCandidate.requestId)
    }
  }

  // Naive distance (sequential: pickup1→drop1→pickup2→drop2…)
  let naiveDist = 0
  const pickupIdx = (i: number) => 1 + i * 2
  const dropoffIdx = (i: number) => 2 + i * 2
  let naiveCurrentIdx = 0
  for (let i = 0; i < requests.length; i++) {
    naiveDist += matrix[naiveCurrentIdx][pickupIdx(i)]
    naiveDist += matrix[pickupIdx(i)][dropoffIdx(i)]
    naiveCurrentIdx = dropoffIdx(i)
  }

  const saved = Math.max(0, naiveDist - totalDist)
  const explanation =
    saved > 0.5
      ? i18n.t('admin.routeOptimizer.saved', { km: saved.toFixed(1) })
      : i18n.t('admin.routeOptimizer.almostOptimal')

  return { steps, totalDistanceKm: totalDist, savedDistanceKm: saved, explanation }
}
