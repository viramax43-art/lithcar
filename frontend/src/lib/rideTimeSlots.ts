import { APP_TIMEZONE } from '../i18n/dateTime'

export const MIN_BOOKING_LEAD_HOURS = 0

function getAppLocalNow(): { date: string; totalMinutes: number } {
  const now = new Date()
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: APP_TIMEZONE }).format(now)
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: APP_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now)
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0)
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0)
  return { date, totalMinutes: hour * 60 + minute }
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
  const minMinutes = selectedDate === today ? nowMinutes + minLeadHours * 60 : 0

  const slots: string[] = []
  for (let t = 0; t < 24 * 60; t += interval) {
    if (t < minMinutes) continue
    const hh = String(Math.floor(t / 60)).padStart(2, '0')
    const mm = String(t % 60).padStart(2, '0')
    slots.push(`${hh}:${mm}`)
  }
  return slots
}
