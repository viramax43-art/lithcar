import { useTranslation } from 'react-i18next'

import { normalizeLanguage, SUPPORTED_LANGUAGES, type AppLanguage } from '../i18n/languages'

type LanguageSwitcherProps = {
  className?: string
  onChangeLanguage?: (language: AppLanguage) => Promise<void> | void
}

export default function LanguageSwitcher({ className, onChangeLanguage }: LanguageSwitcherProps) {
  const { i18n, t } = useTranslation()
  const current = normalizeLanguage(i18n.language)

  const handleChange = async (next: AppLanguage) => {
    await i18n.changeLanguage(next)
    if (onChangeLanguage) await onChangeLanguage(next)
  }

  return (
    <label className={className}>
      <span className="text-[10px] font-semibold text-muted uppercase tracking-wider">{t('language.label')}</span>
      <select
        value={current}
        onChange={(event) => void handleChange(event.target.value as AppLanguage)}
        className="mt-1 w-full px-3 py-2 rounded-xl border-[1.5px] border-border bg-surface text-sm outline-none focus:border-black focus:bg-white transition-colors"
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
