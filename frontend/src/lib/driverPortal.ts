import { getDriverCabinetEnterUrl } from '../infrastructure/api/driverRegistrationApi'
import { openExternalLink } from './telegram'

export function getDriverCabinetUrl(): string {
  return `${window.location.origin}/driver`
}

/** Opens driver cabinet in the phone's system browser (outside Telegram Mini App). */
export async function enterDriverCabinet(): Promise<void> {
  const { enterUrl } = await getDriverCabinetEnterUrl()
  openExternalLink(enterUrl)
}
