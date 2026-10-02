import { bootstrapDriverAccess } from '../infrastructure/api/driverApi'
import { setLastAppShell } from './driverShell'

export function getDriverCabinetUrl(): string {
  const base = import.meta.env.BASE_URL.replace(/\/?$/, '/')
  return `${window.location.origin}${base}driver`
}

/**
 * Open driver cabinet inside the Mini App (same WebView).
 * Avoids system-browser enter links that drop the driver cookie when returning to Telegram.
 */
export async function enterDriverCabinet(): Promise<void> {
  setLastAppShell('driver')
  try {
    await bootstrapDriverAccess()
  } catch {
    // Cookie may already be valid; DriverCabinet will retry bootstrap / login.
  }
  window.location.assign(getDriverCabinetUrl())
}
