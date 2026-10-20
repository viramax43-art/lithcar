/**
 * Persisted driver-map "available rides" radius filter.
 *
 * The administrator configures the default radius and the slider maximum in
 * platform settings; the driver may override the value locally. Only an
 * explicit driver choice is persisted, so a later change of the platform
 * default still reaches devices that never touched the filter.
 */
export const DRIVER_AVAILABLE_RADIUS_STORAGE_KEY = 'lithcar_driver_available_radius_v1'

export const DEFAULT_DRIVER_AVAILABLE_RADIUS_KM = 7

/** Hard API limit; `0` means "show rides from the whole service area". */
export const DRIVER_AVAILABLE_RADIUS_MAX_KM = 100

export function normalizeDriverAvailableRadiusKm(value: number | null | undefined): number {
  if (value == null || !Number.isFinite(value)) return DEFAULT_DRIVER_AVAILABLE_RADIUS_KM
  return Math.min(DRIVER_AVAILABLE_RADIUS_MAX_KM, Math.max(0, value))
}

/** Admin-configured slider maximum; always at least 1 km and at most 100 km. */
export function normalizeDriverAvailableRadiusMaxKm(value: number | null | undefined): number {
  if (value == null || !Number.isFinite(value)) return DRIVER_AVAILABLE_RADIUS_MAX_KM
  return Math.min(DRIVER_AVAILABLE_RADIUS_MAX_KM, Math.max(1, Math.round(value)))
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
