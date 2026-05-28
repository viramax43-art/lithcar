import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, CaretRight, MapPin, Clock, User, Car } from '@phosphor-icons/react'
import Skeleton from '../../components/Skeleton'
import type { Driver, RideRequest } from '../../types'
import { listDrivers, listMyRequests } from '../../lib/backend'

const PAGE_SIZE = 20

const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: 'Ожидает', color: '#F59E0B', bg: 'rgba(245,158,11,0.1)' },
  grouped: { label: 'В группе', color: '#8B5CF6', bg: 'rgba(139,92,246,0.1)' },
  assigned: { label: 'Водитель назначен', color: '#22C55E', bg: 'rgba(34,197,94,0.1)' },
  en_route_to_pickup: { label: 'Водитель едет', color: '#0EA5E9', bg: 'rgba(14,165,233,0.1)' },
  awaiting_passenger: { label: 'Ожидает вас', color: '#F97316', bg: 'rgba(249,115,22,0.1)' },
  in_progress: { label: 'В пути', color: '#3B82F6', bg: 'rgba(59,130,246,0.1)' },
  completed: { label: 'Завершена', color: '#858585', bg: 'rgba(133,133,133,0.1)' },
}

const STATUS_TABS = [
  { key: 'active', label: 'Активные' },
  { key: 'completed', label: 'Завершённые' },
  { key: 'all', label: 'Все' },
]

export default function MyRequests() {
  const navigate = useNavigate()
  const [requests, setRequests] = useState<RideRequest[]>([])
  const [total, setTotal] = useState(0)
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [tab, setTab] = useState<'active' | 'completed' | 'all'>('active')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const requestsData = await listMyRequests({ limit: PAGE_SIZE, offset: 0 })
        if (!cancelled) {
          setRequests(requestsData.items)
          setTotal(requestsData.total)
        }
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

  const loadMore = useCallback(async () => {
    if (isLoadingMore || requests.length >= total) return
    setIsLoadingMore(true)
    try {
      const page = await listMyRequests({ limit: PAGE_SIZE, offset: requests.length })
      setRequests((prev) => [...prev, ...page.items])
      setTotal(page.total)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Не удалось подгрузить заявки.')
    } finally {
      setIsLoadingMore(false)
    }
  }, [isLoadingMore, requests.length, total])

  const sorted = useMemo(() => {
    const filtered = tab === 'active'
      ? requests.filter((r) => r.status !== 'completed')
      : tab === 'completed'
        ? requests.filter((r) => r.status === 'completed')
        : requests
    return [...filtered].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
  }, [requests, tab])

  const canLoadMore = requests.length < total

  return (
    <div className="fixed inset-0 z-[200] bg-white flex flex-col animate-slide-in-right">
      {/* Header */}
      <header
        className="flex-shrink-0 bg-white border-b border-border/50"
        style={{ paddingTop: 'var(--app-user-safe-top)' }}
      >
        <div className="flex items-center gap-3 px-3 h-14">
          <button
            onClick={() => navigate(-1)}
            className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-surface transition-colors flex-shrink-0"
          >
            <ArrowLeft size={20} weight="bold" />
          </button>
          <h1 className="text-base font-extrabold tracking-tight flex-1">Мои поездки</h1>
        </div>
        {/* Status tabs */}
        <div className="flex items-center gap-1 px-5 pb-3 overflow-x-auto">
          {STATUS_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key as typeof tab)}
              className={`px-3 py-1.5 rounded-pill text-xs font-semibold whitespace-nowrap transition-colors ${
                tab === t.key ? 'bg-black text-white' : 'bg-surface text-muted'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </header>

      {/* List */}
      <div className="flex-1 overflow-y-auto flex flex-col" style={{ paddingBottom: 'var(--app-user-safe-bottom)' }}>
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
              className="flex flex-col gap-2 px-5 py-4 border-b border-surface text-left active:bg-surface/80 transition-colors"
            >
              {/* Top row: status + time */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="text-xs font-bold px-3 py-1 rounded-pill"
                    style={{ color: status.color, background: status.bg }}
                  >
                    {status.label}
                  </span>
                  <span className="text-[11px] font-semibold text-muted whitespace-nowrap">№{req.rideNumber}</span>
                </div>
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

        {/* Load more */}
        {!isLoading && canLoadMore && (
          <button
            onClick={() => void loadMore()}
            disabled={isLoadingMore}
            className="mx-5 my-4 py-3 rounded-xl bg-surface hover:bg-border text-xs font-semibold text-muted transition-colors disabled:opacity-50"
          >
            {isLoadingMore ? (
              <span className="inline-flex items-center gap-2">
                <span className="w-3 h-3 rounded-full border-2 border-muted/30 border-t-muted animate-spin" />
                Загружаем…
              </span>
            ) : (
              `Показать ещё (${requests.length} из ${total})`
            )}
          </button>
        )}

        {!isLoading && sorted.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
            <MapPin size={48} className="text-border mb-4" weight="regular" />
            <p className="text-muted text-sm">
              {tab === 'active' ? 'Нет активных поездок' : tab === 'completed' ? 'Нет завершённых поездок' : 'У вас пока нет заявок'}
            </p>
            <button
              onClick={() => navigate('/')}
              className="mt-4 px-6 py-2.5 bg-black text-white text-sm font-bold rounded-pill"
            >
              Создать заявку
            </button>
          </div>
        )}
      </div>

    </div>
  )
}
