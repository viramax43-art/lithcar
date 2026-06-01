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

import type { DriverCabinetRide } from '../../../types'
import { directionsHref, showOnMapHref } from '../../../lib/navigation'
import { formatDate, formatTime } from '../../../i18n/dateTime'
import { ctaLabel, DRIVER_STATUS_COLOR, DRIVER_STATUS_LABEL, nextStatus } from '../constants'

interface DriverPassengerCardProps {
  ride: DriverCabinetRide
  index: number
  isSelected: boolean
  isAdvancing: boolean
  isNotifying: boolean
  onSelect: () => void
  onAdvance: () => void
  onNotifyPickup: () => void
}

export default function DriverPassengerCard({
  ride,
  index,
  isSelected,
  isAdvancing,
  isNotifying,
  onSelect,
  onAdvance,
  onNotifyPickup,
}: DriverPassengerCardProps) {
  const statusColors = DRIVER_STATUS_COLOR[ride.status]
  const nextSt = nextStatus(ride.status)
  const cta = ctaLabel(ride.status)
  const dt = new Date(ride.dateTime)
  const timeStr = formatTime(dt, { hour: '2-digit', minute: '2-digit' })
  const dateStr = formatDate(dt, { day: 'numeric', month: 'short' })

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
          {index + 1}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <p className="text-sm font-bold truncate">{ride.passengerName}</p>
            <span className="text-[10px] font-semibold text-muted flex-shrink-0">№{ride.rideNumber}</span>
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded-pill touch-compact"
              style={{ color: statusColors.color, background: statusColors.bg }}
            >
              {DRIVER_STATUS_LABEL[ride.status]}
            </span>
            {pickupChangedNotNotified && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-pill bg-blue-50 text-blue-600 text-[10px] font-bold touch-compact">
                <Warning size={10} weight="fill" />
                Подтвердите
              </span>
            )}
            {needsPassengerConfirm && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-pill bg-amber-50 text-amber-600 text-[10px] font-bold touch-compact">
                <Warning size={10} weight="fill" />
                Ждём
              </span>
            )}
            {confirmed && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-pill bg-green-50 text-green-600 text-[10px] font-bold touch-compact">
                <Check size={10} weight="bold" />
                ОК
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
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Точка подачи</p>
              <p className="text-xs font-semibold mt-0.5">{ride.fromAddress}</p>
              <p className="text-[10px] font-mono text-muted mt-0.5">
                {ride.fromLatLng.lat.toFixed(5)}, {ride.fromLatLng.lng.toFixed(5)}
              </p>
              {ride.pickupChangedByDriver && (
                <p className="text-[10px] mt-1 font-semibold text-amber-600">
                  {pickupChangedNotNotified
                    ? '📝 Точка изменена — нажмите «Подтвердить» чтобы уведомить пассажира'
                    : needsPassengerConfirm
                    ? '⏳ Уведомление отправлено — пассажир ещё не подтвердил'
                    : '✅ Точка изменена — пассажир подтвердил'}
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
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Куда</p>
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
              href={directionsHref(ride.fromLatLng, 'Подача')}
              target="_blank"
              rel="noreferrer"
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-black text-white text-sm font-bold btn-press touch-none"
            >
              <NavigationArrow size={15} weight="fill" />
              Подача
            </a>
            <a
              href={directionsHref(ride.toLatLng, 'Конечная')}
              target="_blank"
              rel="noreferrer"
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-zinc-700 text-white text-sm font-bold btn-press touch-none"
            >
              <NavigationArrow size={15} weight="fill" />
              Конечная
            </a>
          </div>

          {/* Show on map links */}
          <div className="flex gap-2">
            <a
              href={showOnMapHref(ride.fromLatLng, `Подача · ${ride.passengerName}`)}
              target="_blank"
              rel="noreferrer"
              className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-surface text-[11px] font-bold text-muted hover:text-black transition-colors touch-none"
            >
              <MapPin size={12} weight="fill" />
              Точка A
            </a>
            <a
              href={showOnMapHref(ride.toLatLng, `Конечная · ${ride.passengerName}`)}
              target="_blank"
              rel="noreferrer"
              className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-surface text-[11px] font-bold text-muted hover:text-black transition-colors touch-none"
            >
              <MapPin size={12} weight="fill" />
              Точка B
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
                'Отправляем…'
              ) : (
                <>
                  <PaperPlaneTilt size={15} weight="fill" />
                  Подтвердить и уведомить пассажира
                </>
              )}
            </button>
          )}

          {/* Status advance CTA */}
          {cta && nextSt && (
            <button
              onClick={onAdvance}
              disabled={isAdvancing}
              className="w-full py-3.5 rounded-xl bg-black text-white text-sm font-bold inline-flex items-center justify-center gap-2 btn-press disabled:opacity-60 disabled:cursor-not-allowed touch-none"
            >
              {isAdvancing ? 'Обновляем…' : cta}
              {!isAdvancing && <CaretRight size={14} weight="bold" />}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
