import type { LatLng } from '../types'

export interface RouteStep {
  type: 'pickup' | 'dropoff'
  rideId: string
  passengerName: string
  location: LatLng
  address: string
}

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

/**
 * Greedy nearest-neighbor route optimization for driver rides.
 * Generates a recommended interleaved pickup/dropoff sequence.
 * Constraint: a passenger can only be dropped off after being picked up.
 */
export function optimizeDriverRoute(
  rides: Array<{
    id: string
    passengerName: string
    fromLatLng: LatLng
    fromAddress: string
    toLatLng: LatLng
    toAddress: string
  }>,
  driverLocation?: LatLng,
): RouteStep[] {
  if (rides.length === 0) return []

  if (rides.length === 1) {
    const r = rides[0]
    return [
      { type: 'pickup', rideId: r.id, passengerName: r.passengerName, location: r.fromLatLng, address: r.fromAddress },
      { type: 'dropoff', rideId: r.id, passengerName: r.passengerName, location: r.toLatLng, address: r.toAddress },
    ]
  }

  type Candidate = RouteStep & { done: boolean }
  const pickups: Candidate[] = rides.map((r) => ({
    type: 'pickup',
    rideId: r.id,
    passengerName: r.passengerName,
    location: r.fromLatLng,
    address: r.fromAddress,
    done: false,
  }))
  const dropoffs: Candidate[] = rides.map((r) => ({
    type: 'dropoff',
    rideId: r.id,
    passengerName: r.passengerName,
    location: r.toLatLng,
    address: r.toAddress,
    done: false,
  }))

  const pickedUp = new Set<string>()
  const steps: RouteStep[] = []
  let current: LatLng = driverLocation ?? rides[0].fromLatLng

  const totalPoints = pickups.length + dropoffs.length

  for (let i = 0; i < totalPoints; i++) {
    let bestDist = Infinity
    let bestCandidate: Candidate | null = null

    for (const p of pickups) {
      if (p.done) continue
      const d = haversineKm(current, p.location)
      if (d < bestDist) {
        bestDist = d
        bestCandidate = p
      }
    }

    for (const d of dropoffs) {
      if (d.done) continue
      if (!pickedUp.has(d.rideId)) continue
      const dist = haversineKm(current, d.location)
      if (dist < bestDist) {
        bestDist = dist
        bestCandidate = d
      }
    }

    if (!bestCandidate) break

    bestCandidate.done = true
    current = bestCandidate.location
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
