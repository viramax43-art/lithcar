import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft } from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'

import RatingBadge from '../../../components/RatingBadge'
import InlineConfirm from '../../admin/components/InlineConfirm'
import { blockUserAsDriver, getDriverRideHistory, listBlockedUsersAsDriver } from '../../../lib/backend'
import { formatRideDateTime } from '../../../i18n/dateTime'
import CabinetRoleBanner from '../../../components/CabinetRoleBanner'
import { hapticNotification } from '../../../lib/telegram'
import { useEscapeClose } from '../../../lib/useEscapeClose'
import type { DriverRideHistoryItem } from '../../../types'
import { DRIVER_STATUS_COLOR, DRIVER_STATUS_LABEL_KEY } from '../constants'

interface DriverRideHistoryProps {
  onClose: () => void
}

const PAGE_SIZE = 15

export default function DriverRideHistory({ onClose }: DriverRideHistoryProps) {
  const { t } = useTranslation()
  const [rides, setRides] = useState<DriverRideHistoryItem[]>([])
  const [total, setTotal] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [blockedIds, setBlockedIds] = useState<Set<string>>(new Set())
  const [blockingId, setBlockingId] = useState<string | null>(null)

  useEscapeClose(true, onClose)

  const loadBlocked = useCallback(async () => {
    try {
      const page = await listBlockedUsersAsDriver()
      setBlockedIds(new Set(page.items.map((item) => item.userId)))
    } catch {
      setBlockedIds(new Set())
    }
  }, [])

  const loadRides = useCallback(async (offset: number, append: boolean) => {
    setIsLoading(true)
    try {
      const page = await getDriverRideHistory({ limit: PAGE_SIZE, offset })
      setTotal(page.total)
      setRides((prev) => (append ? [...prev, ...page.items] : page.items))
    } catch {
      if (!append) {
        setRides([])
        setTotal(0)
      }
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadBlocked()
    void loadRides(0, false)
  }, [loadBlocked, loadRides])

  const canLoadMore = rides.length < total

  const handleBlock = async (ride: DriverRideHistoryItem) => {
    setBlockingId(ride.passengerId)
    try {
      await blockUserAsDriver(ride.passengerId)
      hapticNotification('success')
      setBlockedIds((prev) => new Set([...prev, ride.passengerId]))
    } catch {
      hapticNotification('error')
    } finally {
      setBlockingId(null)
    }
  }

  return (
    <div className="fixed inset-0 z-[200] bg-white flex flex-col animate-slide-in-right">
      <header
        className="flex-shrink-0 bg-white border-b border-border/50"
        style={{ paddingTop: 'var(--app-safe-area-top-total)' }}
      >
        <CabinetRoleBanner variant="inline" />
        <div className="flex items-center gap-3 px-3 h-14 w-full max-w-2xl mx-auto">
          <button
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-surface transition-colors flex-shrink-0"
          >
            <ArrowLeft size={20} weight="bold" />
          </button>
          <h1 className="text-base font-extrabold tracking-tight flex-1">
            {t('driver.history', { defaultValue: 'Ride history' })}
          </h1>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto" style={{ paddingBottom: 'var(--app-safe-area-bottom-total)' }}>
        <div className="flex flex-col w-full max-w-2xl mx-auto px-5 py-4 space-y-3">
          {isLoading && rides.length === 0 && (
            <p className="text-xs text-muted py-8 text-center">
              {t('common.loading', { defaultValue: 'Loading...' })}
            </p>
          )}
          {!isLoading && rides.length === 0 && (
            <p className="text-xs text-muted py-8 text-center">
              {t('profile.noRides', { defaultValue: 'No rides yet.' })}
            </p>
          )}
          {rides.map((ride) => {
            const statusColors = DRIVER_STATUS_COLOR[ride.status]
            const isBlocked = blockedIds.has(ride.passengerId)
            const canBlock = ride.status === 'completed' && !isBlocked
            return (
              <div key={ride.id} className="rounded-xl bg-surface/70 p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold truncate">{ride.passengerName}</p>
                    <RatingBadge
                      rating={ride.passengerRating}
                      ratingCount={ride.passengerRatingCount}
                      size="sm"
                    />
                  </div>
                  <span
                    className="text-[10px] font-bold px-2 py-0.5 rounded-pill flex-shrink-0"
                    style={{ color: statusColors.color, background: statusColors.bg }}
                  >
                    {t(DRIVER_STATUS_LABEL_KEY[ride.status], { defaultValue: ride.status })}
                  </span>
                </div>
                <p className="text-[11px] text-muted truncate">{ride.fromAddress}</p>
                <p className="text-[11px] text-muted truncate">{ride.toAddress}</p>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] text-muted">
                    {formatRideDateTime(ride, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </p>
                  <span className="text-[10px] font-semibold text-muted">№{ride.rideNumber}</span>
                </div>
                {canBlock && (
                  <div className="pt-1 flex items-center justify-between gap-3 border-t border-border/60">
                    <p className="text-xs font-semibold text-muted">
                      {t('block.blockPassenger', { defaultValue: 'Block passenger' })}
                    </p>
                    <InlineConfirm
                      label={t('block.blockPassenger', { defaultValue: 'Block passenger' })}
                      confirmLabel={t('block.confirmBlock', {
                        name: ride.passengerName,
                        defaultValue: `Block ${ride.passengerName}?`,
                      })}
                      onConfirm={() => {
                        if (blockingId) return
                        void handleBlock(ride)
                      }}
                    />
                  </div>
                )}
                {isBlocked && ride.status === 'completed' && (
                  <p className="text-[10px] font-medium text-muted pt-1 border-t border-border/60">
                    {t('block.blockedSuccess', { defaultValue: 'User blocked' })}
                  </p>
                )}
              </div>
            )
          })}
          {canLoadMore && (
            <button
              type="button"
              disabled={isLoading}
              onClick={() => void loadRides(rides.length, true)}
              className="w-full py-2.5 rounded-xl bg-surface text-xs font-semibold text-muted active:bg-border/40 disabled:opacity-60"
            >
              {isLoading
                ? t('common.loading', { defaultValue: 'Loading...' })
                : t('common.showMoreWithCount', {
                    loaded: rides.length,
                    total,
                    defaultValue: `Show more (${rides.length} of ${total})`,
                  })}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
