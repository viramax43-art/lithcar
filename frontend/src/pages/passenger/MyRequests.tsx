import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CaretRight, MapPin, Clock, User, Car } from '@phosphor-icons/react'
import BottomNav from '../../components/BottomNav'
import Skeleton from '../../components/Skeleton'
import type { Driver, RideRequest } from '../../types'
import { listDrivers, listMyRequests } from '../../lib/backend'

const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: 'Ожидает', color: '#F59E0B', bg: 'rgba(245,158,11,0.1)' },
  grouped: { label: 'В группе', color: '#8B5CF6', bg: 'rgba(139,92,246,0.1)' },
  assigned: { label: 'Водитель назначен', color: '#22C55E', bg: 'rgba(34,197,94,0.1)' },
  en_route_to_pickup: { label: 'Водитель едет', color: '#0EA5E9', bg: 'rgba(14,165,233,0.1)' },
  awaiting_passenger: { label: 'Ожидает вас', color: '#F97316', bg: 'rgba(249,115,22,0.1)' },
  in_progress: { label: 'В пути', color: '#3B82F6', bg: 'rgba(59,130,246,0.1)' },
  completed: { label: 'Завершена', color: '#858585', bg: 'rgba(133,133,133,0.1)' },
}

export default function MyRequests() {
  const navigate = useNavigate()
  const [requests, setRequests] = useState<RideRequest[]>([])
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const requestsData = await listMyRequests({ limit: 50, offset: 0 })
        if (!cancelled) setRequests(requestsData.items)
      } catch (error) {
        if (!cancelled) setErrorMessage(error instanceof Error ? error.message : 'Не удалось загрузить заявки.')
      }
      try {
        // Для пассажира endpoint может вернуть 403, это допустимо.
        const driversData = await listDrivers(false, { limit: 200, offset: 0 })
        if (!cancelled) setDrivers(driversData.items)
      } catch {
        if (!cancelled) setDrivers([])
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const sorted = [...requests].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )

  return (
    <div className="min-h-[100dvh] bg-white pb-20 animate-page-in">
      {/* Header */}
      <header
        className="sticky top-0 z-20 bg-white/90 backdrop-blur-md border-b border-border/50"
        style={{ paddingTop: 'var(--app-safe-area-top-total)' }}
      >
        <div className="flex items-center justify-between px-5 h-14">
          <h1 className="text-xl font-extrabold tracking-tight">RIDE</h1>
          <span className="text-sm font-semibold text-muted">Мои поездки</span>
        </div>
      </header>

      {/* List */}
      <div className="flex flex-col">
        {errorMessage && <p className="px-5 py-3 text-xs font-medium text-red-600">{errorMessage}</p>}
        {isLoading &&
          [0, 1, 2, 3].map((index) => (
            <div key={index} className="flex flex-col gap-2 px-5 py-4 border-b border-surface">
              <div className="flex items-center justify-between">
                <Skeleton width={96} height={20} rounded="pill" />
                <Skeleton width={86} height={12} />
              </div>
              <div className="flex items-start gap-3">
                <div className="flex flex-col items-center gap-1 pt-1">
                  <Skeleton width={10} height={10} rounded="full" />
                  <div className="w-px h-6 bg-border" />
                  <Skeleton width={10} height={10} rounded="full" />
                </div>
                <div className="flex-1 min-w-0 space-y-3">
                  <Skeleton width="80%" height={14} />
                  <Skeleton width="65%" height={14} />
                </div>
              </div>
            </div>
          ))}
        {!isLoading && sorted.map((req) => {
          const status = STATUS_MAP[req.status] || STATUS_MAP.pending
          const driver = req.driverId ? drivers.find((d) => d.id === req.driverId) : null
          const dt = new Date(req.dateTime)
          const dateStr = dt.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
          const timeStr = dt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })

          return (
            <button
              key={req.id}
              onClick={() => navigate(`/requests/${req.id}`)}
              className="flex flex-col gap-2 px-5 py-4 border-b border-surface text-left hover:bg-surface/50 transition-colors"
            >
              {/* Top row: status + time */}
              <div className="flex items-center justify-between">
                <span
                  className="text-xs font-bold px-3 py-1 rounded-pill"
                  style={{ color: status.color, background: status.bg }}
                >
                  {status.label}
                </span>
                <span className="flex items-center gap-1 text-xs text-muted">
                  <Clock size={12} />
                  {dateStr}, {timeStr}
                </span>
              </div>

              {/* Route */}
              <div className="flex items-start gap-3">
                <div className="flex flex-col items-center gap-1 pt-1">
                  <div className="w-2.5 h-2.5 rounded-full bg-point-a" />
                  <div className="w-px h-6 bg-border" />
                  <div className="w-2.5 h-2.5 rounded-full bg-point-b" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-black truncate">{req.from.address}</p>
                  <div className="h-3" />
                  <p className="text-sm font-medium text-black truncate">{req.to.address}</p>
                </div>
                <CaretRight size={18} weight="bold" className="text-muted flex-shrink-0 mt-3" />
              </div>

              {/* Driver info */}
              {driver && (
                <div className="flex items-center gap-2 mt-1 px-3 py-2.5 bg-surface rounded-xl">
                  <div className="w-8 h-8 rounded-full bg-black flex items-center justify-center">
                    <User size={14} className="text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-black">{driver.name}</p>
                    <p className="text-[11px] text-muted flex items-center gap-1">
                      <Car size={10} /> {driver.carModel} · {driver.carPlate}
                    </p>
                  </div>
                </div>
              )}
            </button>
          )
        })}

        {!isLoading && sorted.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
            <MapPin size={48} className="text-border mb-4" weight="regular" />
            <p className="text-muted text-sm">У вас пока нет заявок</p>
            <button
              onClick={() => navigate('/')}
              className="mt-4 px-6 py-2.5 bg-black text-white text-sm font-bold rounded-pill"
            >
              Создать заявку
            </button>
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  )
}
