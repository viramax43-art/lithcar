import i18n from './index'
import { normalizeLanguage } from './languages'

export const APP_TIMEZONE = 'Europe/Vilnius'

const DATE_LOCALE_BY_LANGUAGE: Record<string, string> = {
  lt: 'lt-LT',
  pl: 'pl-PL',
  en: 'en-US',
  ru: 'ru-RU',
}

function withAppTimezone(options?: Intl.DateTimeFormatOptions): Intl.DateTimeFormatOptions {
  return { timeZone: APP_TIMEZONE, ...options }
}

export function getCurrentDateLocale(): string {
  const lang = normalizeLanguage(i18n.language)
  return DATE_LOCALE_BY_LANGUAGE[lang]
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

export function addAppLocalDays(value: Date, days: number): string {
  const shifted = new Date(value.getTime() + days * 24 * 60 * 60 * 1000)
  return toAppLocalDateInput(shifted)
}
