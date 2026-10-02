import { afterEach, describe, expect, it, vi } from 'vitest'

import { buildRideTimeSlots } from './rideTimeSlots'

describe('buildRideTimeSlots', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('builds slots for the full day using the configured interval', () => {
    const slots = buildRideTimeSlots({
      workStartTime: '06:00',
      workEndTime: '19:00',
      slotIntervalMinutes: 30,
      selectedDate: '2099-01-01',
    })

    expect(slots).toHaveLength(48)
    expect(slots[0]).toBe('00:00')
    expect(slots).toContain('05:30')
    expect(slots).toContain('19:30')
    expect(slots[slots.length - 1]).toBe('23:30')
  })

  it('keeps interval alignment from midnight', () => {
    const slots = buildRideTimeSlots({
      workStartTime: '06:00',
      workEndTime: '19:00',
      slotIntervalMinutes: 45,
      selectedDate: '2099-01-01',
    })

    expect(slots.slice(0, 4)).toEqual(['00:00', '00:45', '01:30', '02:15'])
    expect(slots).not.toContain('06:30')
  })

  it('enforces a 2-hour lead time for today', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-10T10:07:00Z')) // 12:07 in Europe/Vilnius

    const slots = buildRideTimeSlots({
      workStartTime: '06:00',
      workEndTime: '19:00',
      slotIntervalMinutes: 30,
      selectedDate: '2026-01-10',
    })

    // 12:07 + 2h = 14:07 → next 30-min slot is 14:30
    expect(slots[0]).toBe('14:30')
    expect(slots[slots.length - 1]).toBe('23:30')
  })

  it('keeps tonight/early-morning slots after midnight', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-28T00:29:00+03:00'))

    const slots = buildRideTimeSlots({
      workStartTime: '06:00',
      workEndTime: '19:00',
      slotIntervalMinutes: 30,
      selectedDate: '2026-09-28',
    })

    // 00:29 + 2h → 02:29 → first aligned slot 02:30
    expect(slots[0]).toBe('02:30')
    expect(slots.length).toBeGreaterThan(10)
  })

  it('skips the boundary slot the API would reject a second later', () => {
    vi.useFakeTimers()
    // 12:00:00 in Europe/Vilnius — 14:00 is exactly "now + 2h", so by the time the
    // request reaches the backend it is already too early. Safety margin skips it.
    vi.setSystemTime(new Date('2026-01-10T10:00:00Z'))

    const slots = buildRideTimeSlots({
      workStartTime: '06:00',
      workEndTime: '19:00',
      slotIntervalMinutes: 30,
      selectedDate: '2026-01-10',
    })

    expect(slots[0]).toBe('14:30')
  })

  it('accounts for the seconds of the current wall clock', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-10T10:00:30Z')) // 12:00:30 in Europe/Vilnius

    const slots = buildRideTimeSlots({
      workStartTime: '06:00',
      workEndTime: '19:00',
      slotIntervalMinutes: 30,
      selectedDate: '2026-01-10',
    })

    expect(slots[0]).toBe('14:30')
  })
})
