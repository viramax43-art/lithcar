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

  useEffect(() => {
    if (session.error) {
      setIsChecking(false)
      return
    }
    if (!session.isReady) return

    let cancelled = false
    const timer = window.setTimeout(() => {
      if (!cancelled) setIsChecking(false)
    }, 10000)

    void (async () => {
      try {
        const user = await getCurrentUser()
        if (!cancelled) setNeedsOnboarding(!user.onboarding_completed)
      } catch {
        if (!cancelled) setNeedsOnboarding(false)
      } finally {
        window.clearTimeout(timer)
        if (!cancelled) setIsChecking(false)
      }
    })()

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [session.isReady, session.error])

  if (session.error) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-white px-6 gap-3 user-safe-top user-safe-bottom">
        <p className="text-sm text-red-600 text-center">{session.error}</p>
        <p className="text-[10px] text-muted text-center">build {session.buildId}</p>
      </div>
    )
  }

  if (!session.isReady || isChecking) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-white gap-2 user-safe-top user-safe-bottom">
        <p className="text-sm text-muted">{t('common.loading')}</p>
        <p className="text-[10px] text-muted">build {session.buildId}</p>
      </div>
    )
  }

  if (needsOnboarding) {
    return <OnboardingScreen onCompleted={() => setNeedsOnboarding(false)} />
  }

  return <>{children}</>
}
