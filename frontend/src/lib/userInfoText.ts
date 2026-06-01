import { DEFAULT_LANGUAGE, normalizeLanguage, SUPPORTED_LANGUAGES, type AppLanguage } from '../i18n/languages'

export type UserInfoTextI18n = Record<AppLanguage, string>

export const EMPTY_USER_INFO_TEXT: UserInfoTextI18n = {
  lt: '',
  pl: '',
  en: '',
  ru: '',
}

export function normalizeUserInfoText(raw: unknown): UserInfoTextI18n {
  if (typeof raw === 'string') {
    const text = raw.trim()
    if (!text) return { ...EMPTY_USER_INFO_TEXT }
    return { ...EMPTY_USER_INFO_TEXT, [DEFAULT_LANGUAGE]: text }
  }

  if (raw && typeof raw === 'object') {
    const obj = raw as Partial<Record<AppLanguage, unknown>>
    return {
      lt: String(obj.lt ?? '').trim(),
      pl: String(obj.pl ?? '').trim(),
      en: String(obj.en ?? '').trim(),
      ru: String(obj.ru ?? '').trim(),
    }
  }

  return { ...EMPTY_USER_INFO_TEXT }
}

export function resolveUserInfoText(texts: UserInfoTextI18n, language: string): string {
  const normalized = normalizeUserInfoText(texts)
  const lang = normalizeLanguage(language)
  if (normalized[lang]) return normalized[lang]

  for (const fallback of [DEFAULT_LANGUAGE, 'en', 'ru', 'pl'] as AppLanguage[]) {
    if (normalized[fallback]) return normalized[fallback]
  }

  return ''
}

export function userInfoTextEqual(a: UserInfoTextI18n, b: UserInfoTextI18n): boolean {
  return SUPPORTED_LANGUAGES.every((lang) => a[lang] === b[lang])
}

export function hasUserInfoText(texts: UserInfoTextI18n): boolean {
  return SUPPORTED_LANGUAGES.some((lang) => Boolean(texts[lang]?.trim()))
}
