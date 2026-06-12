import { Calendar, CaretDown, Clock, Crosshair, MagnifyingGlass, Warning, X } from '@phosphor-icons/react'
import { MapContainer, Marker, Polyline, ZoomControl } from 'react-leaflet'
import { useTranslation } from 'react-i18next'
import LocalizedTileLayer from '../../../components/LocalizedTileLayer'
import { FieldRow } from '../../passenger/new-request/FieldRow'
import { iconA, iconB, MapBinder } from '../../passenger/new-request/NewRequestMapBinder'
import { addAppLocalDays, toAppLocalDateInput } from '../../../i18n/dateTime'
import { buildRideTimeSlots } from '../../../lib/rideTimeSlots'
import { isCoarsePointer } from '../../../lib/pointer'
import { useEscapeClose } from '../../../lib/useEscapeClose'
import { useDriverOfferFormController } from '../useDriverOfferFormController'

const VILNIUS_CENTER: [number, number] = [54.6872, 25.2797]

interface DriverOfferFormProps {
  onClose: () => void
  onCreated: () => void
}

export default function DriverOfferForm({ onClose, onCreated }: DriverOfferFormProps) {
  const { t } = useTranslation()
  const model = useDriverOfferFormController(() => {
    onCreated()
    onClose()
  })
  const now = new Date()
  const todayDate = toAppLocalDateInput(now)
  const maxDate = addAppLocalDays(now, 2)

  useEscapeClose(true, onClose)

  const pointASetupHint = t('passenger.pointASetupHint', { defaultValue: 'Enter, adjust and confirm the address' })
  const pointBSetupHint = t('passenger.pointBSetupHint', { defaultValue: 'Enter, adjust and confirm the destination' })
  const activeSetupHint = model.activeIsFrom ? pointASetupHint : pointBSetupHint

  return (
    <div className="fixed inset-0 z-[210] bg-white flex flex-col">
      <header
        className="flex-shrink-0 bg-white border-b border-border/50 z-20"
        style={{ paddingTop: 'var(--app-safe-area-top-total)' }}
      >
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

      <div className="relative flex-1 min-h-0">
        <MapContainer center={VILNIUS_CENTER} zoom={13} style={{ width: '100%', height: '100%' }} zoomControl={false}>
          <LocalizedTileLayer />
          {!isCoarsePointer && <ZoomControl position="bottomright" />}
          <MapBinder
            registerMap={(map) => {
              model.mapRef.current = map
            }}
            onPanStart={() => model.setIsPanning(true)}
            onPanEnd={(latlng) => {
              model.setIsPanning(false)
              model.commitPin(latlng)
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

        {model.isPinLive && (
          <>
            <div className={`center-pin ${model.activeIsFrom ? 'pin-a' : 'pin-b'} ${model.isPanning ? 'is-panning' : ''}`}>
              <div className="pin-body">
                <span>{model.activeIsFrom ? 'A' : 'B'}</span>
              </div>
            </div>
            <div className="center-pin-shadow" style={model.isPanning ? { width: 22, opacity: 0.45 } : undefined} />
          </>
        )}

        {model.isPinLive && (
          <div
            className="absolute left-1/2 -translate-x-1/2 z-10 pointer-events-none max-w-[80vw]"
            style={{ top: 'calc(42% - 88px)' }}
          >
            {model.pinOutOfZone ? (
              <div className="px-3 py-1.5 rounded-pill bg-red-500 text-white text-[11px] font-bold shadow-card inline-flex items-center gap-1.5 animate-fade-in">
                <Warning size={12} weight="fill" />
                {t('passenger.outOfServiceZone', { defaultValue: 'Out of service zone' })}
              </div>
            ) : model.isResolving ? (
              <div className="px-3 py-1.5 rounded-pill bg-white text-black text-[11px] font-bold shadow-card inline-flex items-center gap-2 border border-black/10 animate-fade-in">
                <span className={`w-3 h-3 rounded-full border-[2px] border-border animate-spin ${model.activeIsFrom ? 'border-t-point-a' : 'border-t-point-b'}`} />
                <span className="inline-flex items-center gap-0.5">
                  {t('passenger.resolvingAddress', { defaultValue: 'Resolving address' })}
                  <span className="dot-pulse" style={{ animationDelay: '0ms' }}>.</span>
                  <span className="dot-pulse" style={{ animationDelay: '150ms' }}>.</span>
                  <span className="dot-pulse" style={{ animationDelay: '300ms' }}>.</span>
                </span>
              </div>
            ) : model.pinAddress ? (
              <div className={`px-3 py-1.5 rounded-pill text-white text-[11px] font-bold shadow-card truncate max-w-[80vw] animate-fade-in ${model.activeIsFrom ? 'bg-point-a' : 'bg-point-b'}`}>
                {model.pinAddress}
              </div>
            ) : (
              <div className={`px-3 py-1.5 rounded-pill text-white text-[11px] font-bold shadow-card max-w-[80vw] text-center leading-snug ${model.activeIsFrom ? 'bg-point-a' : 'bg-point-b'}`}>
                {activeSetupHint}
              </div>
            )}
          </div>
        )}

        {model.zoneWarning && (
          <div
            className="absolute left-3 right-3 z-30 flex items-center gap-2 px-3 py-2.5 bg-red-50 border border-red-200 rounded-pill shadow-card animate-fade-in"
            style={{ top: 'calc(var(--app-safe-area-top-total) + 48px)' }}
          >
            <Warning size={16} weight="fill" className="text-red-500 flex-shrink-0" />
            <span className="text-xs font-semibold text-red-700 flex-1 truncate">{model.zoneWarning}</span>
          </div>
        )}

        <button
          onClick={model.handleLocateMe}
          disabled={model.isLocating}
          className="absolute right-3 z-10 w-10 h-10 rounded-pill bg-white shadow-card flex items-center justify-center active:scale-95 transition-transform disabled:opacity-60"
          style={{ bottom: 'calc(280px + var(--app-safe-area-bottom-total))' }}
        >
          {model.isLocating ? (
            <span className="w-4 h-4 rounded-full border-[2px] border-border border-t-black animate-spin" />
          ) : (
            <Crosshair size={18} weight="bold" />
          )}
        </button>
      </div>

      <div
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
          <FieldRow
            dotClass="bg-point-a"
            label={t('passenger.fromLabel', { defaultValue: 'From' })}
            value={model.fromAddress}
            placeholder={t('passenger.pickPointAFirst', { defaultValue: 'Pick point A' })}
            active={model.activeField === 'from'}
            onClick={() => model.setActiveField('from')}
            onSearch={() => {
              model.setActiveField('from')
              model.setShowSearch(true)
            }}
          />
          <FieldRow
            dotClass="bg-point-b"
            label={t('passenger.toLabel', { defaultValue: 'To' })}
            value={model.toAddress}
            placeholder={t('passenger.pickPointBFirst', { defaultValue: 'Pick point B' })}
            active={model.activeField === 'to'}
            onClick={() => model.setActiveField('to')}
            onSearch={() => {
              model.setActiveField('to')
              model.setShowSearch(true)
            }}
          />

          <div className="flex items-center gap-2 border-t border-surface pt-2.5">
            <div className="flex items-center gap-1.5 flex-1 px-2 py-1.5 rounded-lg bg-surface">
              <Calendar size={14} className="text-muted flex-shrink-0" />
              <input
                type="date"
                value={model.dateTime.split('T')[0] || ''}
                onChange={(e) => {
                  const time = model.dateTime.split('T')[1] || '12:00'
                  model.setDateTime(`${e.target.value}T${time}`)
                }}
                className="flex-1 text-xs font-semibold bg-transparent outline-none min-w-0"
                min={todayDate}
                max={maxDate}
              />
            </div>
            <div className="flex items-center gap-1.5 flex-1 px-2 py-1.5 rounded-lg bg-surface">
              <Clock size={14} className="text-muted flex-shrink-0" />
              <select
                value={model.dateTime.split('T')[1] || ''}
                onChange={(e) => {
                  const date = model.dateTime.split('T')[0] || todayDate
                  model.setDateTime(`${date}T${e.target.value}`)
                }}
                className="flex-1 text-xs font-semibold bg-transparent outline-none min-w-0 appearance-none"
              >
                <option value="">{t('passenger.selectTime', { defaultValue: 'Select time' })}</option>
                {buildRideTimeSlots({
                  workStartTime: model.pricing.workStartTime || '06:00',
                  workEndTime: model.pricing.workEndTime || '19:00',
                  slotIntervalMinutes: model.pricing.slotIntervalMinutes || 30,
                  selectedDate: model.dateTime.split('T')[0] || todayDate,
                }).map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <CaretDown size={12} weight="bold" className="text-muted flex-shrink-0 pointer-events-none" />
            </div>
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
            <button
              onClick={model.confirmPoint}
              disabled={!model.pinReadyForConfirm}
              className={`w-full py-3 rounded-xl font-bold text-sm transition-transform active:scale-[0.97] ${
                model.pinReadyForConfirm ? 'bg-black text-white' : 'bg-surface text-muted cursor-not-allowed'
              }`}
            >
              {model.pinOutOfZone
                ? model.activeIsFrom
                  ? t('passenger.pointAOutOfZone', { defaultValue: 'Point A is outside service area' })
                  : t('passenger.pointBOutOfZone', { defaultValue: 'Point B is outside service area' })
                : model.activeIsFrom
                  ? t('passenger.confirmPointA', { defaultValue: 'Confirm point A' })
                  : t('passenger.confirmPointB', { defaultValue: 'Confirm point B' })}
            </button>
          ) : (
            <button
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

      {model.showSearch && (
        <div className="absolute inset-0 z-[220] bg-white flex flex-col" style={{ paddingTop: 'var(--app-safe-area-top-total)' }}>
          <div className="flex items-center gap-2 px-3 h-14 border-b border-border">
            <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl bg-surface">
              <MagnifyingGlass size={16} className="text-muted" />
              <input
                autoFocus
                value={model.searchQuery}
                onChange={(e) => model.handleSearch(e.target.value)}
                placeholder={t('passenger.searchAddress', { defaultValue: 'Search address' })}
                className="flex-1 bg-transparent text-sm outline-none"
              />
            </div>
            <button onClick={() => model.setShowSearch(false)} className="w-9 h-9 rounded-xl bg-surface flex items-center justify-center">
              <X size={16} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {model.isSearching && <p className="px-4 py-3 text-xs text-muted">{t('common.loading', { defaultValue: 'Loading...' })}</p>}
            {model.searchResults.map((result) => (
              <button
                key={result.place_id}
                onClick={() => model.handleSelectSearchResult(result)}
                className="w-full text-left px-4 py-3 border-b border-surface hover:bg-surface/60 text-sm"
              >
                {result.display_name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
