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

  it('keeps today bookable from the next interval without a lead-time cutoff', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-10T10:07:00Z')) // 12:07 in Europe/Vilnius

    const slots = buildRideTimeSlots({
      workStartTime: '06:00',
      workEndTime: '19:00',
      slotIntervalMinutes: 30,
      selectedDate: '2026-01-10',
    })

    expect(slots[0]).toBe('12:30')
    expect(slots[slots.length - 1]).toBe('23:30')
  })
})
