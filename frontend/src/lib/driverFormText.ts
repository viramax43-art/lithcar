import type { AppLanguage } from '../i18n/languages'
import { normalizeLanguage } from '../i18n/languages'
import { normalizeUserInfoText, type UserInfoTextI18n } from './userInfoText'

export function resolveDriverFormText(texts: UserInfoTextI18n, language: string): string {
  const normalized = normalizeUserInfoText(texts)
  const lang = normalizeLanguage(language)
  if (normalized[lang]) return normalized[lang]
  for (const fallback of ['lt', 'en', 'ru', 'pl'] as AppLanguage[]) {
    if (normalized[fallback]) return normalized[fallback]
  }
  return ''
}
