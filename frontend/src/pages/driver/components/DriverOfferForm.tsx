import { useMemo, useRef } from 'react'
import { CaretDown, Clock, Crosshair, X } from '@phosphor-icons/react'
import { MapContainer, Marker, Polyline } from 'react-leaflet'
import { useTranslation } from 'react-i18next'
import LocalizedTileLayer from '../../../components/LocalizedTileLayer'
import RoutePointConfirmButton from '../../../components/route-point-picker/RoutePointConfirmButton'
import RoutePointFields from '../../../components/route-point-picker/RoutePointFields'
import { RoutePointPinLabel, RoutePointPinMarkers } from '../../../components/route-point-picker/RoutePointPinOverlay'
import RoutePointSearchSheet from '../../../components/route-point-picker/RoutePointSearchSheet'
import RoutePointZoneBanner from '../../../components/route-point-picker/RoutePointZoneBanner'
import RoutePointToast from '../../../components/route-point-picker/RoutePointToast'
import OfferDayFilter from '../../passenger/components/OfferDayFilter'
import CabinetRoleBanner from '../../../components/CabinetRoleBanner'
import { useOfferDaySelection } from '../../../hooks/useOfferDaySelection'
import { useMapPinAnchor } from '../../../hooks/useMapPinAnchor'
import { DEFAULT_PIN_ANCHOR_Y_FRAC } from '../../../lib/mapPinAnchor'
import { iconA, iconB, MapBinder } from '../../passenger/new-request/NewRequestMapBinder'
import { useEscapeClose } from '../../../lib/useEscapeClose'
import { useDriverOfferFormController } from '../useDriverOfferFormController'

import { useMapUserLocationHint } from '../../../hooks/useMapUserLocationHint'
import { getDefaultMapCenterTuple, getDefaultMapZoom, resolveMapCenter } from '../../../lib/mapRegion'
import { MapFlyToResolvedCenter } from '../../../components/MapFlyToResolvedCenter'

interface DriverOfferFormProps {
  onClose: () => void
  onCreated: () => void
}

export default function DriverOfferForm({ onClose, onCreated }: DriverOfferFormProps) {
  const { t } = useTranslation()
  const pinAnchorYFracRef = useRef(DEFAULT_PIN_ANCHOR_Y_FRAC)
  const mapAreaRef = useRef<HTMLDivElement>(null)
  const bottomSheetRef = useRef<HTMLDivElement>(null)
  const model = useDriverOfferFormController(() => {
    onCreated()
    onClose()
  }, pinAnchorYFracRef)

  const { pinAnchorYFrac, obstructionPx } = useMapPinAnchor(mapAreaRef, bottomSheetRef, pinAnchorYFracRef, {
    mapRef: model.mapRef,
    isPinLive: model.isPinLive,
    lockAnchorFrac: model.isPinLive && Boolean(model.pinLatLng),
  })

  const {
    offerDayOffset,
    setOfferDayOffset,
    offerMapDate,
    disabledOfferDayOffsets,
    rideTimeSlots,
  } = useOfferDaySelection({
    pricing: model.pricing,
    dateTime: model.dateTime,
    setDateTime: model.setDateTime,
  })

  useEscapeClose(true, onClose)

  const userLocationHint = useMapUserLocationHint(!model.fromPoint && !model.toPoint)
  const allowMapAutoFly = !model.fromPoint && !model.toPoint
  const mapOperatingCenter = useMemo(
    () => resolveMapCenter(model.activeZones, userLocationHint),
    [model.activeZones, userLocationHint],
  )
  const mapFlyKey = allowMapAutoFly
    ? userLocationHint
      ? `geo:${userLocationHint.lat.toFixed(2)},${userLocationHint.lng.toFixed(2)}`
      : model.activeZones.length > 0
        ? `zones:${model.activeZones.length}`
        : 'region-default'
    : 'user-picking'

  return (
    <div className="fixed inset-0 z-[210] bg-white flex flex-col">
      <header
        className="flex-shrink-0 bg-white border-b border-border/50 z-20"
        style={{ paddingTop: 'var(--app-safe-area-top-total)' }}
      >
        <CabinetRoleBanner variant="inline" />
        <div className="flex items-center gap-3 px-3 h-14">
          <button
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-surface transition-colors"
          >
            <X size={20} weight="bold" />
          </button>
          <h1 className="text-base font-extrabold tracking-tight flex-1">
            {t('driver.offers.create', { defaultValue: 'New offer' })}
          </h1>
        </div>
      </header>

      <div ref={mapAreaRef} className="relative flex-1 min-h-0">
        <MapContainer center={getDefaultMapCenterTuple()} zoom={getDefaultMapZoom()} style={{ width: '100%', height: '100%' }} zoomControl={false}>
          <LocalizedTileLayer />
          <MapFlyToResolvedCenter
            center={mapOperatingCenter}
            flyKey={mapFlyKey}
            zoom={getDefaultMapZoom()}
            enabled={allowMapAutoFly}
          />
          <MapBinder
            registerMap={(map) => {
              model.mapRef.current = map
            }}
            pinAnchorYFracRef={pinAnchorYFracRef}
            onPanStart={() => model.setIsPanning(true)}
            onPanEnd={(latlng) => {
              model.setIsPanning(false)
              model.commitPinFromMap(latlng)
            }}
          />
          {model.fromPoint && <Marker position={[model.fromPoint.lat, model.fromPoint.lng]} icon={iconA} />}
          {model.toPoint && <Marker position={[model.toPoint.lat, model.toPoint.lng]} icon={iconB} />}
          {model.fromPoint && model.toPoint && (
            <Polyline
              positions={[
                [model.fromPoint.lat, model.fromPoint.lng],
                [model.toPoint.lat, model.toPoint.lng],
              ]}
              pathOptions={{ color: '#000', weight: 3, dashArray: '10, 10', opacity: 0.6 }}
            />
          )}
        </MapContainer>

        <RoutePointPinMarkers
          visible={model.isPinLive}
          activeIsFrom={model.activeIsFrom}
          isPanning={model.isPanning}
          pinAnchorYFrac={pinAnchorYFrac}
        />
        <RoutePointPinLabel
          visible={model.isPinLive}
          activeIsFrom={model.activeIsFrom}
          isResolving={model.isResolving}
          pinAddress={model.pinAddress}
          pinAnchorYFrac={pinAnchorYFrac}
        />
        <RoutePointZoneBanner
          message={model.zoneWarning}
          onDismiss={() => model.setZoneWarning?.(null)}
          topOffset="calc(var(--app-safe-area-top-total) + 48px)"
        />
        <RoutePointToast
          message={model.pickupToast}
          onDismiss={() => model.setPickupToast?.(null)}
          topOffset="var(--app-safe-area-top-total)"
        />

        <button
          onClick={model.handleLocateMe}
          disabled={model.isLocating}
          className="absolute right-3 z-10 w-10 h-10 rounded-pill bg-white shadow-card flex items-center justify-center active:scale-95 transition-transform disabled:opacity-60"
          style={{ bottom: `calc(${obstructionPx}px + 12px + var(--app-safe-area-bottom-total))` }}
        >
          {model.isLocating ? (
            <span className="w-4 h-4 rounded-full border-[2px] border-border border-t-black animate-spin" />
          ) : (
            <Crosshair size={18} weight="bold" />
          )}
        </button>
      </div>

      <div
        ref={bottomSheetRef}
        className={`absolute left-0 right-0 z-20 bg-white border-t border-border rounded-t-3xl shadow-bar transition-transform duration-300 ${
          model.isPanning ? 'translate-y-full' : 'translate-y-0'
        }`}
        style={{ bottom: 0, paddingBottom: 'var(--app-safe-area-bottom-total)' }}
      >
        <div className="w-9 h-1 rounded-full bg-border mx-auto mt-2 mb-1" />
        <div className="px-4 pb-4 space-y-3 max-w-2xl mx-auto">
          {model.errorMessage && (
            <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-xs font-medium text-red-700">
              {model.errorMessage}
            </div>
          )}

          <OfferDayFilter
            value={offerDayOffset}
            disabledOffsets={disabledOfferDayOffsets}
            onChange={setOfferDayOffset}
          />

          <RoutePointFields model={model} />

          <div className="flex items-center gap-1.5 w-full px-2 py-2 rounded-lg bg-surface border-t border-surface pt-2.5">
            <Clock size={14} className="text-muted flex-shrink-0" />
            <select
              value={model.dateTime.split('T')[1] || ''}
              onChange={(e) => {
                model.setDateTime(`${offerMapDate}T${e.target.value}`)
              }}
              className="flex-1 text-xs font-semibold bg-transparent outline-none min-w-0 appearance-none"
            >
              <option value="">{t('passenger.selectTime', { defaultValue: 'Select time' })}</option>
              {rideTimeSlots.map((slot) => (
                <option key={slot} value={slot}>{slot}</option>
              ))}
            </select>
            <CaretDown size={12} weight="bold" className="text-muted flex-shrink-0 pointer-events-none" />
          </div>

          <div className="flex items-center justify-between rounded-xl bg-surface px-3 py-2.5">
            <span className="text-xs font-semibold text-muted">
              {t('driver.offers.seats', { defaultValue: 'Available seats' })}
            </span>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={model.totalSeatsInput}
              onChange={(e) => model.handleSeatsInputChange(e.target.value)}
              onBlur={model.normalizeSeatsInput}
              placeholder="1"
              className="w-16 text-right text-sm font-bold bg-transparent outline-none"
            />
          </div>

          {model.isPinLive ? (
            <div className="space-y-2">
              <RoutePointConfirmButton model={model} showCaret={false} />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => void model.handleSubmit()}
              disabled={!model.canSubmit}
              className={`w-full py-3 rounded-xl font-bold text-sm transition-transform active:scale-[0.97] ${
                model.canSubmit ? 'bg-black text-white' : 'bg-surface text-muted cursor-not-allowed'
              }`}
            >
              {model.submitting
                ? t('common.loading', { defaultValue: 'Loading...' })
                : t('driver.offers.create', { defaultValue: 'Create offer' })}
            </button>
          )}
        </div>
      </div>

      <RoutePointSearchSheet model={model} variant="fullscreen" />
    </div>
  )
}
