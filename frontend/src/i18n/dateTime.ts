import i18n from './index'
import { normalizeLanguage } from './languages'

export const APP_TIMEZONE = 'Europe/Vilnius'

export interface RideDateTimeFields {
  dateTime: string
  dateTimeLocal?: string | null
}

const DATE_LOCALE_BY_LANGUAGE: Record<string, string> = {
  lt: 'lt-LT',
  pl: 'pl-PL',
  en: 'en-US',
  ru: 'ru-RU',
}

function withAppTimezone(options?: Intl.DateTimeFormatOptions): Intl.DateTimeFormatOptions {
  return { timeZone: APP_TIMEZONE, hour12: false, ...options }
}

export function getCurrentDateLocale(): string {
  const lang = normalizeLanguage(i18n.language)
  return DATE_LOCALE_BY_LANGUAGE[lang]
}

/** Parse API ISO datetime as an absolute instant (naive values are treated as UTC). */
export function parseApiDateTime(value: string): Date {
  const trimmed = value.trim()
  if (!trimmed) return new Date(NaN)
  if (/[zZ]$|[+-]\d{2}:\d{2}$/.test(trimmed)) return new Date(trimmed)
  return new Date(`${trimmed}Z`)
}

export function formatDate(value: Date, options?: Intl.DateTimeFormatOptions): string {
  return value.toLocaleDateString(getCurrentDateLocale(), withAppTimezone(options))
}

export function formatTime(value: Date, options?: Intl.DateTimeFormatOptions): string {
  return value.toLocaleTimeString(getCurrentDateLocale(), withAppTimezone(options))
}

export function formatDateTime(value: Date, options?: Intl.DateTimeFormatOptions): string {
  return value.toLocaleString(getCurrentDateLocale(), withAppTimezone(options))
}

function splitLocalDateTime(local?: string | null): { date: string; time: string } | null {
  if (!local) return null
  const [date, time = ''] = local.split('T')
  if (!date) return null
  return { date, time: time.slice(0, 5) }
}

export function formatRideTime(fields: RideDateTimeFields | string): string {
  if (typeof fields !== 'string') {
    const local = splitLocalDateTime(fields.dateTimeLocal)
    if (local?.time) return local.time
    return formatTime(parseApiDateTime(fields.dateTime), { hour: '2-digit', minute: '2-digit' })
  }
  return formatTime(parseApiDateTime(fields), { hour: '2-digit', minute: '2-digit' })
}

export function formatRideDate(
  fields: RideDateTimeFields | string,
  options?: Intl.DateTimeFormatOptions,
): string {
  if (typeof fields !== 'string') {
    const local = splitLocalDateTime(fields.dateTimeLocal)
    if (local?.date) {
      return formatDate(parseApiDateTime(`${local.date}T12:00:00Z`), options)
    }
    return formatDate(parseApiDateTime(fields.dateTime), options)
  }
  return formatDate(parseApiDateTime(fields), options)
}

export function formatRideDateTime(
  fields: RideDateTimeFields | string,
  options?: Intl.DateTimeFormatOptions,
): string {
  if (typeof fields !== 'string' && fields.dateTimeLocal) {
    const local = splitLocalDateTime(fields.dateTimeLocal)
    if (local?.date && local.time) {
      return `${formatRideDate(fields, options)} ${local.time}`
    }
  }
  const value = typeof fields === 'string' ? parseApiDateTime(fields) : parseApiDateTime(fields.dateTime)
  return formatDateTime(value, options)
}

/** YYYY-MM-DD in app timezone (for `<input type="date">`). */
export function toAppLocalDateInput(value: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: APP_TIMEZONE }).format(value)
}

/** HH:mm in app timezone (for time slot selects). */
export function toAppLocalTimeInput(value: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: APP_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(value)
  const hour = parts.find((p) => p.type === 'hour')?.value ?? '00'
  const minute = parts.find((p) => p.type === 'minute')?.value ?? '00'
  return `${hour}:${minute}`
}

export function rideLocalDateInput(fields: RideDateTimeFields): string {
  const local = splitLocalDateTime(fields.dateTimeLocal)
  if (local?.date) return local.date
  return toAppLocalDateInput(parseApiDateTime(fields.dateTime))
}

export function rideLocalTimeInput(fields: RideDateTimeFields): string {
  const local = splitLocalDateTime(fields.dateTimeLocal)
  if (local?.time) return local.time
  return toAppLocalTimeInput(parseApiDateTime(fields.dateTime))
}

export function addAppLocalDays(value: Date, days: number): string {
  const shifted = new Date(value.getTime() + days * 24 * 60 * 60 * 1000)
  return toAppLocalDateInput(shifted)
}
