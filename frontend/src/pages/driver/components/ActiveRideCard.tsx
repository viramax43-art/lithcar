import {
  Calendar,
  CaretRight,
  Clock,
  MapPin,
  NavigationArrow,
  User,
} from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'

import RatingBadge from '../../../components/RatingBadge'
import type { DriverCabinetRide } from '../../../types'
import type { LatLng } from '../../../types'
import { directionsHref, showOnMapHref } from '../../../lib/navigation'
import { formatRideDate, formatRideTime } from '../../../i18n/dateTime'
import { ctaLabelKey, DRIVER_STATUS_COLOR, DRIVER_STATUS_LABEL_KEY, nextStatus } from '../constants'
import RideStepper from './RideStepper'

interface ActiveRideCardProps {
  ride: DriverCabinetRide
  isAdvancing: boolean
  onAdvance: () => void
}

export default function ActiveRideCard({ ride, isAdvancing, onAdvance }: ActiveRideCardProps) {
  const { t } = useTranslation()
  const nextSt = nextStatus(ride.status)
  const ctaKey = ctaLabelKey(ride.status)
  const statusColors = DRIVER_STATUS_COLOR[ride.status]

  const dateStr = formatRideDate(ride, { day: 'numeric', month: 'long' })
  const timeStr = formatRideTime(ride)

  const headingToPickup = ride.status === 'en_route_to_pickup' || ride.status === 'assigned'
  const navTarget = headingToPickup ? ride.fromLatLng : ride.toLatLng
  const navLabel = headingToPickup
    ? t('driver.routeToPassenger', { defaultValue: 'Route to passenger' })
    : t('driver.routeToPointB', { defaultValue: 'Route to point B' })

  return (
    <section className="bg-black text-white rounded-card overflow-hidden shadow-card">
      {/* Status + meta */}
      <div className="px-4 py-3.5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-white/70 mb-1">
            {t('driver.activeRide', { defaultValue: 'Active ride' })}
          </p>
          <p className="text-[11px] font-semibold text-white/75 mb-1">№{ride.rideNumber}</p>
          <span
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-pill text-[11px] font-bold"
            style={{ color: statusColors.color, background: 'rgba(255,255,255,0.08)' }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full animate-pulse"
              style={{ background: statusColors.color }}
            />
            {t(DRIVER_STATUS_LABEL_KEY[ride.status], { defaultValue: ride.status })}
          </span>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="inline-flex items-center gap-1 text-[11px] text-white/85">
            <Calendar size={11} />
            {dateStr}
          </div>
          <div className="inline-flex items-center gap-1 text-[11px] text-white/85 mt-0.5">
            <Clock size={11} />
            {timeStr}
          </div>
        </div>
      </div>

      {/* Primary CTA: open route in external navigator */}
      <div className="px-4">
        <a
          href={directionsHref(navTarget, navLabel)}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-3 w-full px-4 py-3 rounded-card bg-accent text-black shadow-card active:scale-[0.98] transition-transform"
        >
          <div className="w-10 h-10 rounded-xl bg-black/10 flex items-center justify-center flex-shrink-0">
            <NavigationArrow size={18} weight="fill" />
          </div>
          <div className="flex-1 min-w-0 text-left">
            <p className="text-[10px] font-bold uppercase tracking-wider opacity-70">
              {headingToPickup
                ? t('driver.goingToPassenger', { defaultValue: 'Heading to passenger' })
                : t('driver.drivingPassenger', { defaultValue: 'Driving passenger' })}
            </p>
            <p className="text-sm font-extrabold truncate">{navLabel}</p>
          </div>
          <CaretRight size={16} weight="bold" />
        </a>
      </div>

      {/* Address blocks: tap to open in navigator */}
      <div className="px-4 py-4 space-y-2">
        <AddressBlock
          point="A"
          colorClass="bg-point-a"
          label={t('driver.fromPointA', { defaultValue: 'From (point A)' })}
          address={ride.fromAddress}
          latlng={ride.fromLatLng}
          openLabel={t('driver.pickup', { defaultValue: 'Pickup' })}
          showOnMapLabel={t('common.showOnMap', { defaultValue: 'Show on map' })}
          highlighted={headingToPickup}
        />
        <AddressBlock
          point="B"
          colorClass="bg-point-b"
          label={t('driver.toPointB', { defaultValue: 'To (point B)' })}
          address={ride.toAddress}
          latlng={ride.toLatLng}
          openLabel={t('driver.dropoff', { defaultValue: 'Dropoff' })}
          showOnMapLabel={t('common.showOnMap', { defaultValue: 'Show on map' })}
          highlighted={!headingToPickup}
        />
      </div>

      {/* Passenger */}
      <div className="px-4 py-3 border-t border-white/10 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0">
          <User size={16} weight="fill" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold truncate">{ride.passengerName}</p>
          <RatingBadge
            rating={ride.passengerRating}
            ratingCount={ride.passengerRatingCount}
            variant="dark"
          />
        </div>
      </div>

      {/* Stepper */}
      <div className="px-4 py-4 border-t border-white/10">
        <RideStepper status={ride.status} />
      </div>

      {/* CTA */}
      {ctaKey && nextSt && (
        <div className="px-4 pb-4 pt-1">
          <button
            onClick={onAdvance}
            disabled={isAdvancing}
            className="w-full py-3.5 rounded-card bg-white text-black text-sm font-extrabold inline-flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed shadow-card"
          >
            {isAdvancing
              ? t('common.updating', { defaultValue: 'Updating...' })
              : t(ctaKey, { defaultValue: ctaKey })}
            {!isAdvancing && <CaretRight size={16} weight="bold" />}
          </button>
          <p className="text-[10px] text-white/60 text-center mt-2 flex items-center justify-center gap-1">
            <MapPin size={9} weight="fill" />
            {t('driver.nextStatus', { defaultValue: 'Next status' })}: {t(DRIVER_STATUS_LABEL_KEY[nextSt], { defaultValue: nextSt })}
          </p>
        </div>
      )}
    </section>
  )
}

interface AddressBlockProps {
  point: 'A' | 'B'
  colorClass: string
  label: string
  address: string
  latlng: LatLng
  openLabel: string
  showOnMapLabel: string
  highlighted: boolean
}

function AddressBlock({ point, colorClass, label, address, latlng, openLabel, showOnMapLabel, highlighted }: AddressBlockProps) {
  return (
    <div
      className={`rounded-card p-3 transition-colors ${
        highlighted ? 'bg-white/10 border border-white/20' : 'bg-white/[0.04] border border-white/10'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="flex flex-col items-center flex-shrink-0 pt-1">
          <span className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-extrabold text-white ${colorClass}`}>
            {point}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-white/65">{label}</p>
          <p className="text-sm font-semibold leading-snug mt-0.5">{address}</p>
          <p className="text-[10px] font-mono text-white/60 mt-1">
            {latlng.lat.toFixed(5)}, {latlng.lng.toFixed(5)}
          </p>
        </div>
      </div>

      {/* Map pin: show point on map (route is built by top CTA) */}
      <div className="mt-3">
        <a
          href={showOnMapHref(latlng, openLabel)}
          target="_blank"
          rel="noreferrer"
          className="w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-pill bg-white/10 hover:bg-white/20 text-[11px] font-bold transition-colors active:scale-[0.97]"
        >
          <MapPin size={12} weight="fill" />
          {showOnMapLabel}
        </a>
      </div>
    </div>
  )
}
