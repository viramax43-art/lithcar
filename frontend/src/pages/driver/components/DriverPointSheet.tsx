/**
 * Bottom sheet shown when driver taps a map point.
 * Redesigned around two core actions: go to point and arrived.
 */
import {
  CaretRight,
  Check,
  Clock,
  MapPin,
  NavigationArrow,
  PaperPlaneTilt,
  Star,
  TelegramLogo,
  Warning,
  X,
} from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'

import type { DriverMapPoint } from '../../../types'
import { directionsHref } from '../../../lib/navigation'
import { formatRideDate, formatRideTime } from '../../../i18n/dateTime'

// ─── Action mapping ───────────────────────────────────────────────────────────

interface ActionDef {
  labelKey: string
  sublabelKey?: string
  variant: 'black' | 'green' | 'blue' | 'amber'
  action: string
}

function getMainAction(pt: DriverMapPoint): ActionDef | null {
  const { pointType, rideStatus } = pt
  if (pointType === 'pickup') {
    if (rideStatus === 'assigned')
      return { labelKey: 'driver.actionGoToPoint', sublabelKey: 'driver.sublabelPickupPassenger', variant: 'black', action: 'start' }
    if (rideStatus === 'en_route_to_pickup')
      return { labelKey: 'driver.actionArrived', sublabelKey: 'driver.sublabelWaitingPassenger', variant: 'blue', action: 'arrived' }
    if (rideStatus === 'awaiting_passenger')
      return { labelKey: 'driver.actionPassengerOnBoard', variant: 'green', action: 'complete' }
  }
  if (pointType === 'dropoff') {
    if (rideStatus === 'awaiting_passenger')
      return { labelKey: 'driver.actionDrivingPassenger', sublabelKey: 'driver.sublabelToDestination', variant: 'black', action: 'start' }
    if (rideStatus === 'in_progress')
      return { labelKey: 'driver.actionArrivedFinish', sublabelKey: 'driver.sublabelPassengerDropped', variant: 'green', action: 'arrived' }
  }
  return null
}

function variantCls(v: ActionDef['variant']): string {
  if (v === 'green') return 'bg-accent text-black active:bg-accent/90'
  if (v === 'blue') return 'bg-blue-600 text-white active:bg-blue-700'
  if (v === 'amber') return 'bg-amber-500 text-white active:bg-amber-600'
  return 'bg-black text-white active:bg-zinc-900'
}

// ─── Component ────────────────────────────────────────────────────────────────

interface DriverPointSheetProps {
  point: DriverMapPoint | null
  isActioning: boolean
  isNotifying: boolean
  onClose: () => void
  onAction: (action: string) => void
  onNotifyPickup: () => void
}

export default function DriverPointSheet({
  point,
  isActioning,
  isNotifying,
  onClose,
  onAction,
  onNotifyPickup,
}: DriverPointSheetProps) {
  return (
    <>
      {point && (
        <div className="absolute inset-0 z-[18]" onClick={onClose} />
      )}
      <div
        className="absolute left-0 right-0 bottom-0 z-[20] bg-white rounded-t-3xl overflow-hidden"
        style={{
          boxShadow: '0 -8px 32px rgba(0,0,0,0.12)',
          transform: point ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.28s cubic-bezier(0.32,0.72,0,1)',
          maxHeight: '80dvh',
          overflowY: 'auto',
          paddingBottom: 'var(--app-safe-area-bottom-total)',
          willChange: 'transform',
        }}
      >
        {point && (
          <SheetBody
            point={point}
            isActioning={isActioning}
            isNotifying={isNotifying}
            onClose={onClose}
            onAction={onAction}
            onNotifyPickup={onNotifyPickup}
          />
        )}
      </div>
    </>
  )
}

function SheetBody({
  point,
  isActioning,
  isNotifying,
  onClose,
  onAction,
  onNotifyPickup,
}: DriverPointSheetProps & { point: DriverMapPoint }) {
  const { t } = useTranslation()
  const mainAction = getMainAction(point)
  const isPickup = point.pointType === 'pickup'
  const isDone = point.pointStatus === 'done'
  const pointColor = isDone ? '#16A34A' : isPickup ? '#EF4444' : '#3B82F6'

  const timeStr = formatRideTime(point)
  const dateStr = formatRideDate(point, { day: 'numeric', month: 'short' })

  const pickupChangedNotNotified = isPickup && point.pickupChangedByDriver && !point.pickupNotifiedAt
  const needsPassengerConfirm = isPickup && point.pickupChangedByDriver && !!point.pickupNotifiedAt && !point.pickupConfirmedAt
  const pickupConfirmed = isPickup && point.pickupChangedByDriver && !!point.pickupConfirmedAt

  const tgLink = point.passengerTelegramUsername
    ? `https://t.me/${point.passengerTelegramUsername}`
    : `tg://user?id=${point.passengerTelegramId}`
  const navLink = directionsHref(point.latLng, point.address)

  return (
    <div>
      {/* Drag handle */}
      <div className="flex justify-center pt-3 pb-0">
        <div className="w-9 h-1 rounded-full bg-border" />
      </div>

      {/* ── Point label + close ──────────────────────────────────────────── */}
      <div className="px-5 pt-4 pb-3 flex items-center gap-3">
        <div
          className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 text-white font-extrabold text-base"
          style={{ background: pointColor }}
        >
          {point.recommendedOrder ?? (isPickup ? 'A' : 'B')}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted">
            {isPickup
              ? t('driver.pickupPassenger', { defaultValue: 'Pickup passenger' })
              : t('driver.dropoffPassenger', { defaultValue: 'Dropoff passenger' })} · №{point.rideNumber}
          </p>
          <p className="text-lg font-extrabold tracking-tight truncate leading-tight mt-0.5">
            {point.passengerName}
          </p>
          <p className="text-[11px] text-muted flex items-center gap-1 mt-0.5">
            <Star size={11} weight="fill" className="text-amber-400" />
            {point.passengerRating.toFixed(1)}
            {point.passengerRatingCount > 0 && (
              <span className="text-muted/80">({point.passengerRatingCount})</span>
            )}
          </p>
          {isDone && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-green-700">
              <Check size={10} weight="bold" /> {t('common.done', { defaultValue: 'Done' })}
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="w-9 h-9 rounded-2xl bg-surface flex items-center justify-center flex-shrink-0 active:scale-95 transition-transform"
        >
          <X size={15} weight="bold" className="text-muted" />
        </button>
      </div>

      {/* ── Address + time ───────────────────────────────────────────────── */}
      <div className="mx-4 mb-4 rounded-2xl bg-surface px-4 py-3.5 space-y-1">
        <div className="flex items-start gap-2">
          <MapPin size={14} weight="fill" className="text-muted flex-shrink-0 mt-0.5" />
          <p className="text-sm font-semibold leading-snug">{point.address}</p>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-muted">
          <Clock size={11} />
          {dateStr} · {timeStr}
        </div>

        {/* Pickup change status */}
        {pickupChangedNotNotified && (
          <div className="flex items-start gap-1.5 pt-1">
            <Warning size={12} weight="fill" className="text-amber-500 flex-shrink-0 mt-0.5" />
            <p className="text-[11px] font-semibold text-amber-700">
              {t('driver.pickupChangedNotifyHint', { defaultValue: 'Point changed - notify passenger' })}
            </p>
          </div>
        )}
        {needsPassengerConfirm && (
          <div className="flex items-start gap-1.5 pt-1">
            <Warning size={12} weight="fill" className="text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-[11px] font-semibold text-amber-600">
              {t('driver.waitingPassengerConfirmation', { defaultValue: 'Waiting for passenger confirmation' })}
            </p>
          </div>
        )}
        {pickupConfirmed && (
          <div className="flex items-start gap-1.5 pt-1">
            <Check size={12} weight="bold" className="text-green-600 flex-shrink-0 mt-0.5" />
            <p className="text-[11px] font-semibold text-green-700">
              {t('driver.passengerConfirmedPoint', { defaultValue: 'Passenger confirmed point' })}
            </p>
          </div>
        )}
      </div>

      {/* ── Navigation + Contact ─────────────────────────────────────────── */}
      <div className="px-4 mb-4 flex gap-2.5">
        <a
          href={navLink}
          target="_blank"
          rel="noreferrer"
          className="flex-1 flex items-center justify-center gap-2 h-12 rounded-2xl bg-black text-white text-sm font-bold active:bg-zinc-800 transition-colors touch-none"
        >
          <NavigationArrow size={16} weight="fill" />
          {t('driver.openInNavigator', { defaultValue: 'Open in navigator' })}
        </a>
        <a
          href={tgLink}
          target="_blank"
          rel="noreferrer"
          className="flex-1 flex items-center justify-center gap-2 h-12 rounded-2xl text-white text-sm font-bold touch-none transition-opacity active:opacity-90"
          style={{ background: '#2AABEE' }}
        >
          <TelegramLogo size={16} weight="fill" />
          {t('common.message', { defaultValue: 'Message' })}
        </a>
      </div>

      {/* ── Notify pickup change ─────────────────────────────────────────── */}
      {pickupChangedNotNotified && (
        <div className="px-4 mb-3">
          <button
            onClick={onNotifyPickup}
            disabled={isNotifying}
            className="w-full h-13 rounded-2xl bg-amber-500 text-white text-sm font-bold flex items-center justify-center gap-2 active:bg-amber-600 transition-colors disabled:opacity-60 touch-none"
            style={{ height: 52 }}
          >
            {isNotifying ? (
              <>
                <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                {t('common.sending', { defaultValue: 'Sending...' })}
              </>
            ) : (
              <>
                <PaperPlaneTilt size={16} weight="fill" />
                {t('driver.notifyPointChanged', { defaultValue: 'Notify about point change' })}
              </>
            )}
          </button>
        </div>
      )}

      {/* ── MAIN ACTION BUTTON ───────────────────────────────────────────── */}
      {mainAction && (
        <div className="px-4 pb-3">
          <button
            onClick={() => onAction(mainAction.action)}
            disabled={isActioning}
            className={`w-full rounded-2xl font-extrabold flex flex-col items-center justify-center gap-0.5 transition-all active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed touch-none ${variantCls(mainAction.variant)}`}
            style={{ height: 68 }}
          >
            {isActioning ? (
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full border-2 border-current/30 border-t-current animate-spin" />
                <span className="text-base font-extrabold">{t('common.updating', { defaultValue: 'Updating...' })}</span>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <span className="text-[17px] font-extrabold tracking-tight">
                    {t(mainAction.labelKey, { defaultValue: mainAction.labelKey })}
                  </span>
                  <CaretRight size={17} weight="bold" />
                </div>
                {mainAction.sublabelKey && (
                  <span className="text-[11px] font-semibold opacity-70">
                    {t(mainAction.sublabelKey, { defaultValue: mainAction.sublabelKey })}
                  </span>
                )}
              </>
            )}
          </button>
        </div>
      )}
    </div>
  )
}
