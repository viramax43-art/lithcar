import type { LatLng } from '../types'
import { getDistanceMatrixKm } from './osrm'

export interface RouteStep {
  type: 'pickup' | 'dropoff'
  rideId: string
  passengerName: string
  location: LatLng
  address: string
}

/**
 * Greedy nearest-neighbor route optimization using OSRM road distances.
 * Generates a recommended interleaved pickup/dropoff sequence.
 * Constraint: a passenger can only be dropped off after being picked up.
 */
export async function optimizeDriverRoute(
  rides: Array<{
    id: string
    passengerName: string
    fromLatLng: LatLng
    fromAddress: string
    toLatLng: LatLng
    toAddress: string
  }>,
  driverLocation?: LatLng,
): Promise<RouteStep[]> {
  if (rides.length === 0) return []

  if (rides.length === 1) {
    const r = rides[0]
    return [
      { type: 'pickup', rideId: r.id, passengerName: r.passengerName, location: r.fromLatLng, address: r.fromAddress },
      { type: 'dropoff', rideId: r.id, passengerName: r.passengerName, location: r.toLatLng, address: r.toAddress },
    ]
  }

  // Build points array: [start, pickup_0, dropoff_0, pickup_1, dropoff_1, ...]
  const startPoint: LatLng = driverLocation ?? rides[0].fromLatLng
  const allPoints: LatLng[] = [startPoint]
  for (const r of rides) {
    allPoints.push(r.fromLatLng)
    allPoints.push(r.toLatLng)
  }
  const matrix = await getDistanceMatrixKm(allPoints)

  // Map point indices: ride i → pickup at 1 + i*2, dropoff at 2 + i*2
  type Candidate = RouteStep & { done: boolean; pointIdx: number }
  const pickups: Candidate[] = rides.map((r, i) => ({
    type: 'pickup',
    rideId: r.id,
    passengerName: r.passengerName,
    location: r.fromLatLng,
    address: r.fromAddress,
    done: false,
    pointIdx: 1 + i * 2,
  }))
  const dropoffs: Candidate[] = rides.map((r, i) => ({
    type: 'dropoff',
    rideId: r.id,
    passengerName: r.passengerName,
    location: r.toLatLng,
    address: r.toAddress,
    done: false,
    pointIdx: 2 + i * 2,
  }))

  const pickedUp = new Set<string>()
  const steps: RouteStep[] = []
  let currentIdx = 0 // start point

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
      if (!pickedUp.has(d.rideId)) continue
      const dist = matrix[currentIdx][d.pointIdx]
      if (dist < bestDist) {
        bestDist = dist
        bestCandidate = d
      }
    }

    if (!bestCandidate) break

    bestCandidate.done = true
    currentIdx = bestCandidate.pointIdx
    steps.push({
      type: bestCandidate.type,
      rideId: bestCandidate.rideId,
      passengerName: bestCandidate.passengerName,
      location: bestCandidate.location,
      address: bestCandidate.address,
    })

    if (bestCandidate.type === 'pickup') {
      pickedUp.add(bestCandidate.rideId)
    }
  }

  return steps
}
