import { CaretDown, Globe } from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'

import { normalizeLanguage, SUPPORTED_LANGUAGES, type AppLanguage } from '../i18n/languages'

type LanguageSwitcherProps = {
  className?: string
  variant?: 'default' | 'header'
  onChangeLanguage?: (language: AppLanguage) => Promise<void> | void
}

const selectBaseClass =
  'rounded-xl border-[1.5px] outline-none transition-colors text-sm font-semibold text-black appearance-none cursor-pointer'

export default function LanguageSwitcher({
  className,
  variant = 'default',
  onChangeLanguage,
}: LanguageSwitcherProps) {
  const { i18n, t } = useTranslation()
  const current = normalizeLanguage(i18n.language)

  const handleChange = async (next: AppLanguage) => {
    await i18n.changeLanguage(next)
    if (onChangeLanguage) await onChangeLanguage(next)
  }

  if (variant === 'header') {
    return (
      <label className={`relative inline-flex items-center ${className ?? ''}`}>
        <Globe size={16} weight="bold" className="absolute left-3 pointer-events-none text-black/45 z-10" />
        <CaretDown size={12} weight="bold" className="absolute right-2.5 pointer-events-none text-black/45 z-10" />
        <select
          value={current}
          onChange={(event) => void handleChange(event.target.value as AppLanguage)}
          aria-label={t('language.label')}
          className={`${selectBaseClass} h-9 pl-9 pr-7 w-[108px] md:w-auto md:min-w-[132px] md:pr-8 border-transparent bg-white hover:bg-white/95 focus:border-white/40`}
        >
          {SUPPORTED_LANGUAGES.map((lang) => (
            <option key={lang} value={lang}>
              {t(`language.${lang}`)}
            </option>
          ))}
        </select>
      </label>
    )
  }

  return (
    <label className={`block ${className ?? ''}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-surface flex items-center justify-center flex-shrink-0">
            <Globe size={18} weight="duotone" className="text-muted" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-black">{t('language.label')}</p>
            <p className="text-[11px] text-muted truncate">{t(`language.${current}`)}</p>
          </div>
        </div>
        <select
          value={current}
          onChange={(event) => void handleChange(event.target.value as AppLanguage)}
          aria-label={t('language.label')}
          className={`${selectBaseClass} h-10 px-3 min-w-[120px] border-border bg-surface focus:border-black focus:bg-white`}
        >
          {SUPPORTED_LANGUAGES.map((lang) => (
            <option key={lang} value={lang}>
              {t(`language.${lang}`)}
            </option>
          ))}
        </select>
      </div>
    </label>
  )
}
