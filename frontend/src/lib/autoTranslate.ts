import { SUPPORTED_LANGUAGES, type AppLanguage } from '../i18n/languages'
import type { UserInfoTextI18n } from './userInfoText'

type GoogleTranslateResponse = [Array<[string]>, unknown, string]

export async function translateText(
  text: string,
  sourceLanguage: AppLanguage,
  targetLanguage: AppLanguage,
): Promise<string> {
  const body = new URLSearchParams({
    client: 'gtx',
    sl: sourceLanguage,
    tl: targetLanguage,
    dt: 't',
    q: text,
  })
  const response = await fetch('https://translate.googleapis.com/translate_a/single', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body,
  })
  if (!response.ok) throw new Error(`Translation failed: ${response.status}`)

  const payload = await response.json() as GoogleTranslateResponse
  return (payload[0] ?? []).map((part) => part[0] ?? '').join('').trim()
}

export async function translateIntoAllLanguages(
  text: string,
  sourceLanguage: AppLanguage,
): Promise<UserInfoTextI18n> {
  const trimmed = text.trim()
  if (!trimmed) {
    return { lt: '', pl: '', en: '', ru: '' }
  }

  const result = { lt: '', pl: '', en: '', ru: '', [sourceLanguage]: text }
  await Promise.all(
    SUPPORTED_LANGUAGES
      .filter((language) => language !== sourceLanguage)
      .map(async (language) => {
        result[language] = await translateText(trimmed, sourceLanguage, language)
      }),
  )
  return result
}
