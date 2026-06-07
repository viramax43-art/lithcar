import { APP_TIMEZONE } from '../i18n/dateTime'

export const MIN_BOOKING_LEAD_HOURS = 5

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
  workStartTime: string
  workEndTime: string
  slotIntervalMinutes: number
  selectedDate: string
  minLeadHours?: number
}): string[] {
  const {
    workStartTime,
    workEndTime,
    slotIntervalMinutes,
    selectedDate,
    minLeadHours = MIN_BOOKING_LEAD_HOURS,
  } = params

  const [sh, sm] = workStartTime.split(':').map(Number)
  const [eh, em] = workEndTime.split(':').map(Number)
  const interval = Math.max(1, slotIntervalMinutes)
  const startMin = sh * 60 + sm
  const endMin = eh * 60 + em

  const { date: today, totalMinutes: nowMinutes } = getAppLocalNow()
  const minMinutes = selectedDate === today ? nowMinutes + minLeadHours * 60 : startMin

  const slots: string[] = []
  for (let t = startMin; t <= endMin; t += interval) {
    if (t < minMinutes) continue
    const hh = String(Math.floor(t / 60)).padStart(2, '0')
    const mm = String(t % 60).padStart(2, '0')
    slots.push(`${hh}:${mm}`)
  }
  return slots
}
