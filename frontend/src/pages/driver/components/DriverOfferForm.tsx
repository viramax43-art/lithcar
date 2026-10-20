import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { Crosshair, UsersThree, X } from '@phosphor-icons/react'
import { MapContainer, Marker, Polyline } from 'react-leaflet'
import { useTranslation } from 'react-i18next'
import LocalizedTileLayer from '../../../components/LocalizedTileLayer'
import NotificationBell from '../../../components/notifications/NotificationBell'
import RoutePointConfirmButton from '../../../components/route-point-picker/RoutePointConfirmButton'
import RoutePointFields from '../../../components/route-point-picker/RoutePointFields'
import { RoutePointPinLabel, RoutePointPinMarkers } from '../../../components/route-point-picker/RoutePointPinOverlay'
import RoutePointSearchSheet from '../../../components/route-point-picker/RoutePointSearchSheet'
import RoutePointZoneBanner from '../../../components/route-point-picker/RoutePointZoneBanner'
import RoutePointToast from '../../../components/route-point-picker/RoutePointToast'
import OfferDayFilter from '../../passenger/components/OfferDayFilter'
import CabinetRoleBanner from '../../../components/CabinetRoleBanner'
import RideTimeField from '../../../components/RideTimeField'
import { useOfferDaySelection } from '../../../hooks/useOfferDaySelection'
import { useMapPinAnchor } from '../../../hooks/useMapPinAnchor'
import { DEFAULT_PIN_ANCHOR_Y_FRAC } from '../../../lib/mapPinAnchor'
import { iconA, iconB, MapBinder } from '../../passenger/new-request/NewRequestMapBinder'
import { useEscapeClose } from '../../../lib/useEscapeClose'
import { hapticSelection } from '../../../lib/telegram'
import { useDriverOfferFormController } from '../useDriverOfferFormController'
import { getDefaultMapCenterTuple, getDefaultMapZoom, resolveMapCenter } from '../../../lib/mapRegion'
import { MapFlyToResolvedCenter } from '../../../components/MapFlyToResolvedCenter'
import type { LatLng } from '../../../types'

interface DriverOfferFormProps {
  onClose: () => void
  onCreated: () => void
  /** Driver's current position; the map opens here instead of the zones centroid. */
  initialLocation?: LatLng | null
}

const SHEET_MIN_HEIGHT_PX = 160
const SHEET_RESIZE_STEP_PX = 24
const SHEET_VIEWPORT_RATIO = 0.88
/** Keep the app header visible while the sheet is expanded. */
const SHEET_TOP_GAP_PX = 104

function getSheetViewportHeight() {
  return window.visualViewport?.height ?? window.innerHeight
}

function getSheetMaxHeight() {
  const viewportHeight = getSheetViewportHeight()
  return Math.max(
    SHEET_MIN_HEIGHT_PX,
    Math.min(viewportHeight * SHEET_VIEWPORT_RATIO, viewportHeight - SHEET_TOP_GAP_PX),
  )
}

function clampSheetHeight(height: number) {
  return Math.min(getSheetMaxHeight(), Math.max(SHEET_MIN_HEIGHT_PX, height))
}


export default function DriverOfferForm({ onClose, onCreated, initialLocation }: DriverOfferFormProps) {
  const { t } = useTranslation()
  const pinAnchorYFracRef = useRef(DEFAULT_PIN_ANCHOR_Y_FRAC)
  const mapAreaRef = useRef<HTMLDivElement>(null)
  const bottomSheetRef = useRef<HTMLDivElement>(null)
  const model = useDriverOfferFormController(() => {
    onCreated()
    onClose()
  }, pinAnchorYFracRef)

  // Freeze the driver's position at the moment the form opens. The cabinet keeps
  // receiving GPS updates while the sheet is open; letting them re-centre the map
  // would yank the pin out from under the driver.
  const [mapStartLocation, setMapStartLocation] = useState<LatLng | null>(
    initialLocation ?? null,
  )
  useEffect(() => {
    if (mapStartLocation || !initialLocation) return
    setMapStartLocation(initialLocation)
  }, [initialLocation, mapStartLocation])

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

  // The driver already sees their own position on the cabinet map. Opening the
  // offer form must not jump to the zones centroid: current GPS wins, zones are
  // only a fallback while the driver position is unknown.
  const allowMapAutoFly = !model.fromPoint && !model.toPoint
  const mapOperatingCenter = useMemo(
    () => resolveMapCenter(model.activeZones, mapStartLocation),
    [model.activeZones, mapStartLocation],
  )
  const mapFlyKey = allowMapAutoFly
    ? mapStartLocation
      ? `driver:${mapStartLocation.lat.toFixed(5)},${mapStartLocation.lng.toFixed(5)}`
      : model.activeZones.length > 0
        ? `zones:${model.activeZones.length}`
        : 'region-default'
    : 'user-picking'
  const mapInitialCenter: [number, number] = mapStartLocation
    ? [mapStartLocation.lat, mapStartLocation.lng]
    : getDefaultMapCenterTuple()

  const pinEmptyHint = model.activeIsFrom
    ? t('driver.pinHintPickup', { defaultValue: 'Откуда выезжаете?' })
    : t('driver.pinHintDestination', { defaultValue: 'Куда едете?' })

  const [sheetHeight, setSheetHeight] = useState<number | null>(null)
  const [isResizingSheet, setIsResizingSheet] = useState(false)
  const sheetDragRef = useRef<{ pointerId: number; startY: number; startHeight: number } | null>(null)

  const stopSheetResize = useCallback((target: HTMLElement, pointerId: number) => {
    const drag = sheetDragRef.current
    if (!drag || drag.pointerId !== pointerId) return
    if (target.hasPointerCapture(pointerId)) target.releasePointerCapture(pointerId)
    sheetDragRef.current = null
    setIsResizingSheet(false)
  }, [])

  const handleSheetResizeStart = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return
      const sheet = bottomSheetRef.current
      if (!sheet) return

      event.preventDefault()
      event.stopPropagation()
      const startHeight = sheet.getBoundingClientRect().height
      sheetDragRef.current = {
        pointerId: event.pointerId,
        startY: event.clientY,
        startHeight,
      }
      // Freeze the current natural height so the next move can grow it.
      setSheetHeight(Math.round(startHeight))
      setIsResizingSheet(true)
      event.currentTarget.setPointerCapture(event.pointerId)
    },
    [],
  )

  const handleSheetResizeMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = sheetDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return

    event.preventDefault()
    setSheetHeight(Math.round(clampSheetHeight(drag.startHeight + (drag.startY - event.clientY))))
  }, [])

  const handleSheetResizeEnd = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      stopSheetResize(event.currentTarget, event.pointerId)
    },
    [stopSheetResize],
  )

  const handleSheetResizeKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      const currentHeight =
        sheetHeight ?? bottomSheetRef.current?.getBoundingClientRect().height ?? SHEET_MIN_HEIGHT_PX
      let nextHeight: number

      switch (event.key) {
        case 'ArrowUp':
          nextHeight = currentHeight + SHEET_RESIZE_STEP_PX
          break
        case 'ArrowDown':
          nextHeight = currentHeight - SHEET_RESIZE_STEP_PX
          break
        case 'PageUp':
          nextHeight = currentHeight + SHEET_RESIZE_STEP_PX * 4
          break
        case 'PageDown':
          nextHeight = currentHeight - SHEET_RESIZE_STEP_PX * 4
          break
        case 'Home':
          nextHeight = SHEET_MIN_HEIGHT_PX
          break
        case 'End':
          nextHeight = getSheetMaxHeight()
          break
        default:
          return
      }

      event.preventDefault()
      setSheetHeight(Math.round(clampSheetHeight(nextHeight)))
    },
    [sheetHeight],
  )

  useEffect(() => {
    const keepSheetInBounds = () => {
      setSheetHeight((current) => (current === null ? null : Math.round(clampSheetHeight(current))))
    }
    window.addEventListener('resize', keepSheetInBounds)
    window.visualViewport?.addEventListener('resize', keepSheetInBounds)
    return () => {
      window.removeEventListener('resize', keepSheetInBounds)
      window.visualViewport?.removeEventListener('resize', keepSheetInBounds)
    }
  }, [])

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
            {t('driver.setDirectionCta', { defaultValue: 'Поставить направление' })}
          </h1>
          {/* Driver pool — own instruction/info notifications, separate from passenger */}
          <NotificationBell pool="driver" />
        </div>
      </header>

      <div ref={mapAreaRef} className="relative flex-1 min-h-0">
        <MapContainer center={mapInitialCenter} zoom={getDefaultMapZoom()} style={{ width: '100%', height: '100%' }} zoomControl={false}>
          <LocalizedTileLayer />
          <MapFlyToResolvedCenter
            center={mapOperatingCenter}
            flyKey={mapFlyKey}
            zoom={getDefaultMapZoom()}
            enabled={allowMapAutoFly}
            pinAnchorYFracRef={pinAnchorYFracRef}
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
          emptyHint={pinEmptyHint}
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

        {/* Same as passenger: location only when driver taps the crosshair */}
        <button
          type="button"
          onClick={() => {
            hapticSelection()
            model.handleLocateMe()
          }}
          disabled={model.isLocating}
          className="absolute right-3 z-10 w-10 h-10 rounded-pill bg-white shadow-card flex items-center justify-center active:scale-95 transition-transform disabled:opacity-60"
          style={{ bottom: `calc(${obstructionPx}px + 12px + var(--app-safe-area-bottom-total))` }}
          title={t('common.myLocation', { defaultValue: 'Моё местоположение' })}
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
        className={`absolute left-0 right-0 z-20 flex flex-col overflow-hidden bg-white border-t border-border rounded-t-3xl shadow-bar transition-transform duration-300 ${
          model.isPanning ? 'translate-y-full' : 'translate-y-0'
        }`}
        style={{
          bottom: 0,
          paddingBottom: 'var(--app-safe-area-bottom-total)',
          ...(sheetHeight === null ? {} : { height: `${sheetHeight}px` }),
        }}
      >
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label={t('driver.offerSheetResize', { defaultValue: 'Потяните, чтобы изменить высоту панели' })}
          aria-valuemin={SHEET_MIN_HEIGHT_PX}
          aria-valuemax={Math.round(getSheetMaxHeight())}
          aria-valuenow={sheetHeight === null ? undefined : sheetHeight}
          tabIndex={0}
          className="group mx-auto mt-1 flex h-6 w-16 flex-shrink-0 touch-none select-none cursor-row-resize items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-black/20"
          onPointerDown={handleSheetResizeStart}
          onPointerMove={handleSheetResizeMove}
          onPointerUp={handleSheetResizeEnd}
          onPointerCancel={handleSheetResizeEnd}
          onLostPointerCapture={handleSheetResizeEnd}
          onKeyDown={handleSheetResizeKeyDown}
        >
          <div
            className={`w-9 h-1 rounded-full transition-colors ${
              isResizingSheet ? 'bg-black' : 'bg-border group-hover:bg-muted'
            }`}
          />
        </div>
        <div
          className={`w-full px-4 pb-4 space-y-3 max-w-2xl mx-auto overscroll-contain ${
            sheetHeight === null
              ? 'max-h-[70dvh] overflow-y-auto'
              : 'flex-1 min-h-0 overflow-y-auto'
          }`}
        >
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
          <RideTimeField
            value={model.dateTime.split('T')[1] || ''}
            slots={rideTimeSlots}
            onChange={(time) => {
              model.setDateTime(time ? `${offerMapDate}T${time}` : `${offerMapDate}T`)
            }}
          />

          <RoutePointFields model={model} audience="driver" />

          <div className="flex items-center justify-between rounded-xl bg-surface px-3 py-2.5">
            <span className="text-xs font-semibold text-muted inline-flex items-center gap-1.5">
              <UsersThree size={14} weight="bold" />
              {t('driver.offers.seats', { defaultValue: 'Свободные места' })}
            </span>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={model.totalSeatsInput}
              onChange={(e) => model.handleSeatsInputChange(e.target.value)}
              onBlur={model.normalizeSeatsInput}
              placeholder={t('driver.offers.seatsPlaceholder', { defaultValue: 'Сколько' })}
              className="w-20 text-right text-sm font-bold bg-transparent outline-none"
            />
          </div>

          {model.isPinLive ? (
            <div className="space-y-2">
              <RoutePointConfirmButton model={model} showCaret={false} audience="driver" />
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
                : t('driver.offers.publishDirection', { defaultValue: 'Опубликовать направление' })}
            </button>
          )}
        </div>
      </div>

      <RoutePointSearchSheet model={model} variant="fullscreen" />
    </div>
  )
}
