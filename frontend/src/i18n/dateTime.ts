import i18n from './index'
import { normalizeLanguage } from './languages'

const DATE_LOCALE_BY_LANGUAGE: Record<string, string> = {
  lt: 'lt-LT',
  pl: 'pl-PL',
  en: 'en-US',
  ru: 'ru-RU',
}

export function getCurrentDateLocale(): string {
  const lang = normalizeLanguage(i18n.language)
  return DATE_LOCALE_BY_LANGUAGE[lang]
}

export function formatDate(value: Date, options?: Intl.DateTimeFormatOptions): string {
  return value.toLocaleDateString(getCurrentDateLocale(), options)
}

export function formatTime(value: Date, options?: Intl.DateTimeFormatOptions): string {
  return value.toLocaleTimeString(getCurrentDateLocale(), options)
}

export function formatDateTime(value: Date, options?: Intl.DateTimeFormatOptions): string {
  return value.toLocaleString(getCurrentDateLocale(), options)
}
