export const GROUP_COLORS = ['#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B', '#06B6D4']
export const ZONE_COLORS = ['#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B', '#06B6D4', '#10B981', '#EF4444']

/** Color groups for map markers and sidebar filtering */
export const MAP_COLOR_GROUPS = [
  {
    key: 'amber' as const,
    hex: '#F59E0B',
    cssClass: 'marker-ride-gray',
    labelKey: 'admin.mapGroup.pendingAssigned',
    statuses: ['pending', 'grouped', 'assigned'] as string[],
  },
  {
    key: 'red' as const,
    hex: '#EF4444',
    cssClass: 'marker-ride-red',
    labelKey: 'admin.mapGroup.enRouteAwaiting',
    statuses: ['en_route_to_pickup', 'awaiting_passenger'] as string[],
  },
  {
    key: 'blue' as const,
    hex: '#3B82F6',
    cssClass: 'marker-ride-blue',
    labelKey: 'status.in_progress',
    statuses: ['in_progress'] as string[],
  },
  {
    key: 'green' as const,
    hex: '#22C55E',
    cssClass: 'marker-ride-green',
    labelKey: 'status.completed',
    statuses: ['completed'] as string[],
  },
]

export type MapColorGroupKey = (typeof MAP_COLOR_GROUPS)[number]['key']

export const STATUS_CONFIG: Record<string, { labelKey: string; color: string; bg: string }> = {
  pending: { labelKey: 'status.pending', color: '#F59E0B', bg: 'rgba(245,158,11,0.1)' },
  grouped: { labelKey: 'status.grouped', color: '#8B5CF6', bg: 'rgba(139,92,246,0.1)' },
  assigned: { labelKey: 'status.assigned', color: '#22C55E', bg: 'rgba(34,197,94,0.1)' },
  en_route_to_pickup: { labelKey: 'status.en_route_to_pickup', color: '#0EA5E9', bg: 'rgba(14,165,233,0.1)' },
  awaiting_passenger: { labelKey: 'status.awaiting_passenger', color: '#F97316', bg: 'rgba(249,115,22,0.1)' },
  in_progress: { labelKey: 'status.in_progress', color: '#3B82F6', bg: 'rgba(59,130,246,0.1)' },
  completed: { labelKey: 'status.completed', color: '#858585', bg: 'rgba(133,133,133,0.1)' },
}

export type AdminTab = 'requests' | 'drivers' | 'zones' | 'settings' | 'qrSales' | 'staff'
