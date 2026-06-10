import { Car, UserCircle } from '@phosphor-icons/react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import LanguageSwitcher from '../../components/LanguageSwitcher'
import { completeOnboarding, updateCurrentUserLanguage } from '../../lib/backend'
import { hapticSelection } from '../../lib/telegram'
import type { AppLanguage } from '../../i18n/languages'
import { normalizeLanguage } from '../../i18n/languages'

type OnboardingRole = 'passenger' | 'driver'

type OnboardingScreenProps = {
  onCompleted: () => void
}

export default function OnboardingScreen({ onCompleted }: OnboardingScreenProps) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const handleLanguageChange = async (language: AppLanguage) => {
    try {
      await updateCurrentUserLanguage(language)
    } catch {
      // keep local language even if profile update fails
    }
  }

  const handleRoleSelect = async (role: OnboardingRole) => {
    hapticSelection()
    setIsSubmitting(true)
    setErrorMessage(null)
    try {
      const language = normalizeLanguage(i18n.language)
      await updateCurrentUserLanguage(language)
      await completeOnboarding()
      onCompleted()
      if (role === 'driver') {
        navigate('/driver/register')
      } else {
        navigate('/')
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t('common.error'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-[100dvh] bg-white flex flex-col user-safe-top user-safe-bottom">
      <div className="px-5 pt-2 pb-4 w-full max-w-md mx-auto">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted">{t('app.title')}</p>
            <h1 className="text-2xl font-black text-black mt-1">{t('onboarding.title')}</h1>
          </div>
        </div>
        <div className="mt-5 rounded-card border border-border bg-surface p-4">
          <LanguageSwitcher onChangeLanguage={handleLanguageChange} />
        </div>
      </div>

      <div className="flex-1 px-5 pb-6 flex flex-col justify-center gap-4 w-full max-w-md mx-auto">
        <p className="text-sm text-muted text-center px-2">{t('onboarding.subtitle')}</p>

        <button
          type="button"
          disabled={isSubmitting}
          onClick={() => void handleRoleSelect('passenger')}
          className="w-full rounded-card border border-border bg-surface p-5 text-left transition-all active:scale-[0.98] hover:border-black/20 disabled:opacity-60"
        >
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-white border border-border flex items-center justify-center flex-shrink-0">
              <UserCircle size={28} weight="duotone" className="text-black" />
            </div>
            <div className="min-w-0">
              <p className="text-lg font-bold text-black">{t('onboarding.passengerTitle')}</p>
              <p className="text-sm text-muted mt-1">{t('onboarding.passengerDescription')}</p>
            </div>
          </div>
        </button>

        <button
          type="button"
          disabled={isSubmitting}
          onClick={() => void handleRoleSelect('driver')}
          className="w-full rounded-card border border-border bg-surface p-5 text-left transition-all active:scale-[0.98] hover:border-black/20 disabled:opacity-60"
        >
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-white border border-border flex items-center justify-center flex-shrink-0">
              <Car size={28} weight="duotone" className="text-black" />
            </div>
            <div className="min-w-0">
              <p className="text-lg font-bold text-black">{t('onboarding.driverTitle')}</p>
              <p className="text-sm text-muted mt-1">{t('onboarding.driverDescription')}</p>
            </div>
          </div>
        </button>

        {errorMessage && (
          <p className="text-sm text-red-600 text-center">{errorMessage}</p>
        )}
      </div>
    </div>
  )
}
