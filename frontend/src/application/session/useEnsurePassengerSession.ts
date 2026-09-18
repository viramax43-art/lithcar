import { useEffect, useState } from 'react'
import { useAppDependencies } from '../../bootstrap/AppProviders'
import { useAppStore } from '../../store/appStore'
import i18n from '../../i18n'

const SESSION_HARD_TIMEOUT_MS = 20000
const BUILD_ID = '20260916v4'

export function useEnsurePassengerSession() {
  const { auth } = useAppDependencies()
  const setSessionStatus = useAppStore((state) => state.setPassengerSessionStatus)
  const setSessionError = useAppStore((state) => state.setPassengerSessionError)
  const [isReady, setIsReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let settled = false
    setSessionStatus('loading')
    setSessionError(null)

    const finishError = (message: string) => {
      if (settled) return
      settled = true
      setError(message)
      setIsReady(false)
      setSessionStatus('error')
      setSessionError(message)
    }

    const finishOk = () => {
      if (settled) return
      settled = true
      setError(null)
      setIsReady(true)
      setSessionStatus('ready')
      setSessionError(null)
    }

    const hardTimeout = window.setTimeout(() => {
      finishError(
        i18n.t('errors.sessionInitFailed', {
          defaultValue: `Session timed out (${BUILD_ID}). Close Mini App and open Ride from the bot menu.`,
        }),
      )
    }, SESSION_HARD_TIMEOUT_MS)

    void (async () => {
      try {
        await auth.ensurePassengerAccessToken(false)
        finishOk()
      } catch (err) {
        const message =
          err instanceof Error
            ? `${err.message} [${BUILD_ID}]`
            : i18n.t('errors.sessionInitFailed', {
                defaultValue: `Failed to initialize session. [${BUILD_ID}]`,
              })
        finishError(message)
      } finally {
        window.clearTimeout(hardTimeout)
      }
    })()

    return () => {
      window.clearTimeout(hardTimeout)
      // Do not mark settled on unmount: StrictMode remount must still accept the in-flight result
      // via the module-level session promise. Local state is reset by remount itself.
    }
  }, [auth, setSessionError, setSessionStatus])

  return { isReady, error, buildId: BUILD_ID }
}
