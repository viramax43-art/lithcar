import type { LatLng, RideRequest } from '../../../types'

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
 * Greedy nearest-neighbor route optimization.
 * Generates a recommended order for picking up and dropping off passengers.
 * Constraints: a passenger can only be dropped off after being picked up.
 */
export function optimizeRoute(
  requests: RideRequest[],
  driverLocation?: LatLng,
): OptimizedRoute {
  if (requests.length === 0) {
    return { steps: [], totalDistanceKm: 0, savedDistanceKm: 0, explanation: 'Нет заявок для оптимизации.' }
  }

  if (requests.length === 1) {
    const r = requests[0]
    const steps: RouteStep[] = [
      { type: 'pickup', requestId: r.id, passengerName: r.passengerName, location: r.from.latlng, address: r.from.address },
      { type: 'dropoff', requestId: r.id, passengerName: r.passengerName, location: r.to.latlng, address: r.to.address },
    ]
    const dist = haversineKm(r.from.latlng, r.to.latlng)
    return { steps, totalDistanceKm: dist, savedDistanceKm: 0, explanation: 'Одна заявка — оптимизация не требуется.' }
  }

  // Build all candidate points
  type Candidate = RouteStep & { done: boolean }
  const pickups: Candidate[] = requests.map((r) => ({
    type: 'pickup',
    requestId: r.id,
    passengerName: r.passengerName,
    location: r.from.latlng,
    address: r.from.address,
    done: false,
  }))
  const dropoffs: Candidate[] = requests.map((r) => ({
    type: 'dropoff',
    requestId: r.id,
    passengerName: r.passengerName,
    location: r.to.latlng,
    address: r.to.address,
    done: false,
  }))

  const pickedUp = new Set<string>()
  const steps: RouteStep[] = []
  let current: LatLng = driverLocation ?? requests[0].from.latlng
  let totalDist = 0

  const totalPoints = pickups.length + dropoffs.length

  for (let i = 0; i < totalPoints; i++) {
    // Available next candidates: any un-done pickup, or any dropoff whose pickup is done
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
      if (!pickedUp.has(d.requestId)) continue // can't drop off before pickup
      const dist = haversineKm(current, d.location)
      if (dist < bestDist) {
        bestDist = dist
        bestCandidate = d
      }
    }

    if (!bestCandidate) break

    bestCandidate.done = true
    totalDist += bestDist
    current = bestCandidate.location
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

  // Naive distance (pickup1→drop1→pickup2→drop2…)
  let naiveDist = 0
  let naiveCurrent = driverLocation ?? requests[0].from.latlng
  for (const r of requests) {
    naiveDist += haversineKm(naiveCurrent, r.from.latlng)
    naiveDist += haversineKm(r.from.latlng, r.to.latlng)
    naiveCurrent = r.to.latlng
  }

  const saved = Math.max(0, naiveDist - totalDist)
  const explanation =
    saved > 0.5
      ? `Оптимальный маршрут экономит ~${saved.toFixed(1)} км по сравнению с последовательным выполнением.`
      : 'Маршрут близок к оптимальному, значительной экономии нет.'

  return { steps, totalDistanceKm: totalDist, savedDistanceKm: saved, explanation }
}
