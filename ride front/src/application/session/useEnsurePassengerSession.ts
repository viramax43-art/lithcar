import { useEffect, useState } from 'react'
import { useAppDependencies } from '../../bootstrap/AppProviders'
import { useAppStore } from '../../store/appStore'

export function useEnsurePassengerSession() {
  const { auth } = useAppDependencies()
  const setSessionStatus = useAppStore((state) => state.setPassengerSessionStatus)
  const setSessionError = useAppStore((state) => state.setPassengerSessionError)
  const [isReady, setIsReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setSessionStatus('loading')
    setSessionError(null)
    ;(async () => {
      try {
        await auth.ensurePassengerAccessToken(false)
        if (!cancelled) {
          setError(null)
          setIsReady(true)
          setSessionStatus('ready')
          setSessionError(null)
        }
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : 'Не удалось инициализировать сессию.'
          setError(message)
          setSessionStatus('error')
          setSessionError(message)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [auth, setSessionError, setSessionStatus])

  return { isReady, error }
}
