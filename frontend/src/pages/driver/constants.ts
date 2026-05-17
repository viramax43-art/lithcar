import type { RideStatus } from '../../types'

export const DRIVER_STATUS_LABEL: Record<RideStatus, string> = {
  pending: 'Ожидает',
  grouped: 'В группе',
  assigned: 'Назначен',
  en_route_to_pickup: 'Еду за пассажиром',
  awaiting_passenger: 'На месте, ожидаю',
  in_progress: 'В пути',
  completed: 'Завершена',
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
export const DRIVER_FLOW_STEPS: { key: RideStatus; label: string; short: string }[] = [
  { key: 'assigned', label: 'Назначена', short: 'Старт' },
  { key: 'en_route_to_pickup', label: 'Еду за пассажиром', short: 'К пасс.' },
  { key: 'awaiting_passenger', label: 'На месте, ожидаю', short: 'Ожид.' },
  { key: 'in_progress', label: 'В пути', short: 'В пути' },
  { key: 'completed', label: 'Завершена', short: 'Готово' },
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

export function ctaLabel(current: RideStatus): string | null {
  switch (current) {
    case 'assigned':
      return 'Принять и выехать к пассажиру'
    case 'en_route_to_pickup':
      return 'Я на месте, ожидаю пассажира'
    case 'awaiting_passenger':
      return 'Пассажир в машине — едем'
    case 'in_progress':
      return 'Завершить поездку'
    default:
      return null
  }
}
