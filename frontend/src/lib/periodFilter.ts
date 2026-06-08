import {
  addAppLocalDays,
  parseApiDateTime,
  toAppLocalDateInput,
  toAppLocalTimeInput,
} from '../i18n/dateTime'

export interface PeriodFilterState {
  filterDate: string
  filterDateEnd: string
  filterTime: string
  filterTimeEnd: string
}

export interface RideDateTimeFilterFields {
  dateTime: string
  dateTimeLocal?: string | null
}

function rideLocalParts(fields: RideDateTimeFilterFields | string): { date: string; time: string } {
  if (typeof fields === 'string') {
    const instant = parseApiDateTime(fields)
    return {
      date: toAppLocalDateInput(instant),
      time: toAppLocalTimeInput(instant),
    }
  }

  const local = fields.dateTimeLocal?.trim()
  if (local) {
    const [date, time = ''] = local.split('T')
    return { date, time: time.slice(0, 5) }
  }

  const instant = parseApiDateTime(fields.dateTime)
  return {
    date: toAppLocalDateInput(instant),
    time: toAppLocalTimeInput(instant),
  }
}

function timeToMinutes(value: string): number {
  const [hour, minute] = value.split(':').map(Number)
  return hour * 60 + minute
}

export function matchesPeriodFilter(
  fields: RideDateTimeFilterFields | string,
  { filterDate, filterDateEnd, filterTime, filterTimeEnd }: PeriodFilterState,
): boolean {
  const { date: reqDate, time: reqTime } = rideLocalParts(fields)

  if (filterDate) {
    const endDate = filterDateEnd || filterDate
    if (reqDate < filterDate || reqDate > endDate) return false
  }

  if (filterTime || filterTimeEnd) {
    const reqMinutes = timeToMinutes(reqTime)
    if (filterTime) {
      if (reqMinutes < timeToMinutes(filterTime)) return false
    }
    if (filterTimeEnd) {
      if (reqMinutes > timeToMinutes(filterTimeEnd)) return false
    }
  }

  return true
}

/** @deprecated Use toAppLocalDateInput from i18n/dateTime */
export function toDateInputValue(value: Date): string {
  return toAppLocalDateInput(value)
}

export function getDefaultPeriodFilter(): PeriodFilterState {
  const today = toAppLocalDateInput(new Date())
  return {
    filterDate: today,
    filterDateEnd: today,
    filterTime: '00:00',
    filterTimeEnd: '23:59',
  }
}

export function getAppLocalDayOptions(): { today: string; tomorrow: string; dayAfterTomorrow: string } {
  const now = new Date()
  return {
    today: toAppLocalDateInput(now),
    tomorrow: addAppLocalDays(now, 1),
    dayAfterTomorrow: addAppLocalDays(now, 2),
  }
}

/** Slot key for similar-trip grouping in Europe/Vilnius wall clock. */
export function rideSlotKey(
  fields: RideDateTimeFilterFields | string,
  slotStepMinutes: number,
): string {
  const { date, time } = rideLocalParts(fields)
  const minutes = timeToMinutes(time)
  const slotIndex = Math.floor(minutes / Math.max(1, slotStepMinutes))
  return `${date}:${slotIndex}`
}
