import {
  CaretDown,
  CaretRight,
  Check,
  Clock,
  MapPin,
  NavigationArrow,
  PaperPlaneTilt,
  Warning,
} from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'

import RatingBadge from '../../../components/RatingBadge'
import type { DriverCabinetRide } from '../../../types'
import { directionsHref, showOnMapHref } from '../../../lib/navigation'
import { formatRideDate, formatRideTime } from '../../../i18n/dateTime'
import { ctaLabelKey, DRIVER_STATUS_COLOR, DRIVER_STATUS_LABEL_KEY, nextStatus } from '../constants'

interface DriverPassengerCardProps {
  ride: DriverCabinetRide
  isSelected: boolean
  isAdvancing: boolean
  isNotifying: boolean
  onSelect: () => void
  onAdvance: () => void
  onNotifyPickup: () => void
}

export default function DriverPassengerCard({
  ride,
  isSelected,
  isAdvancing,
  isNotifying,
  onSelect,
  onAdvance,
  onNotifyPickup,
}: DriverPassengerCardProps) {
  const { t } = useTranslation()
  const statusColors = DRIVER_STATUS_COLOR[ride.status]
  const nextSt = nextStatus(ride.status)
  const ctaKey = ctaLabelKey(ride.status)
  const timeStr = formatRideTime(ride)
  const dateStr = formatRideDate(ride, { day: 'numeric', month: 'short' })

  const pickupChangedNotNotified = ride.pickupChangedByDriver && !ride.pickupNotifiedAt
  const needsPassengerConfirm = ride.pickupChangedByDriver && !!ride.pickupNotifiedAt && !ride.pickupConfirmedAt
  const confirmed = ride.pickupChangedByDriver && !!ride.pickupConfirmedAt

  return (
    <div
      className={`bg-white rounded-card overflow-hidden transition-all ${
        isSelected ? 'ring-2 ring-black shadow-card' : 'shadow-sm'
      }`}
    >
      {/* Header row — tap to select */}
      <button
        onClick={onSelect}
        className="w-full px-4 py-3.5 flex items-center gap-3 text-left touch-none"
      >
        <div className="w-9 h-9 rounded-full bg-black text-white flex items-center justify-center text-sm font-extrabold flex-shrink-0">
          {ride.passengerNumber ?? '—'}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold truncate">{ride.passengerName}</p>
              <RatingBadge
                rating={ride.passengerRating}
                ratingCount={ride.passengerRatingCount}
              />
            </div>
            <span className="text-[10px] font-semibold text-muted flex-shrink-0">№{ride.rideNumber}</span>
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded-pill touch-compact"
              style={{ color: statusColors.color, background: statusColors.bg }}
            >
              {t(DRIVER_STATUS_LABEL_KEY[ride.status], { defaultValue: ride.status })}
            </span>
            {pickupChangedNotNotified && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-pill bg-blue-50 text-blue-600 text-[10px] font-bold touch-compact">
                <Warning size={10} weight="fill" />
                {t('driver.confirm', { defaultValue: 'Confirm' })}
              </span>
            )}
            {needsPassengerConfirm && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-pill bg-amber-50 text-amber-600 text-[10px] font-bold touch-compact">
                <Warning size={10} weight="fill" />
                {t('driver.waiting', { defaultValue: 'Waiting' })}
              </span>
            )}
            {confirmed && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-pill bg-green-50 text-green-600 text-[10px] font-bold touch-compact">
                <Check size={10} weight="bold" />
                {t('common.ok', { defaultValue: 'OK' })}
              </span>
            )}
          </div>
        </div>
        <div className="flex-shrink-0 w-6 h-6 flex items-center justify-center text-muted transition-transform" style={{ transform: isSelected ? 'rotate(0deg)' : 'rotate(-90deg)' }}>
          <CaretDown size={14} weight="bold" />
        </div>
      </button>

      {/* Expanded details */}
      {isSelected && (
        <div className="px-4 pb-4 space-y-3 border-t border-border/50">
          {/* Pickup point */}
          <div className="pt-3 flex items-start gap-2">
            <div className="w-5 h-5 rounded-full bg-point-a flex items-center justify-center flex-shrink-0 mt-0.5">
              <MapPin size={11} weight="fill" className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted">{t('driver.pickupPoint', { defaultValue: 'Pickup point' })}</p>
              <p className="text-xs font-semibold mt-0.5">{ride.fromAddress}</p>
              <p className="text-[10px] font-mono text-muted mt-0.5">
                {ride.fromLatLng.lat.toFixed(5)}, {ride.fromLatLng.lng.toFixed(5)}
              </p>
              {ride.pickupChangedByDriver && (
                <p className="text-[10px] mt-1 font-semibold text-amber-600">
                  {pickupChangedNotNotified
                    ? t('driver.pickupChangedNotifyHint', { defaultValue: 'Point changed - press confirm to notify passenger' })
                    : needsPassengerConfirm
                    ? t('driver.pickupChangedWaitingConfirm', { defaultValue: 'Notification sent - passenger has not confirmed yet' })
                    : t('driver.pickupChangedConfirmed', { defaultValue: 'Point changed - passenger confirmed' })}
                </p>
              )}
            </div>
          </div>

          {/* Destination */}
          <div className="flex items-start gap-2">
            <div className="w-5 h-5 rounded-full bg-point-b flex items-center justify-center flex-shrink-0 mt-0.5">
              <MapPin size={11} weight="fill" className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted">{t('passenger.toLabel', { defaultValue: 'To' })}</p>
              <p className="text-xs font-semibold mt-0.5">{ride.toAddress}</p>
            </div>
          </div>

          {/* Time */}
          <div className="flex items-center gap-1.5 text-[11px] text-muted">
            <Clock size={12} />
            {dateStr} · {timeStr}
          </div>

          {/* Navigation buttons — open in any navigator */}
          <div className="flex gap-2">
            <a
              href={directionsHref(ride.fromLatLng, t('driver.pickup', { defaultValue: 'Pickup' }))}
              target="_blank"
              rel="noreferrer"
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-black text-white text-sm font-bold btn-press touch-none"
            >
              <NavigationArrow size={15} weight="fill" />
              {t('driver.pickup', { defaultValue: 'Pickup' })}
            </a>
            <a
              href={directionsHref(ride.toLatLng, t('driver.dropoff', { defaultValue: 'Dropoff' }))}
              target="_blank"
              rel="noreferrer"
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-zinc-700 text-white text-sm font-bold btn-press touch-none"
            >
              <NavigationArrow size={15} weight="fill" />
              {t('driver.dropoff', { defaultValue: 'Dropoff' })}
            </a>
          </div>

          {/* Show on map links */}
          <div className="flex gap-2">
            <a
              href={showOnMapHref(ride.fromLatLng, t('driver.pickupWithName', { name: ride.passengerName, defaultValue: `Pickup · ${ride.passengerName}` }))}
              target="_blank"
              rel="noreferrer"
              className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-surface text-[11px] font-bold text-muted hover:text-black transition-colors touch-none"
            >
              <MapPin size={12} weight="fill" />
              {t('driver.pointA', { defaultValue: 'Point A' })}
            </a>
            <a
              href={showOnMapHref(ride.toLatLng, t('driver.dropoffWithName', { name: ride.passengerName, defaultValue: `Dropoff · ${ride.passengerName}` }))}
              target="_blank"
              rel="noreferrer"
              className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-surface text-[11px] font-bold text-muted hover:text-black transition-colors touch-none"
            >
              <MapPin size={12} weight="fill" />
              {t('driver.pointB', { defaultValue: 'Point B' })}
            </a>
          </div>

          {/* Confirm & notify passenger about changed pickup */}
          {pickupChangedNotNotified && (
            <button
              onClick={onNotifyPickup}
              disabled={isNotifying}
              className="w-full py-3 rounded-xl bg-blue-600 text-white text-sm font-bold inline-flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isNotifying ? (
                t('common.sending', { defaultValue: 'Sending...' })
              ) : (
                <>
                  <PaperPlaneTilt size={15} weight="fill" />
                  {t('driver.confirmAndNotifyPassenger', { defaultValue: 'Confirm and notify passenger' })}
                </>
              )}
            </button>
          )}

          {/* Status advance CTA */}
          {ctaKey && nextSt && (
            <button
              onClick={onAdvance}
              disabled={isAdvancing}
              className="w-full py-3.5 rounded-xl bg-black text-white text-sm font-bold inline-flex items-center justify-center gap-2 btn-press disabled:opacity-60 disabled:cursor-not-allowed touch-none"
            >
              {isAdvancing
                ? t('common.updating', { defaultValue: 'Updating...' })
                : t(ctaKey, { defaultValue: ctaKey })}
              {!isAdvancing && <CaretRight size={14} weight="bold" />}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
