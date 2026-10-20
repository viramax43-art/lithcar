/**
 * Persisted driver-map "available rides" radius filter.
 *
 * The administrator configures the default radius in platform settings; the
 * driver may override it locally. Only an explicit driver choice is persisted,
 * so a later change of the platform default still reaches devices that never
 * touched the filter.
 */
export const DRIVER_AVAILABLE_RADIUS_STORAGE_KEY = 'lithcar_driver_available_radius_v1'

export const DEFAULT_DRIVER_AVAILABLE_RADIUS_KM = 7

/** `0` means "show rides from the whole service area". */
export const DRIVER_AVAILABLE_RADIUS_OPTIONS: readonly number[] = [0, 3, 5, 7, 10, 15, 25]

export function normalizeDriverAvailableRadiusKm(value: number | null | undefined): number {
  if (value == null || !Number.isFinite(value)) return DEFAULT_DRIVER_AVAILABLE_RADIUS_KM
  return Math.min(100, Math.max(0, value))
}

export function readStoredDriverAvailableRadiusKm(): number | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(DRIVER_AVAILABLE_RADIUS_STORAGE_KEY)
    if (raw == null || raw === '') return null
    const value = Number(raw)
    if (!Number.isFinite(value) || value < 0 || value > 100) return null
    return value
  } catch {
    return null
  }
}

export function storeDriverAvailableRadiusKm(value: number): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(DRIVER_AVAILABLE_RADIUS_STORAGE_KEY, String(value))
  } catch {
    /* private mode / quota exceeded — the in-memory state still works */
  }
}
