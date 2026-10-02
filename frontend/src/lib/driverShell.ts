const DRIVER_SHELL_KEY = 'lithcar.lastShell'

export type AppShell = 'passenger' | 'driver'

export function setLastAppShell(shell: AppShell): void {
  try {
    sessionStorage.setItem(DRIVER_SHELL_KEY, shell)
  } catch {
    // ignore quota / private mode
  }
}

export function getLastAppShell(): AppShell | null {
  try {
    const value = sessionStorage.getItem(DRIVER_SHELL_KEY)
    if (value === 'driver' || value === 'passenger') return value
  } catch {
    // ignore
  }
  return null
}

/**
 * True while the driver cabinet owns the navigation stack.
 *
 * Passenger routes are guarded by this flag so browser back / Telegram swipe
 * can never drop the driver onto the passenger UI (TZ D3). Leaving the driver
 * shell requires an explicit user action calling ``exitToPassengerApp()``.
 */
export function isDriverShellActive(): boolean {
  return getLastAppShell() === 'driver'
}

/** Explicit "open passenger cabinet" action — the only way out of the driver shell. */
export function exitToPassengerApp(): void {
  setLastAppShell('passenger')
}
