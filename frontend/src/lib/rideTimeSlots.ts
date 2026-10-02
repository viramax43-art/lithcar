import { APP_TIMEZONE } from '../i18n/dateTime'

export const MIN_BOOKING_LEAD_HOURS = 2

/**
 * Safety margin on top of the lead time.
 *
 * Slots are built from the client wall clock, while the backend compares the
 * submitted datetime against `now + lead` on the exact timestamp. Without a
 * margin the first offered slot (i.e. "now + lead" landed on the slot grid) is
 * already a few seconds too early and the API answers
 * `Ride must be scheduled at least N hours in advance.` — even though the user
 * tapped a time the app itself offered.
 */
export const BOOKING_LEAD_SAFETY_MINUTES = 1

function getAppLocalNow(): { date: string; totalMinutes: number } {
  const now = new Date()
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: APP_TIMEZONE }).format(now)
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: APP_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(now)
  // Some WebViews report midnight as "24" with hour12:false — normalize to 0–23.
  let hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0)
  if (hour === 24) hour = 0
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0)
  const second = Number(parts.find((p) => p.type === 'second')?.value ?? 0)
  return { date, totalMinutes: hour * 60 + minute + second / 60 }
}

export function buildRideTimeSlots(params: {
  /** Legacy fields kept in the API contract; booking is available around the clock. */
  workStartTime: string
  workEndTime: string
  slotIntervalMinutes: number
  selectedDate: string
  minLeadHours?: number
}): string[] {
  const {
    slotIntervalMinutes,
    selectedDate,
    minLeadHours = MIN_BOOKING_LEAD_HOURS,
  } = params

  const interval = Math.max(1, slotIntervalMinutes)

  const { date: today, totalMinutes: nowMinutes } = getAppLocalNow()
  const minMinutes =
    selectedDate === today
      ? nowMinutes + minLeadHours * 60 + BOOKING_LEAD_SAFETY_MINUTES
      : 0

  const slots: string[] = []
  for (let t = 0; t < 24 * 60; t += interval) {
    if (t < minMinutes) continue
    const hh = String(Math.floor(t / 60)).padStart(2, '0')
    const mm = String(t % 60).padStart(2, '0')
    slots.push(`${hh}:${mm}`)
  }
  return slots
}
