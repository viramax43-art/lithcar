import { useEffect, useMemo, useState } from 'react'
import { Calendar, Clock, X } from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'
import RoutePointsEditor, { type RoutePointsValue } from '../../../components/RoutePointsEditor'
import { getPricing } from '../../../lib/backend'
import { DEFAULT_PRICING_SETTINGS } from '../../../lib/pricingDefaults'
import { addAppLocalDays, rideLocalDateInput, rideLocalTimeInput, toAppLocalDateInput } from '../../../i18n/dateTime'
import { buildRideTimeSlots } from '../../../lib/rideTimeSlots'
import type { PricingSettings, RideRequest } from '../../../types'

interface EditRequestSheetProps {
  open: boolean
  request: RideRequest
  routeOnly?: boolean
  isSaving?: boolean
  onClose: () => void
  onSave: (payload: {
    fromAddress: string
    toAddress: string
    fromLatLng: { lat: number; lng: number }
    toLatLng: { lat: number; lng: number }
    dateTime?: string
  }) => void | Promise<void>
}

export default function EditRequestSheet({
  open,
  request,
  routeOnly = false,
  isSaving = false,
  onClose,
  onSave,
}: EditRequestSheetProps) {
  const { t } = useTranslation()
  const now = new Date()
  const todayDate = toAppLocalDateInput(now)
  const maxDate = addAppLocalDays(now, 2)

  const [pricing, setPricing] = useState<PricingSettings>(DEFAULT_PRICING_SETTINGS)
  const [routeValue, setRouteValue] = useState<RoutePointsValue>({
    fromAddress: request.from.address,
    fromLatLng: { lat: request.from.latlng.lat, lng: request.from.latlng.lng },
    toAddress: request.to.address,
    toLatLng: { lat: request.to.latlng.lat, lng: request.to.latlng.lng },
  })
  const [date, setDate] = useState(() => rideLocalDateInput(request))
  const [time, setTime] = useState(() => rideLocalTimeInput(request))

  useEffect(() => {
    if (!open) return
    setRouteValue({
      fromAddress: request.from.address,
      fromLatLng: { lat: request.from.latlng.lat, lng: request.from.latlng.lng },
      toAddress: request.to.address,
      toLatLng: { lat: request.to.latlng.lat, lng: request.to.latlng.lng },
    })
    setDate(rideLocalDateInput(request))
    setTime(rideLocalTimeInput(request))
    void getPricing().then(setPricing).catch(() => undefined)
  }, [open, request])

  const timeSlots = useMemo(
    () =>
      buildRideTimeSlots({
        workStartTime: pricing.workStartTime || '06:00',
        workEndTime: pricing.workEndTime || '19:00',
        slotIntervalMinutes: pricing.slotIntervalMinutes || 30,
        selectedDate: date,
      }),
    [pricing, date],
  )

  useEffect(() => {
    if (routeOnly) return
    if (time && timeSlots.includes(time)) return
    if (timeSlots.length > 0) setTime(timeSlots[0])
  }, [timeSlots, time, routeOnly])

  if (!open) return null

  const canSave = routeOnly
    ? Boolean(routeValue.fromAddress.trim() && routeValue.toAddress.trim())
    : Boolean(routeValue.fromAddress.trim() && routeValue.toAddress.trim() && date && time)

  return (
    <>
      <div className="fixed inset-0 z-[300] bg-black/40" onClick={onClose} />
      <div
        className="fixed left-0 right-0 bottom-0 z-[310] bg-white rounded-t-3xl overflow-hidden animate-slide-up max-h-[92dvh] overflow-y-auto"
        style={{ paddingBottom: 'var(--app-user-safe-bottom)' }}
      >
        <div className="flex justify-center pt-3">
          <div className="w-9 h-1 rounded-full bg-border" />
        </div>
        <div className="px-5 pt-4 pb-3 flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-lg font-extrabold tracking-tight">
              {routeOnly
                ? t('passenger.editRoute', { defaultValue: 'Edit route' })
                : t('passenger.editRequest', { defaultValue: 'Edit request' })}
            </p>
            <p className="text-sm text-muted mt-0.5">
              {routeOnly
                ? t('passenger.editRouteHint', { defaultValue: 'Move points A and B on the map' })
                : t('passenger.editRequestHint', { defaultValue: 'Change pickup, destination or ride time' })}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-2xl bg-surface flex items-center justify-center flex-shrink-0"
          >
            <X size={15} weight="bold" className="text-muted" />
          </button>
        </div>

        <div className="px-5 pb-6 space-y-4">
          <RoutePointsEditor value={routeValue} onChange={setRouteValue} />

          {!routeOnly && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold text-muted inline-flex items-center gap-1">
                    <Calendar size={12} />
                    {t('passenger.dateLabel', { defaultValue: 'Date' })}
                  </span>
                  <input
                    type="date"
                    value={date}
                    min={todayDate}
                    max={maxDate}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full rounded-xl border border-border bg-surface px-3 py-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-black/10"
                  />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold text-muted inline-flex items-center gap-1">
                    <Clock size={12} />
                    {t('passenger.timeLabel', { defaultValue: 'Time' })}
                  </span>
                  <select
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    className="w-full rounded-xl border border-border bg-surface px-3 py-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-black/10 appearance-none"
                  >
                    <option value="">{t('passenger.selectTime', { defaultValue: 'Select time' })}</option>
                    {timeSlots.map((slot) => (
                      <option key={slot} value={slot}>
                        {slot}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <p className="text-[11px] text-muted">
                {t('passenger.minLeadHoursHint', {
                  hours: 5,
                  defaultValue: 'Ride must be at least 5 hours from now.',
                })}
              </p>
            </>
          )}

          <button
            type="button"
            disabled={isSaving || !canSave}
            onClick={() => {
              if (!canSave) return
              void onSave({
                fromAddress: routeValue.fromAddress.trim(),
                toAddress: routeValue.toAddress.trim(),
                fromLatLng: routeValue.fromLatLng,
                toLatLng: routeValue.toLatLng,
                dateTime: routeOnly ? undefined : `${date}T${time}`,
              })
            }}
            className="w-full h-12 rounded-2xl bg-black text-white text-sm font-extrabold disabled:opacity-40"
          >
            {isSaving ? t('common.saving', { defaultValue: 'Saving...' }) : t('common.save', { defaultValue: 'Save' })}
          </button>
        </div>
      </div>
    </>
  )
}
