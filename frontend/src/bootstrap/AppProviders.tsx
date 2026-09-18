import { createContext, useContext, useEffect, type ReactNode } from 'react'
import type { AppDependencies } from './createDependencies'
import i18n from '../i18n'
import { normalizeLanguage } from '../i18n/languages'
import { getCurrentUser } from '../infrastructure/api/passengerApi'
import { useAppStore } from '../store/appStore'

const AppDependenciesContext = createContext<AppDependencies | null>(null)

export function AppProviders({ deps, children }: { deps: AppDependencies; children: ReactNode }) {
  const sessionStatus = useAppStore((state) => state.passengerSessionStatus)

  useEffect(() => {
    if (sessionStatus !== 'ready') return
    void (async () => {
      try {
        const user = await getCurrentUser()
        await i18n.changeLanguage(normalizeLanguage(user.language))
      } catch {
        // guest or non-passenger session; keep locally selected language
      }
    })()
  }, [sessionStatus])

  return <AppDependenciesContext.Provider value={deps}>{children}</AppDependenciesContext.Provider>
}

export function useAppDependencies(): AppDependencies {
  const deps = useContext(AppDependenciesContext)
  if (!deps) {
    throw new Error('useAppDependencies must be used inside AppProviders.')
  }
  return deps
}
