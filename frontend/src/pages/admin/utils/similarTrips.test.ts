import { describe, expect, it } from 'vitest'
import type { RideRequest } from '../../../types'
import { buildSimilarTripGroups } from './similarTrips'

const makeReq = (
  id: string,
  dateTime: string,
  from: [number, number],
  to: [number, number],
): RideRequest => ({
  id,
  rideNumber: Number(id.replace(/\D/g, '') || '1'),
  passengerName: `Passenger ${id}`,
  from: { address: `From ${id}`, latlng: { lat: from[0], lng: from[1] } },
  to: { address: `To ${id}`, latlng: { lat: to[0], lng: to[1] } },
  dateTime,
  status: 'pending',
  pickupChangedByDriver: false,
  pickupConfirmedAt: null,
  createdAt: '2026-01-01T09:00:00',
})

const matrixFromPoints = async (points: Array<{ lat: number; lng: number }>) => {
  const distanceKm = points.map((a) =>
    points.map((b) => Math.hypot(a.lat - b.lat, a.lng - b.lng)),
  )
  const durationMin = distanceKm.map((row) => row.map((v) => v * 2))
  return { distanceKm, durationMin }
}

describe('buildSimilarTripGroups', () => {
  it('builds profitable group for nearby rides in same slot', async () => {
    const reqA = makeReq('1', '2026-05-28T10:05:00', [0, 0], [10, 0])
    const reqB = makeReq('2', '2026-05-28T10:10:00', [1, 0], [11, 0])

    const groups = await buildSimilarTripGroups([reqA, reqB], 30, { getMatrix: matrixFromPoints })
    expect(groups.length).toBeGreaterThan(0)
    expect(groups[0].requestIds.sort()).toEqual(['1', '2'])
    expect(groups[0].savingsKm).toBeGreaterThan(1)
    expect(groups[0].savingsMin).toBeGreaterThan(2)
  })

  it('does not merge rides from different time slots', async () => {
    const reqA = makeReq('1', '2026-05-28T10:05:00', [0, 0], [10, 0])
    const reqB = makeReq('2', '2026-05-28T11:10:00', [1, 0], [11, 0])

    const groups = await buildSimilarTripGroups([reqA, reqB], 30, { getMatrix: matrixFromPoints })
    expect(groups).toHaveLength(0)
  })

  it('keeps pickup before dropoff in every recommended step sequence', async () => {
    const reqA = makeReq('1', '2026-05-28T10:05:00', [0, 0], [10, 0])
    const reqB = makeReq('2', '2026-05-28T10:10:00', [1, 0], [11, 0])
    const reqC = makeReq('3', '2026-05-28T10:15:00', [2, 0], [12, 0])

    const groups = await buildSimilarTripGroups([reqA, reqB, reqC], 30, { getMatrix: matrixFromPoints })
    expect(groups.length).toBeGreaterThan(0)

    groups.forEach((group) => {
      const picked = new Set<string>()
      group.steps.forEach((step) => {
        if (step.type === 'pickup') picked.add(step.rideId)
        if (step.type === 'dropoff') {
          expect(picked.has(step.rideId)).toBe(true)
        }
      })
    })
  })

  it('can produce multiple groups in one slot', async () => {
    const rides = [
      makeReq('1', '2026-05-28T10:05:00', [0, 0], [10, 0]),
      makeReq('2', '2026-05-28T10:10:00', [1, 0], [11, 0]),
      makeReq('3', '2026-05-28T10:12:00', [0, 1], [10, 1]),
      makeReq('4', '2026-05-28T10:16:00', [1, 1], [11, 1]),
    ]
    const groups = await buildSimilarTripGroups(rides, 30, { getMatrix: matrixFromPoints })
    expect(groups.length).toBeGreaterThan(0)
    const used = new Set<string>()
    groups.forEach((g) => {
      g.requestIds.forEach((id) => {
        expect(used.has(id)).toBe(false)
        used.add(id)
      })
    })
  })

  it('throws clear error when routing matrix is unavailable', async () => {
    const reqA = makeReq('1', '2026-05-28T10:05:00', [0, 0], [10, 0])
    const reqB = makeReq('2', '2026-05-28T10:10:00', [1, 0], [11, 0])
    await expect(
      buildSimilarTripGroups([reqA, reqB], 30, {
        getMatrix: async () => {
          throw new Error('routing unavailable')
        },
      }),
    ).rejects.toThrow('routing unavailable')
  })
})

