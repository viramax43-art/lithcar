import { useEffect, useRef } from 'react'

import { patchAdminUiState, type AdminUiState } from './adminUiState'

type PersistableSlice = keyof Pick<
  AdminUiState,
  'dashboard' | 'map' | 'sidebar' | 'driverRegistration' | 'zonesSettings' | 'pricing'
>

export function usePersistAdminUiSlice<Slice extends PersistableSlice>(
  slice: Slice,
  value: Partial<NonNullable<AdminUiState[Slice]>>,
  delayMs = 250,
): void {
  const isFirstRender = useRef(true)

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    const timer = window.setTimeout(() => {
      patchAdminUiState({ [slice]: value } as Partial<AdminUiState>)
    }, delayMs)
    return () => window.clearTimeout(timer)
  }, [slice, value, delayMs])
}
