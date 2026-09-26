import { useCallback, useEffect, useRef } from 'react'

import type { AppLanguage } from '../i18n/languages'
import { translateIntoAllLanguages } from './autoTranslate'
import type { UserInfoTextI18n } from './userInfoText'

type TextSetter = React.Dispatch<React.SetStateAction<UserInfoTextI18n>>

export function useAutoTranslatedText(setValue: TextSetter, delayMs = 650) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const requestRef = useRef(0)

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    requestRef.current += 1
  }, [])

  return useCallback((language: AppLanguage, text: string) => {
    setValue((previous) => ({ ...previous, [language]: text }))
    requestRef.current += 1
    const requestId = requestRef.current
    if (timerRef.current) clearTimeout(timerRef.current)

    if (!text.trim()) {
      setValue({ lt: '', pl: '', en: '', ru: '' })
      return
    }

    timerRef.current = setTimeout(() => {
      void translateIntoAllLanguages(text, language)
        .then((translated) => {
          if (requestRef.current === requestId) setValue(translated)
        })
        .catch(() => {
          // Keep the text entered by the administrator if the translation service is temporarily unavailable.
        })
    }, delayMs)
  }, [delayMs, setValue])
}
