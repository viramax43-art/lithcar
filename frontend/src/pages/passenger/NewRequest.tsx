import { Calendar, CaretRight, Clock, Coins, Crosshair, MagnifyingGlass, NavigationArrow, Warning, X } from '@phosphor-icons/react'
import { MapContainer, Marker, Polyline, TileLayer } from 'react-leaflet'
import BottomNav from '../../components/BottomNav'
import { hapticSelection } from '../../lib/telegram'
import { useEnsurePassengerSession } from '../../application/session/useEnsurePassengerSession'
import { FieldRow } from './new-request/FieldRow'
import { iconA, iconB, MapBinder } from './new-request/NewRequestMapBinder'
import { useNewRequestController } from './new-request/useNewRequestController'

const VILNIUS_CENTER: [number, number] = [54.6872, 25.2797]

export default function NewRequest() {
  const model = useNewRequestController()
  const passengerSession = useEnsurePassengerSession()
  const todayDate = new Date().toISOString().split('T')[0]
  const maxDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  return (
    <div className="relative h-[100dvh] overflow-hidden bg-white">
      <div className="absolute inset-0" style={{ zIndex: 0 }}>
        <MapContainer center={VILNIUS_CENTER} zoom={13} style={{ width: '100%', height: '100%' }} zoomControl={false} attributionControl={true}>
          <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <MapBinder
            registerMap={(map) => {
              model.mapRef.current = map
            }}
            onPanStart={() => model.setIsPanning(true)}
            onPanEnd={(latlng) => {
              model.setIsPanning(false)
              void model.commitPin(latlng)
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
      </div>

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

      <header
        className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between gap-2 px-3"
        style={{ paddingTop: 'calc(var(--app-safe-area-top-total) + 12px)' }}
      >
        <div className="flex items-center gap-2 px-3 py-2 rounded-pill bg-white/95 shadow-card backdrop-blur-sm">
          <h1 className="text-base font-extrabold tracking-tight">RIDE</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              hapticSelection()
              model.handleLocateMe()
            }}
            disabled={model.isLocating}
            className="w-10 h-10 rounded-pill bg-white shadow-card flex items-center justify-center active:scale-95 transition-transform disabled:opacity-60"
            title="Моя локация"
          >
            {model.isLocating ? <span className="w-4 h-4 rounded-full border-[2px] border-border border-t-black animate-spin" /> : <Crosshair size={18} weight="bold" />}
          </button>
          <button
            onClick={() => {
              hapticSelection()
              model.setShowSearch(true)
              model.setSearchQuery('')
              model.setSearchResults([])
            }}
            className="w-10 h-10 rounded-pill bg-white shadow-card flex items-center justify-center active:scale-95 transition-transform"
            title="Поиск адреса"
          >
            <MagnifyingGlass size={18} weight="bold" />
          </button>
        </div>
      </header>

      {model.isPinLive && (
        <div className="absolute left-1/2 -translate-x-1/2 z-10 pointer-events-none max-w-[80vw]" style={{ top: 'calc(42% - 88px)' }}>
          {model.pinOutOfZone ? (
            <div className="px-3 py-1.5 rounded-pill bg-red-500 text-white text-[11px] font-bold shadow-card inline-flex items-center gap-1.5 animate-fade-in">
              <Warning size={12} weight="fill" />
              Вне зоны обслуживания
            </div>
          ) : model.isResolving ? (
            <div className="px-3 py-1.5 rounded-pill bg-white text-black text-[11px] font-bold shadow-card inline-flex items-center gap-2 border border-black/10 animate-fade-in">
              <span className={`w-3 h-3 rounded-full border-[2px] border-border animate-spin ${model.activeIsFrom ? 'border-t-point-a' : 'border-t-point-b'}`} />
              <span className="inline-flex items-center gap-0.5">
                Определяем адрес
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
            <div className={`px-3 py-1.5 rounded-pill text-white text-[11px] font-bold shadow-card ${model.activeIsFrom ? 'bg-point-a' : 'bg-point-b'}`}>
              {model.activeIsFrom ? 'Куда подать машину?' : 'Куда поедем?'}
            </div>
          )}
        </div>
      )}

      {model.zoneWarning && (
        <div className="absolute left-3 right-3 z-30 top-16 flex items-center gap-2 px-3 py-2.5 bg-red-50 border border-red-200 rounded-pill shadow-card animate-fade-in">
          <Warning size={16} weight="fill" className="text-red-500 flex-shrink-0" />
          <span className="text-xs font-semibold text-red-700 flex-1 truncate">{model.zoneWarning}</span>
          <button onClick={() => model.setZoneWarning(null)} className="flex-shrink-0">
            <X size={14} className="text-red-400" />
          </button>
        </div>
      )}

      <div className="absolute left-0 right-0 z-20 px-3" style={{ bottom: 'calc(var(--app-safe-area-bottom-total) + 64px + 8px)' }}>
        <div className="bg-white rounded-card shadow-card p-3 space-y-2.5 animate-slide-up">
          <div className="flex flex-col gap-1.5">
            <FieldRow
              dotClass="bg-point-a"
              label="Откуда"
              value={model.fromAddress}
              placeholder="Двигайте карту или нажмите для поиска"
              active={model.activeIsFrom}
              onClick={() => model.setActiveField('from')}
              onClear={model.fromPoint ? () => {
                model.setFromPoint(null)
                model.setFromAddress('')
                model.setActiveField('from')
                model.armPinFromMapCenter()
              } : undefined}
              onSearch={() => {
                model.setActiveField('from')
                model.setShowSearch(true)
                model.setSearchQuery('')
                model.setSearchResults([])
              }}
            />
            <div className="ml-[18px] w-px h-2 bg-border" />
            <FieldRow
              dotClass="bg-point-b"
              label="Куда"
              value={model.toAddress}
              placeholder={model.fromPoint ? 'Двигайте карту или нажмите для поиска' : 'Сначала выберите точку A'}
              active={!model.activeIsFrom}
              onClick={() => model.setActiveField('to')}
              onClear={model.toPoint ? () => {
                model.setToPoint(null)
                model.setToAddress('')
                model.setActiveField('to')
                model.armPinFromMapCenter()
              } : undefined}
              onSearch={() => {
                model.setActiveField('to')
                model.setShowSearch(true)
                model.setSearchQuery('')
                model.setSearchResults([])
              }}
            />
          </div>

          <div className="flex items-center gap-2 pt-1.5 border-t border-surface">
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
                <option value="">Выберите время</option>
                {(() => {
                  const slots: string[] = []
                  const [sh, sm] = (model.pricing.workStartTime || '06:00').split(':').map(Number)
                  const [eh, em] = (model.pricing.workEndTime || '19:00').split(':').map(Number)
                  const interval = model.pricing.slotIntervalMinutes || 30
                  const startMin = sh * 60 + sm
                  const endMin = eh * 60 + em
                  for (let t = startMin; t <= endMin; t += interval) {
                    const hh = String(Math.floor(t / 60)).padStart(2, '0')
                    const mm = String(t % 60).padStart(2, '0')
                    slots.push(`${hh}:${mm}`)
                  }
                  return slots.map((s) => <option key={s} value={s}>{s}</option>)
                })()}
              </select>
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px] text-muted px-0.5">
            <span className="inline-flex items-center gap-1">
              <Coins size={12} weight="fill" className="text-accent-dark" />
              Стоимость поездки
            </span>
            <span className="font-bold text-black text-xs">
              {model.pricing.pointsPerRide} pts · €{((model.pricing.pointsPerRide * model.pricing.pointPriceCents) / 100).toFixed(2)}
            </span>
          </div>

          {model.submitted ? (
            <div className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-accent/10 text-accent-dark font-bold text-sm">
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                <circle cx="10" cy="10" r="10" fill="#22EA36" />
                <path d="M6 10l3 3 5-6" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Заявка отправлена!
            </div>
          ) : !model.fromPoint ? (
            <button
              onClick={model.confirmPoint}
              disabled={!model.pinLatLng || model.pinOutOfZone}
              className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all ${model.pinLatLng && !model.pinOutOfZone ? 'bg-black text-white active:scale-[0.97]' : 'bg-surface text-muted cursor-not-allowed'}`}
            >
              {model.pinOutOfZone ? 'Точка A вне зоны' : 'Подтвердить точку A'}
              <CaretRight size={14} weight="bold" />
            </button>
          ) : !model.toPoint ? (
            <button
              onClick={model.confirmPoint}
              disabled={!model.pinLatLng || model.pinOutOfZone}
              className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all ${model.pinLatLng && !model.pinOutOfZone ? 'bg-black text-white active:scale-[0.97]' : 'bg-surface text-muted cursor-not-allowed'}`}
            >
              {model.pinOutOfZone ? 'Точка B вне зоны' : 'Подтвердить точку B'}
              <CaretRight size={14} weight="bold" />
            </button>
          ) : (
            <button
              onClick={() => void model.handleSubmit()}
              disabled={!model.canSubmit}
              className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all ${model.canSubmit ? 'bg-black text-white active:scale-[0.97]' : 'bg-surface text-muted cursor-not-allowed'}`}
            >
              {model.submitting ? 'Отправка…' : 'Заказать поездку'}
              <CaretRight size={14} weight="bold" />
            </button>
          )}

          {(model.errorMessage || passengerSession.error) && (
            <p className="text-[11px] font-medium text-red-600">{model.errorMessage || passengerSession.error}</p>
          )}
        </div>
      </div>

      {model.showSearch && (
        <div
          className="absolute inset-0 z-[600] bg-white flex flex-col animate-fade-in"
          style={{
            paddingTop: 'var(--app-safe-area-top-total)',
            paddingBottom: 'var(--app-safe-area-bottom-total)',
          }}
        >
          <header className="flex items-center gap-3 px-3 py-3 border-b border-border">
            <button
              onClick={() => {
                model.setShowSearch(false)
                model.setSearchResults([])
              }}
              className="p-2 -ml-1 hover:bg-surface rounded-xl transition-colors"
            >
              <X size={18} />
            </button>
            <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl bg-surface">
              <MagnifyingGlass size={16} className="text-muted flex-shrink-0" />
              <input
                autoFocus
                type="text"
                value={model.searchQuery}
                onChange={(e) => model.handleSearch(e.target.value)}
                placeholder={model.activeIsFrom ? 'Откуда?' : 'Куда?'}
                className="flex-1 text-sm font-medium outline-none bg-transparent placeholder:text-muted min-w-0"
              />
              {model.searchQuery && (
                <button
                  onClick={() => {
                    model.setSearchQuery('')
                    model.setSearchResults([])
                  }}
                >
                  <X size={14} className="text-muted" />
                </button>
              )}
            </div>
          </header>
          <div className="flex-1 overflow-y-auto">
            <button
              onClick={() => {
                model.setShowSearch(false)
                model.setSearchResults([])
              }}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface transition-colors border-b border-border/50"
            >
              <div className="w-9 h-9 rounded-full bg-surface flex items-center justify-center">
                <NavigationArrow size={16} weight="fill" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-black">Выбрать точку на карте</p>
                <p className="text-[11px] text-muted">Двигайте карту, чтобы поставить точку {model.activeIsFrom ? 'A' : 'B'}</p>
              </div>
              <CaretRight size={14} weight="bold" className="text-muted" />
            </button>

            {model.isSearching && <p className="px-4 py-3 text-sm text-muted">Ищем…</p>}
            {model.searchResults.map((r) => (
              <button
                key={r.place_id}
                onClick={() => model.handleSelectSearchResult(r)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface transition-colors border-b border-border/50 last:border-b-0"
              >
                <div className="w-9 h-9 rounded-full bg-surface flex items-center justify-center flex-shrink-0">
                  <MagnifyingGlass size={14} className="text-muted" />
                </div>
                <span className="text-sm text-black flex-1 truncate">{r.display_name}</span>
              </button>
            ))}
            {!model.isSearching && model.searchQuery.length >= 3 && model.searchResults.length === 0 && <p className="px-4 py-3 text-sm text-muted">Ничего не найдено.</p>}
            {model.searchQuery.length < 3 && !model.isSearching && <p className="px-4 py-3 text-sm text-muted">Начните вводить адрес — минимум 3 символа.</p>}
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  )
}
