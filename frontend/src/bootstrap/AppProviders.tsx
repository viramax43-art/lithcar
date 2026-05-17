import { createContext, useContext, type ReactNode } from 'react'
import type { AppDependencies } from './createDependencies'

const AppDependenciesContext = createContext<AppDependencies | null>(null)

export function AppProviders({ deps, children }: { deps: AppDependencies; children: ReactNode }) {
  return <AppDependenciesContext.Provider value={deps}>{children}</AppDependenciesContext.Provider>
}

export function useAppDependencies(): AppDependencies {
  const deps = useContext(AppDependenciesContext)
  if (!deps) {
    throw new Error('useAppDependencies must be used inside AppProviders.')
  }
  return deps
}
