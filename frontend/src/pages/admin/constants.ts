export const GROUP_COLORS = ['#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B', '#06B6D4']
export const ZONE_COLORS = ['#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B', '#06B6D4', '#10B981', '#EF4444']

export const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: 'Ожидает', color: '#F59E0B', bg: 'rgba(245,158,11,0.1)' },
  grouped: { label: 'В группе', color: '#8B5CF6', bg: 'rgba(139,92,246,0.1)' },
  assigned: { label: 'Назначен', color: '#22C55E', bg: 'rgba(34,197,94,0.1)' },
  en_route_to_pickup: { label: 'Едет к пассажиру', color: '#0EA5E9', bg: 'rgba(14,165,233,0.1)' },
  awaiting_passenger: { label: 'Ожидает на месте', color: '#F97316', bg: 'rgba(249,115,22,0.1)' },
  in_progress: { label: 'В пути', color: '#3B82F6', bg: 'rgba(59,130,246,0.1)' },
  completed: { label: 'Завершена', color: '#858585', bg: 'rgba(133,133,133,0.1)' },
}

export type AdminTab = 'requests' | 'suggestions' | 'drivers' | 'zones' | 'settings' | 'qrSales' | 'staff'
