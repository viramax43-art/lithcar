import i18n from '../../../i18n'
import { rideSlotKey } from '../../../lib/periodFilter'
import type { RideRequest } from '../../../types'
import { getDistanceDurationMatrix, type DistanceDurationMatrix } from '../../../lib/osrm'

type Stop = {
  rideId: string
  type: 'pickup' | 'dropoff'
  pointIdx: number
  location: { lat: number; lng: number }
  address: string
  passengerName: string
}

export interface SimilarTripGroup {
  id: string
  requestIds: string[]
  slotKey: string
  savingsKm: number
  savingsMin: number
  totalKm: number
  totalMin: number
  score: number
  reason: string
  steps: Array<{
    rideId: string
    type: 'pickup' | 'dropoff'
    location: { lat: number; lng: number }
    address: string
    passengerName: string
  }>
}

export interface SimilarTripBuildDeps {
  getMatrix?: (points: Array<{ lat: number; lng: number }>) => Promise<DistanceDurationMatrix>
}

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items.slice()]
  const result: T[][] = []
  items.forEach((item, idx) => {
    const rest = items.slice(0, idx).concat(items.slice(idx + 1))
    permutations(rest).forEach((tail) => result.push([item, ...tail]))
  })
  return result
}

function evaluateSequentialBaseline(stopsByRide: Map<string, { pickup: Stop; dropoff: Stop }>, matrix: DistanceDurationMatrix): { km: number; min: number } {
  const rideIds = Array.from(stopsByRide.keys())
  let bestKm = Number.POSITIVE_INFINITY
  let bestMin = Number.POSITIVE_INFINITY

  permutations(rideIds).forEach((order) => {
    let km = 0
    let min = 0
    let prevDrop: Stop | null = null
    order.forEach((rideId) => {
      const pair = stopsByRide.get(rideId)
      if (!pair) return
      if (prevDrop) {
        km += matrix.distanceKm[prevDrop.pointIdx][pair.pickup.pointIdx]
        min += matrix.durationMin[prevDrop.pointIdx][pair.pickup.pointIdx]
      }
      km += matrix.distanceKm[pair.pickup.pointIdx][pair.dropoff.pointIdx]
      min += matrix.durationMin[pair.pickup.pointIdx][pair.dropoff.pointIdx]
      prevDrop = pair.dropoff
    })
    if (km < bestKm) bestKm = km
    if (min < bestMin) bestMin = min
  })

  return { km: bestKm, min: bestMin }
}

function evaluateBestInterleaved(stops: Stop[], matrix: DistanceDurationMatrix): { km: number; min: number; seq: Stop[] } {
  const picked = new Set<string>()
  const done = new Set<number>()
  let bestKm = Number.POSITIVE_INFINITY
  let bestMin = Number.POSITIVE_INFINITY
  let bestSeq: Stop[] = []

  const dfs = (prevIdx: number | null, km: number, min: number, seq: Stop[]) => {
    if (seq.length === stops.length) {
      if (km < bestKm || (Math.abs(km - bestKm) < 1e-9 && min < bestMin)) {
        bestKm = km
        bestMin = min
        bestSeq = seq.slice()
      }
      return
    }
    if (km > bestKm) return

    for (let i = 0; i < stops.length; i++) {
      if (done.has(i)) continue
      const next = stops[i]
      if (next.type === 'dropoff' && !picked.has(next.rideId)) continue

      const edgeKm = prevIdx == null ? 0 : matrix.distanceKm[prevIdx][next.pointIdx]
      const edgeMin = prevIdx == null ? 0 : matrix.durationMin[prevIdx][next.pointIdx]

      done.add(i)
      const justPicked = next.type === 'pickup'
      if (justPicked) picked.add(next.rideId)
      seq.push(next)
      dfs(next.pointIdx, km + edgeKm, min + edgeMin, seq)
      seq.pop()
      if (justPicked) picked.delete(next.rideId)
      done.delete(i)
    }
  }

  dfs(null, 0, 0, [])
  return { km: bestKm, min: bestMin, seq: bestSeq }
}

function buildReason(size: number, savingsKm: number, savingsMin: number): string {
  const km = savingsKm.toFixed(1)
  const min = Math.round(savingsMin)
  if (size === 2) {
    return i18n.t('admin.similarTrips.reasonPair', { km, min })
  }
  return i18n.t('admin.similarTrips.reasonGroup', { size, km, min })
}

function scoreGroup(savingsKm: number, savingsMin: number, totalMin: number): number {
  const efficiency = totalMin > 0 ? (savingsMin / totalMin) * 100 : 0
  return savingsMin * 2 + savingsKm * 1.5 + efficiency
}

export async function buildSimilarTripGroups(
  requests: RideRequest[],
  slotStepMinutes: number,
  deps: SimilarTripBuildDeps = {},
): Promise<SimilarTripGroup[]> {
  if (requests.length < 2) return []
  const getMatrix = deps.getMatrix ?? getDistanceDurationMatrix

  const bySlot = new Map<string, RideRequest[]>()
  requests.forEach((r) => {
    const key = rideSlotKey(
      { dateTime: r.dateTime, dateTimeLocal: r.dateTimeLocal },
      slotStepMinutes,
    )
    const bucket = bySlot.get(key) ?? []
    bucket.push(r)
    bySlot.set(key, bucket)
  })

  const groups: SimilarTripGroup[] = []

  for (const [slotKey, slotRequests] of bySlot.entries()) {
    if (slotRequests.length < 2) continue

    const points = slotRequests.flatMap((r) => [r.from.latlng, r.to.latlng])
    const matrix = await getMatrix(points)

    // For each pair and triplet in slot, evaluate real interleaved feasibility.
    const indices = slotRequests.map((_, idx) => idx)
    const subsets: number[][] = []
    for (let i = 0; i < indices.length; i++) {
      for (let j = i + 1; j < indices.length; j++) subsets.push([i, j])
    }
    for (let i = 0; i < indices.length; i++) {
      for (let j = i + 1; j < indices.length; j++) {
        for (let k = j + 1; k < indices.length; k++) subsets.push([i, j, k])
      }
    }

    subsets.forEach((subset, subsetIdx) => {
      const rides = subset.map((idx) => slotRequests[idx])
      const stops: Stop[] = []
      const byRide = new Map<string, { pickup: Stop; dropoff: Stop }>()

      rides.forEach((r) => {
        const originalIdx = slotRequests.findIndex((x) => x.id === r.id)
        const pickup: Stop = {
          rideId: r.id,
          type: 'pickup',
          pointIdx: originalIdx * 2,
          location: r.from.latlng,
          address: r.from.address,
          passengerName: r.passengerName,
        }
        const dropoff: Stop = {
          rideId: r.id,
          type: 'dropoff',
          pointIdx: originalIdx * 2 + 1,
          location: r.to.latlng,
          address: r.to.address,
          passengerName: r.passengerName,
        }
        stops.push(pickup, dropoff)
        byRide.set(r.id, { pickup, dropoff })
      })

      const baseline = evaluateSequentialBaseline(byRide, matrix)
      const interleaved = evaluateBestInterleaved(stops, matrix)
      const savingsKm = Math.max(0, baseline.km - interleaved.km)
      const savingsMin = Math.max(0, baseline.min - interleaved.min)

      // Keep only truly valuable, geographically close groups.
      const minSavingsMin = rides.length === 2 ? 4 : 6
      const minSavingsKm = rides.length === 2 ? 1.2 : 2.0
      if (savingsMin < minSavingsMin && savingsKm < minSavingsKm) return

      const score = scoreGroup(savingsKm, savingsMin, interleaved.min)
      groups.push({
        id: `slot:${slotKey}:subset:${subsetIdx}:${rides.map((r) => r.id).join(',')}`,
        requestIds: rides.map((r) => r.id),
        slotKey,
        savingsKm,
        savingsMin,
        totalKm: interleaved.km,
        totalMin: interleaved.min,
        score,
        reason: buildReason(rides.length, savingsKm, savingsMin),
        steps: interleaved.seq.map((s) => ({
          rideId: s.rideId,
          type: s.type,
          location: s.location,
          address: s.address,
          passengerName: s.passengerName,
        })),
      })
    })
  }

  // Keep only top profitable non-overlapping groups (one ride belongs to one group max).
  const sorted = groups.sort((a, b) => b.score - a.score)
  const usedRideIds = new Set<string>()
  const disjoint: SimilarTripGroup[] = []
  for (const group of sorted) {
    if (group.requestIds.some((id) => usedRideIds.has(id))) continue
    disjoint.push(group)
    group.requestIds.forEach((id) => usedRideIds.add(id))
    if (disjoint.length >= 24) break
  }
  return disjoint
}

