import type { RideStatus } from '../../types'

export const DRIVER_STATUS_LABEL_KEY: Record<RideStatus, string> = {
  pending: 'status.pending',
  grouped: 'status.grouped',
  assigned: 'status.assigned',
  en_route_to_pickup: 'status.en_route_to_pickup',
  awaiting_passenger: 'status.awaiting_passenger',
  in_progress: 'status.in_progress',
  completed: 'status.completed',
}

export const OFFER_STATUS_COLOR: Record<'open' | 'full' | 'cancelled' | 'completed', { color: string; bg: string }> = {
  open: { color: '#22C55E', bg: 'rgba(34,197,94,0.10)' },
  full: { color: '#F59E0B', bg: 'rgba(245,158,11,0.10)' },
  cancelled: { color: '#858585', bg: 'rgba(133,133,133,0.10)' },
  completed: { color: '#3B82F6', bg: 'rgba(59,130,246,0.10)' },
}

export const DRIVER_STATUS_COLOR: Record<RideStatus, { color: string; bg: string }> = {
  pending: { color: '#F59E0B', bg: 'rgba(245,158,11,0.10)' },
  grouped: { color: '#8B5CF6', bg: 'rgba(139,92,246,0.10)' },
  assigned: { color: '#22C55E', bg: 'rgba(34,197,94,0.10)' },
  en_route_to_pickup: { color: '#0EA5E9', bg: 'rgba(14,165,233,0.10)' },
  awaiting_passenger: { color: '#F97316', bg: 'rgba(249,115,22,0.10)' },
  in_progress: { color: '#3B82F6', bg: 'rgba(59,130,246,0.10)' },
  completed: { color: '#858585', bg: 'rgba(133,133,133,0.10)' },
}

export const ACTIVE_RIDE_STATUSES: RideStatus[] = [
  'assigned',
  'en_route_to_pickup',
  'awaiting_passenger',
  'in_progress',
]

/** Steps shown in the driver flow stepper. */
export const DRIVER_FLOW_STEPS: { key: RideStatus; shortKey: string }[] = [
  { key: 'assigned', shortKey: 'driver.step.start' },
  { key: 'en_route_to_pickup', shortKey: 'driver.step.toPassenger' },
  { key: 'awaiting_passenger', shortKey: 'driver.step.waiting' },
  { key: 'in_progress', shortKey: 'driver.step.inProgress' },
  { key: 'completed', shortKey: 'driver.step.done' },
]

/** Returns the next status the driver can transition to, or null if terminal. */
export function nextStatus(current: RideStatus): RideStatus | null {
  switch (current) {
    case 'assigned':
      return 'en_route_to_pickup'
    case 'en_route_to_pickup':
      return 'awaiting_passenger'
    case 'awaiting_passenger':
      return 'in_progress'
    case 'in_progress':
      return 'completed'
    default:
      return null
  }
}

export function ctaLabelKey(current: RideStatus): string | null {
  switch (current) {
    case 'assigned':
      return 'driver.cta.acceptAndGo'
    case 'en_route_to_pickup':
      return 'driver.cta.arrivedWaiting'
    case 'awaiting_passenger':
      return 'driver.cta.passengerOnBoard'
    case 'in_progress':
      return 'driver.cta.finishRide'
    default:
      return null
  }
}
