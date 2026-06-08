import { normalizeLanguage, type AppLanguage } from '../i18n/languages'

/** Nominatim accept-language values (BCP 47, ordered by preference). */
const NOMINATIM_ACCEPT_LANGUAGE: Record<AppLanguage, string> = {
  lt: 'lt-LT,lt,en',
  pl: 'pl-PL,pl,en',
  en: 'en-US,en',
  ru: 'ru-RU,ru,en',
}

export function getNominatimAcceptLanguage(language?: string | null): string {
  return NOMINATIM_ACCEPT_LANGUAGE[normalizeLanguage(language)]
}
