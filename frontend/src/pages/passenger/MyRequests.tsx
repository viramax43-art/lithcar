import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, CaretRight, MapPin, Clock, User, Car } from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'
import Skeleton from '../../components/Skeleton'
import NotificationBell from '../../components/notifications/NotificationBell'
import type { Driver, RideRequest } from '../../types'
import { listDrivers, listMyRequests } from '../../lib/backend'
import { formatRideDate, formatRideTime } from '../../i18n/dateTime'

const PAGE_SIZE = 20

const STATUS_COLOR_MAP: Record<string, { color: string; bg: string }> = {
  pending: { color: '#F59E0B', bg: 'rgba(245,158,11,0.1)' },
  grouped: { color: '#8B5CF6', bg: 'rgba(139,92,246,0.1)' },
  assigned: { color: '#22C55E', bg: 'rgba(34,197,94,0.1)' },
  en_route_to_pickup: { color: '#0EA5E9', bg: 'rgba(14,165,233,0.1)' },
  awaiting_passenger: { color: '#F97316', bg: 'rgba(249,115,22,0.1)' },
  in_progress: { color: '#3B82F6', bg: 'rgba(59,130,246,0.1)' },
  completed: { color: '#858585', bg: 'rgba(133,133,133,0.1)' },
}

const STATUS_TABS = [
  { key: 'active' },
  { key: 'completed' },
  { key: 'all' },
]

export default function MyRequests() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [requests, setRequests] = useState<RideRequest[]>([])
  const [total, setTotal] = useState(0)
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [tab, setTab] = useState<'active' | 'completed' | 'all'>('active')

  const tabScope = tab === 'all' ? undefined : tab

  // Each tab is paginated server-side so "Completed" sees the full history,
  // not just whatever happens to be on the loaded pages.
  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    setErrorMessage(null)
    setRequests([])
    setTotal(0)
    ;(async () => {
      try {
        const requestsData = await listMyRequests({ limit: PAGE_SIZE, offset: 0, scope: tabScope })
        if (!cancelled) {
          setRequests(requestsData.items)
          setTotal(requestsData.total)
        }
      } catch (error) {
        if (!cancelled) setErrorMessage(error instanceof Error ? error.message : t('errors.loadRequestsFailed', { defaultValue: 'Failed to load requests.' }))
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [tabScope])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        // Passenger endpoint may return 403 — that is acceptable.
        const driversData = await listDrivers(false, { limit: 200, offset: 0 })
        if (!cancelled) setDrivers(driversData.items)
      } catch {
        if (!cancelled) setDrivers([])
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
      const page = await listMyRequests({ limit: PAGE_SIZE, offset: requests.length, scope: tabScope })
      setRequests((prev) => [...prev, ...page.items])
      setTotal(page.total)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t('errors.loadMoreRequestsFailed', { defaultValue: 'Failed to load more requests.' }))
    } finally {
      setIsLoadingMore(false)
    }
  }, [isLoadingMore, requests.length, total, tabScope])

  const sorted = useMemo(() => {
    return [...requests].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
  }, [requests])

  const canLoadMore = requests.length < total

  return (
    <div className="fixed inset-0 z-[200] bg-white flex flex-col animate-slide-in-right">
      {/* Header */}
      <header
        className="flex-shrink-0 bg-white border-b border-border/50"
        style={{ paddingTop: 'var(--app-user-safe-top)' }}
      >
        <div className="flex items-center gap-3 px-3 h-14 w-full max-w-2xl mx-auto">
          <button
            onClick={() => navigate(-1)}
            className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-surface transition-colors flex-shrink-0"
          >
            <ArrowLeft size={20} weight="bold" />
          </button>
          <h1 className="text-base font-extrabold tracking-tight flex-1">{t('passenger.myRidesTitle', { defaultValue: 'My rides' })}</h1>
          <NotificationBell pool="passenger" />
        </div>
        {/* Status tabs */}
        <div className="flex items-center gap-1 px-5 pb-3 overflow-x-auto w-full max-w-2xl mx-auto">
          {STATUS_TABS.map((tabItem) => (
            <button
              key={tabItem.key}
              onClick={() => setTab(tabItem.key as typeof tab)}
              className={`px-3 py-1.5 rounded-pill text-xs font-semibold whitespace-nowrap transition-colors ${
                tab === tabItem.key ? 'bg-black text-white' : 'bg-surface text-muted'
              }`}
            >
              {tabItem.key === 'active'
                ? t('passenger.activeRides', { defaultValue: 'Active' })
                : tabItem.key === 'completed'
                  ? t('passenger.completedRides', { defaultValue: 'Completed' })
                  : t('common.all', { defaultValue: 'All' })}
            </button>
          ))}
        </div>
      </header>

      {/* List */}
      <div className="flex-1 overflow-y-auto" style={{ paddingBottom: 'var(--app-user-safe-bottom)' }}>
      <div className="flex flex-col w-full max-w-2xl mx-auto">
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
          const status = STATUS_COLOR_MAP[req.status] || STATUS_COLOR_MAP.pending
          const driver = req.driverId ? drivers.find((d) => d.id === req.driverId) : null
          const dateStr = formatRideDate(req, { day: 'numeric', month: 'short' })
          const timeStr = formatRideTime(req)

          return (
            <button
              key={req.id}
              onClick={() => navigate(`/requests/${req.id}`)}
              className="flex flex-col gap-2 px-5 py-4 border-b border-surface text-left hover:bg-surface/60 active:bg-surface/80 transition-colors cursor-pointer"
            >
              {/* Top row: status + time */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="text-xs font-bold px-3 py-1 rounded-pill"
                    style={{ color: status.color, background: status.bg }}
                  >
                    {t(`status.${req.status}`, { defaultValue: req.status })}
                  </span>
                  <span className="text-[11px] font-semibold text-muted whitespace-nowrap">№{req.rideNumber}</span>
                  {req.rating?.canRate && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-pill bg-amber-100 text-amber-800">
                      {t('rating.rate', { defaultValue: 'Rate' })}
                    </span>
                  )}
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
                {t('common.loading', { defaultValue: 'Loading...' })}
              </span>
            ) : (
              t('common.showMoreWithCount', {
                loaded: requests.length,
                total,
                defaultValue: `Show more (${requests.length} of ${total})`,
              })
            )}
          </button>
        )}

        {!isLoading && sorted.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
            <MapPin size={48} className="text-border mb-4" weight="regular" />
            <p className="text-muted text-sm">
              {tab === 'active'
                ? t('passenger.noActiveRides', { defaultValue: 'No active rides' })
                : tab === 'completed'
                  ? t('passenger.noCompletedRides', { defaultValue: 'No completed rides' })
                  : t('passenger.noRequestsYet', { defaultValue: 'No requests yet' })}
            </p>
            {tab !== 'completed' && (
              <button
                onClick={() => navigate('/')}
                className="mt-4 px-6 py-2.5 bg-black text-white text-sm font-bold rounded-pill"
              >
                {t('passenger.createRequest', { defaultValue: 'Create request' })}
              </button>
            )}
          </div>
        )}
      </div>
      </div>

    </div>
  )
}
