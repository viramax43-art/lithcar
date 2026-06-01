export const SUPPORTED_LANGUAGES = ['lt', 'pl', 'en', 'ru'] as const

export type AppLanguage = (typeof SUPPORTED_LANGUAGES)[number]

export const DEFAULT_LANGUAGE: AppLanguage = 'lt'

const LANGUAGE_LABELS: Record<AppLanguage, string> = {
  lt: 'Lietuviu',
  pl: 'Polski',
  en: 'English',
  ru: 'Русский',
}

export function getLanguageLabel(language: AppLanguage): string {
  return LANGUAGE_LABELS[language]
}

export function isSupportedLanguage(language: string | null | undefined): language is AppLanguage {
  return !!language && (SUPPORTED_LANGUAGES as readonly string[]).includes(language)
}

export function normalizeLanguage(language: string | null | undefined): AppLanguage {
  if (isSupportedLanguage(language)) return language
  return DEFAULT_LANGUAGE
}
