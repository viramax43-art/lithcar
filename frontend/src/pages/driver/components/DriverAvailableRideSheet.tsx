import { Clock, X } from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'

import RatingBadge from '../../../components/RatingBadge'
import { formatRideDate, formatRideTime } from '../../../i18n/dateTime'
import { useEscapeClose } from '../../../lib/useEscapeClose'
import type { DriverMapPoint } from '../../../types'

interface DriverAvailableRideSheetProps {
  pickup: DriverMapPoint | null
  dropoff: DriverMapPoint | null
  isClaiming: boolean
  onClose: () => void
  onClaim: () => void
}

export default function DriverAvailableRideSheet({
  pickup,
  dropoff,
  isClaiming,
  onClose,
  onClaim,
}: DriverAvailableRideSheetProps) {
  const { t } = useTranslation()
  const point = pickup ?? dropoff
  const open = Boolean(point)
  useEscapeClose(open && !isClaiming, onClose)

  if (!point) {
    return null
  }

  const timeStr = formatRideTime(point)
  const dateStr = formatRideDate(point, { day: 'numeric', month: 'short' })

  return (
    <>
      <div className="absolute inset-0 z-[18]" onClick={onClose} />
      <div
        className="absolute left-0 right-0 bottom-0 z-[20] bg-white rounded-t-3xl overflow-hidden md:max-w-lg md:mx-auto md:rounded-t-2xl"
        style={{
          boxShadow: '0 -8px 32px rgba(0,0,0,0.12)',
          transform: open ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.28s cubic-bezier(0.32,0.72,0,1)',
          paddingBottom: 'var(--app-safe-area-bottom-total)',
        }}
      >
        <div className="flex justify-center pt-3 pb-0">
          <div className="w-9 h-1 rounded-full bg-border" />
        </div>

        <div className="px-5 pt-4 pb-3 flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 text-white font-extrabold text-base bg-amber-500">
            {point.rideNumber}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700">
              {t('driver.availableRide', { defaultValue: 'Available ride' })}
            </p>
            <p className="text-lg font-extrabold tracking-tight truncate leading-tight mt-0.5">
              {point.passengerName}
            </p>
            <RatingBadge
              rating={point.passengerRating}
              ratingCount={point.passengerRatingCount}
            />
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-11 h-11 rounded-2xl bg-surface flex items-center justify-center flex-shrink-0"
          >
            <X size={16} weight="bold" className="text-muted" />
          </button>
        </div>

        <div className="mx-4 mb-4 rounded-2xl bg-surface px-4 py-3.5 space-y-2">
          {pickup && (
            <div className="flex items-start gap-2">
              <span className="w-5 h-5 rounded-md bg-red-500 text-white text-[10px] font-extrabold flex items-center justify-center flex-shrink-0 mt-0.5">A</span>
              <p className="text-sm font-semibold leading-snug">{pickup.address}</p>
            </div>
          )}
          {dropoff && (
            <div className="flex items-start gap-2">
              <span className="w-5 h-5 rounded-md bg-blue-500 text-white text-[10px] font-extrabold flex items-center justify-center flex-shrink-0 mt-0.5">B</span>
              <p className="text-sm font-semibold leading-snug">{dropoff.address}</p>
            </div>
          )}
          <div className="flex items-center gap-1.5 text-[11px] text-muted pt-1">
            <Clock size={11} />
            {dateStr} · {timeStr}
          </div>
        </div>

        <div className="px-4 pb-4">
          <button
            type="button"
            onClick={onClaim}
            disabled={isClaiming}
            className="w-full h-14 rounded-2xl bg-black text-white text-sm font-extrabold active:scale-[0.98] transition-transform disabled:opacity-60 touch-none"
          >
            {isClaiming
              ? t('driver.claimingRide', { defaultValue: 'Taking ride...' })
              : t('driver.claimRide', { defaultValue: 'Take this ride' })}
          </button>
        </div>
      </div>
    </>
  )
}
