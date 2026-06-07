import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useEnsurePassengerSession } from '../application/session/useEnsurePassengerSession'
import { getCurrentUser } from '../lib/backend'
import OnboardingScreen from '../pages/onboarding/OnboardingScreen'

type OnboardingGateProps = {
  children: ReactNode
}

export default function OnboardingGate({ children }: OnboardingGateProps) {
  const { t } = useTranslation()
  const session = useEnsurePassengerSession()
  const [isChecking, setIsChecking] = useState(true)
  const [needsOnboarding, setNeedsOnboarding] = useState(false)

  const refreshOnboardingState = async () => {
    try {
      const user = await getCurrentUser()
      setNeedsOnboarding(!user.onboarding_completed)
    } catch {
      setNeedsOnboarding(false)
    } finally {
      setIsChecking(false)
    }
  }

  useEffect(() => {
    if (!session.isReady) return
    void refreshOnboardingState()
  }, [session.isReady])

  if (!session.isReady || isChecking) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-white user-safe-top user-safe-bottom">
        <p className="text-sm text-muted">{t('common.loading')}</p>
      </div>
    )
  }

  if (session.error) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-white px-6 user-safe-top user-safe-bottom">
        <p className="text-sm text-red-600 text-center">{session.error}</p>
      </div>
    )
  }

  if (needsOnboarding) {
    return <OnboardingScreen onCompleted={() => setNeedsOnboarding(false)} />
  }

  return <>{children}</>
}
