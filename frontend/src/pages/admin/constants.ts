export const GROUP_COLORS = ['#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B', '#06B6D4']
export const ZONE_COLORS = ['#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B', '#06B6D4', '#10B981', '#EF4444']

/** Color groups for map markers and sidebar filtering */
export const MAP_COLOR_GROUPS = [
  {
    key: 'amber' as const,
    hex: '#F59E0B',
    cssClass: 'marker-ride-gray',
    label: 'Ожидает / Назначен',
    statuses: ['pending', 'grouped', 'assigned'] as string[],
  },
  {
    key: 'red' as const,
    hex: '#EF4444',
    cssClass: 'marker-ride-red',
    label: 'Едет / Ожидает вас',
    statuses: ['en_route_to_pickup', 'awaiting_passenger'] as string[],
  },
  {
    key: 'blue' as const,
    hex: '#3B82F6',
    cssClass: 'marker-ride-blue',
    label: 'В пути',
    statuses: ['in_progress'] as string[],
  },
  {
    key: 'green' as const,
    hex: '#22C55E',
    cssClass: 'marker-ride-green',
    label: 'Завершена',
    statuses: ['completed'] as string[],
  },
]

export type MapColorGroupKey = (typeof MAP_COLOR_GROUPS)[number]['key']

export const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: 'Ожидает', color: '#F59E0B', bg: 'rgba(245,158,11,0.1)' },
  grouped: { label: 'В группе', color: '#8B5CF6', bg: 'rgba(139,92,246,0.1)' },
  assigned: { label: 'Назначен', color: '#22C55E', bg: 'rgba(34,197,94,0.1)' },
  en_route_to_pickup: { label: 'Едет к пассажиру', color: '#0EA5E9', bg: 'rgba(14,165,233,0.1)' },
  awaiting_passenger: { label: 'Ожидает на месте', color: '#F97316', bg: 'rgba(249,115,22,0.1)' },
  in_progress: { label: 'В пути', color: '#3B82F6', bg: 'rgba(59,130,246,0.1)' },
  completed: { label: 'Завершена', color: '#858585', bg: 'rgba(133,133,133,0.1)' },
}

export type AdminTab = 'requests' | 'drivers' | 'zones' | 'settings' | 'qrSales' | 'staff'
