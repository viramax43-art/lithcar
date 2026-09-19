import { Crosshair, MagnifyingGlass } from '@phosphor-icons/react'
import { MapContainer } from 'react-leaflet'
import { useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import LocalizedTileLayer from '../../components/LocalizedTileLayer'
import RoutePointConfirmButton from '../../components/route-point-picker/RoutePointConfirmButton'
import { RoutePointPinLabel, RoutePointPinMarkers } from '../../components/route-point-picker/RoutePointPinOverlay'
import RoutePointSearchSheet from '../../components/route-point-picker/RoutePointSearchSheet'
import RoutePointZoneBanner from '../../components/route-point-picker/RoutePointZoneBanner'
import RoutePointToast from '../../components/route-point-picker/RoutePointToast'
import { useMapPinAnchor } from '../../hooks/useMapPinAnchor'
import { DEFAULT_PIN_ANCHOR_Y_FRAC } from '../../lib/mapPinAnchor'
import { getDefaultMapCenterTuple, getDefaultMapZoom, resolveMapCenter } from '../../lib/mapRegion'
import { MapFlyToResolvedCenter } from '../../components/MapFlyToResolvedCenter'
import { useMapUserLocationHint } from '../../hooks/useMapUserLocationHint'
import { MapBinder } from '../passenger/new-request/NewRequestMapBinder'
import { useBotAddressPicker } from './useBotAddressPicker'
import { initTelegramWebAppUI } from '../../lib/telegram'

export default function BotAddressPicker() {
  const { t } = useTranslation()
  const mapAreaRef = useRef<HTMLDivElement>(null)
  const bottomSheetRef = useRef<HTMLDivElement>(null)
  const model = useBotAddressPicker()
  const { pinAnchorYFrac } = useMapPinAnchor(mapAreaRef, bottomSheetRef, model.pinAnchorYFracRef, {
    mapRef: model.mapRef,
    isPinLive: model.pickerModel.isPinLive,
    lockAnchorFrac: model.pickerModel.isPinLive,
  })
  const userLocationHint = useMapUserLocationHint(true)
  const mapOperatingCenter = useMemo(
    () => resolveMapCenter(model.activeZones, userLocationHint),
    [model.activeZones, userLocationHint],
  )
  const mapFlyKey = userLocationHint
    ? `geo:${userLocationHint.lat.toFixed(2)},${userLocationHint.lng.toFixed(2)}`
    : model.activeZones.length > 0
      ? `zones:${model.activeZones.length}`
      : 'region-default'

  useEffect(() => {
    initTelegramWebAppUI()
  }, [])

  const title = model.isFrom
    ? t('bot.pickPointA', { defaultValue: 'Выберите точку посадки' })
    : t('bot.pickPointB', { defaultValue: 'Выберите точку назначения' })

  return (
    <div className="min-h-[100dvh] bg-white flex flex-col" style={{ paddingTop: 'var(--app-user-safe-top)' }}>
      <header className="px-4 py-3 border-b border-border/60">
        <p className="text-xs font-semibold text-muted uppercase tracking-wider">{t('bot.pickOnMap', { defaultValue: 'Выбор на карте' })}</p>
        <h1 className="text-lg font-extrabold tracking-tight">{title}</h1>
        {model.errorMessage && <p className="text-xs text-red-600 mt-1">{model.errorMessage}</p>}
      </header>

      <div ref={mapAreaRef} className="relative flex-1 min-h-[50dvh]">
        <MapContainer
          center={getDefaultMapCenterTuple()}
          zoom={getDefaultMapZoom()}
          style={{ width: '100%', height: '100%' }}
          zoomControl={false}
          attributionControl={false}
        >
          <LocalizedTileLayer />
          <MapFlyToResolvedCenter
            center={mapOperatingCenter}
            flyKey={mapFlyKey}
            zoom={getDefaultMapZoom()}
            enabled
          />
          <MapBinder
            registerMap={model.registerMap}
            pinAnchorYFracRef={model.pinAnchorYFracRef}
            enabled={!model.pickerModel.showSearch}
            onPanStart={() => model.setIsPanning(true)}
            onPanEnd={(latlng) => {
              model.setIsPanning(false)
              model.commitPinFromMap(latlng)
            }}
          />
        </MapContainer>

        <RoutePointPinMarkers
          visible={model.pickerModel.isPinLive}
          activeIsFrom={model.isFrom}
          isPanning={model.pickerModel.isPanning}
          pinAnchorYFrac={pinAnchorYFrac}
        />
        <RoutePointPinLabel
          visible={model.pickerModel.isPinLive}
          activeIsFrom={model.isFrom}
          isResolving={model.pickerModel.isResolving}
          pinAddress={model.pickerModel.pinAddress}
          pinAnchorYFrac={pinAnchorYFrac}
        />
        <RoutePointToast message={model.pickerModel.pickupToast} />
        <RoutePointZoneBanner message={model.pickerModel.zoneWarning} />

        <button
          type="button"
          onClick={model.handleLocateMe}
          disabled={model.isLocating}
          className="absolute right-3 z-[500] w-11 h-11 rounded-xl bg-white border border-border shadow-sm flex items-center justify-center disabled:opacity-60"
          style={{ bottom: 'calc(1rem + var(--app-user-safe-bottom, 0px))' }}
          aria-label={t('common.myLocation', { defaultValue: 'My location' })}
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
        className="border-t border-border bg-white px-4 pt-4 space-y-3"
        style={{ paddingBottom: 'calc(1rem + var(--app-user-safe-bottom, 0px))' }}
      >
        <button
          type="button"
          onClick={() => model.pickerModel.setShowSearch(true)}
          className="w-full rounded-xl border border-border px-4 py-3 text-sm font-semibold inline-flex items-center gap-2"
        >
          <MagnifyingGlass size={16} weight="bold" />
          {t('passenger.searchAddress', { defaultValue: 'Search address' })}
        </button>
        <RoutePointConfirmButton model={model.pickerModel} showCaret={false} />
      </div>

      <RoutePointSearchSheet model={model.pickerModel} />
    </div>
  )
}
