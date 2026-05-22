import {
  CaretRight,
  Check,
  Clock,
  MapPin,
  NavigationArrow,
  Phone,
  Warning,
} from '@phosphor-icons/react'

import type { DriverCabinetRide } from '../../../types'
import { directionsHref, showOnMapHref } from '../../../lib/navigation'
import { ctaLabel, DRIVER_STATUS_COLOR, DRIVER_STATUS_LABEL, nextStatus } from '../constants'

interface DriverPassengerCardProps {
  ride: DriverCabinetRide
  index: number
  isSelected: boolean
  isAdvancing: boolean
  onSelect: () => void
  onAdvance: () => void
}

export default function DriverPassengerCard({
  ride,
  index,
  isSelected,
  isAdvancing,
  onSelect,
  onAdvance,
}: DriverPassengerCardProps) {
  const statusColors = DRIVER_STATUS_COLOR[ride.status]
  const nextSt = nextStatus(ride.status)
  const cta = ctaLabel(ride.status)
  const dt = new Date(ride.dateTime)
  const timeStr = dt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  const dateStr = dt.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })

  const needsConfirm = ride.pickupChangedByDriver && !ride.pickupConfirmedAt
  const confirmed = ride.pickupChangedByDriver && !!ride.pickupConfirmedAt

  const headingToPickup = ride.status === 'en_route_to_pickup' || ride.status === 'assigned'
  const navTarget = headingToPickup ? ride.fromLatLng : ride.toLatLng

  return (
    <div
      className={`bg-white rounded-card overflow-hidden transition-all ${
        isSelected ? 'ring-2 ring-black shadow-card' : 'shadow-sm'
      }`}
    >
      {/* Header row — tap to select */}
      <button
        onClick={onSelect}
        className="w-full px-4 py-3 flex items-center gap-3 text-left"
      >
        <div className="w-8 h-8 rounded-full bg-black text-white flex items-center justify-center text-sm font-extrabold flex-shrink-0">
          {index + 1}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold truncate">{ride.passengerName}</p>
          <p className="text-[11px] text-muted truncate">{ride.passengerPhone}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {needsConfirm && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-pill bg-amber-50 text-amber-600 text-[10px] font-bold">
              <Warning size={10} weight="fill" />
              Ждём
            </span>
          )}
          {confirmed && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-pill bg-green-50 text-green-600 text-[10px] font-bold">
              <Check size={10} weight="bold" />
              ОК
            </span>
          )}
          <span
            className="text-[10px] font-bold px-2 py-0.5 rounded-pill"
            style={{ color: statusColors.color, background: statusColors.bg }}
          >
            {DRIVER_STATUS_LABEL[ride.status]}
          </span>
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
                  {needsConfirm
                    ? '⏳ Точка изменена — пассажир ещё не подтвердил'
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

          {/* Action buttons */}
          <div className="flex gap-2">
            <a
              href={`tel:${ride.passengerPhone}`}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-surface text-xs font-bold active:scale-[0.97] transition-transform"
            >
              <Phone size={13} weight="fill" />
              Позвонить
            </a>
            <a
              href={directionsHref(navTarget, headingToPickup ? 'Подача' : 'Конечная')}
              target="_blank"
              rel="noreferrer"
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-black text-white text-xs font-bold active:scale-[0.97] transition-transform"
            >
              <NavigationArrow size={13} weight="fill" />
              Маршрут
            </a>
          </div>

          {/* Show on map link */}
          <a
            href={showOnMapHref(ride.fromLatLng, `Подача · ${ride.passengerName}`)}
            target="_blank"
            rel="noreferrer"
            className="w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-xl bg-surface text-[11px] font-bold text-muted hover:text-black transition-colors"
          >
            <MapPin size={12} weight="fill" />
            Показать точку подачи на карте
          </a>

          {/* Status advance CTA */}
          {cta && nextSt && (
            <button
              onClick={onAdvance}
              disabled={isAdvancing}
              className="w-full py-3 rounded-xl bg-black text-white text-sm font-bold inline-flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
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
