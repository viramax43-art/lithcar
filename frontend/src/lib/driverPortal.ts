import { openExternalLink } from './telegram'

export function getDriverCabinetUrl(): string {
  return `${window.location.origin}/driver`
}

export function openDriverCabinetInBrowser(): void {
  openExternalLink(getDriverCabinetUrl())
}
