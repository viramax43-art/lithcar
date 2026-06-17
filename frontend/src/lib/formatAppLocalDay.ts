import { formatDate } from '../i18n/dateTime'

/** "2026-06-12" → localized date label (noon avoids timezone day-shift). */
export function formatAppLocalDayLong(isoDate: string): string {
  const parsed = new Date(`${isoDate}T12:00:00`)
  if (Number.isNaN(parsed.getTime())) return isoDate
  return formatDate(parsed, { weekday: 'long', day: 'numeric', month: 'long' })
}

export function formatAppLocalDayShort(isoDate: string): string {
  const parsed = new Date(`${isoDate}T12:00:00`)
  if (Number.isNaN(parsed.getTime())) return isoDate
  return formatDate(parsed, { day: 'numeric', month: 'short' })
}
