import { bootstrapDriverAccess } from '../infrastructure/api/driverApi'

export function getDriverCabinetUrl(): string {
  return `${window.location.origin}/driver`
}

export async function enterDriverCabinet(navigate: (path: string) => void): Promise<void> {
  await bootstrapDriverAccess()
  navigate('/driver')
}
