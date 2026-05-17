import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import { MapContainer, Marker, Polyline, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import {
  ArrowLeft,
  Car,
  Check,
  CaretRight,
  MapPin,
  MagnifyingGlass,
  Star,
  X,
} from '@phosphor-icons/react'

import type { Driver, LatLng, RideRequest } from '../../../types'
import { reverseGeocode } from '../../../lib/geocode'
import type { RidePointOverride } from '../../../lib/backend'
import LithuanianPlate from '../../../components/LithuanianPlate'

interface AssignDriverModalProps {
  requestIds: string[]
  requests: RideRequest[]
  drivers: Driver[]
  selectedDriverId: string
  isAssigning: boolean
  onSelectDriver: (driverId: string) => void
  onClose: () => void
  onSubmit: (pointOverrides: RidePointOverride[]) => void
}

type ActivePoint = 'from' | 'to'

interface RideDraft {
  requestId: string
  fromAddress: string
  fromLatLng: LatLng
  toAddress: string
  toLatLng: LatLng
  active: ActivePoint
  originalFromAddress: string
  originalFromLatLng: LatLng
  originalToAddress: string
  originalToLatLng: LatLng
}

const iconA = L.divIcon({
  className: '',
  html: '<div class="marker-a">A</div>',
  iconSize: [36, 36],
  iconAnchor: [18, 18],
})
const iconB = L.divIcon({
  className: '',
  html: '<div class="marker-b">B</div>',
  iconSize: [36, 36],
  iconAnchor: [18, 18],
})
const iconADim = L.divIcon({
  className: '',
  html: '<div class="marker-a-sm"></div>',
  iconSize: [16, 16],
  iconAnchor: [8, 8],
})
const iconBDim = L.divIcon({
  className: '',
  html: '<div class="marker-b-sm"></div>',
  iconSize: [16, 16],
  iconAnchor: [8, 8],
})

function isOverridden(draft: RideDraft): boolean {
  return (
    Math.abs(draft.fromLatLng.lat - draft.originalFromLatLng.lat) > 1e-6 ||
    Math.abs(draft.fromLatLng.lng - draft.originalFromLatLng.lng) > 1e-6 ||
    Math.abs(draft.toLatLng.lat - draft.originalToLatLng.lat) > 1e-6 ||
    Math.abs(draft.toLatLng.lng - draft.originalToLatLng.lng) > 1e-6 ||
    draft.fromAddress.trim() !== draft.originalFromAddress.trim() ||
    draft.toAddress.trim() !== draft.originalToAddress.trim()
  )
}

function FitBoundsOnce({ from, to }: { from: LatLng; to: LatLng }) {
  const map = useMap()
  const did = useRef(false)
  useEffect(() => {
    if (did.current) return
    const bounds = L.latLngBounds([from.lat, from.lng], [to.lat, to.lng])
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 })
    did.current = true
  }, [from.lat, from.lng, to.lat, to.lng, map])
  return null
}

function MapClickHandler({ onPick }: { onPick: (latlng: LatLng) => void }) {
  useMapEvents({
    click(event) {
      onPick({ lat: event.latlng.lat, lng: event.latlng.lng })
    },
  })
  return null
}

export default function AssignDriverModal({
  requestIds,
  requests,
  drivers,
  selectedDriverId,
  isAssigning,
  onSelectDriver,
  onClose,
  onSubmit,
}: AssignDriverModalProps) {
  const [step, setStep] = useState<1 | 2>(1)
  const [query, setQuery] = useState('')

  const requestById = useMemo(() => new Map(requests.map((r) => [r.id, r])), [requests])
  const initialDrafts: RideDraft[] = useMemo(() => {
    return requestIds
      .map((id) => requestById.get(id))
      .filter((r): r is RideRequest => Boolean(r))
      .map((r) => ({
        requestId: r.id,
        fromAddress: r.from.address,
        fromLatLng: { lat: r.from.latlng.lat, lng: r.from.latlng.lng },
        toAddress: r.to.address,
        toLatLng: { lat: r.to.latlng.lat, lng: r.to.latlng.lng },
        active: 'from' as ActivePoint,
        originalFromAddress: r.from.address,
        originalFromLatLng: { lat: r.from.latlng.lat, lng: r.from.latlng.lng },
        originalToAddress: r.to.address,
        originalToLatLng: { lat: r.to.latlng.lat, lng: r.to.latlng.lng },
      }))
  }, [requestIds, requestById])
  const [drafts, setDrafts] = useState<RideDraft[]>(initialDrafts)

  useEffect(() => {
    setDrafts(initialDrafts)
  }, [initialDrafts])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const sortedDrivers = useMemo(
    () => [...drivers].sort((a, b) => Number(b.isOnline) - Number(a.isOnline)),
    [drivers],
  )

  const filteredDrivers = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return sortedDrivers
    return sortedDrivers.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        d.carModel.toLowerCase().includes(q) ||
        d.carPlate.toLowerCase().includes(q),
    )
  }, [sortedDrivers, query])

  const updateDraft = (rid: string, patch: Partial<RideDraft>) => {
    setDrafts((prev) => prev.map((d) => (d.requestId === rid ? { ...d, ...patch } : d)))
  }

  const movePoint = async (rid: string, point: ActivePoint, latlng: LatLng) => {
    if (point === 'from') {
      updateDraft(rid, { fromLatLng: latlng })
    } else {
      updateDraft(rid, { toLatLng: latlng })
    }
    let address = ''
    try {
      address = await reverseGeocode(latlng)
    } catch {
      // Silently ignore rate-limit / abort: the user will see the fallback coords in the input.
    }
    if (!address) return
    updateDraft(rid, point === 'from' ? { fromAddress: address } : { toAddress: address })
  }

  const handleConfirm = () => {
    const overrides: RidePointOverride[] = drafts
      .filter((draft) => isOverridden(draft))
      .map((draft) => ({
        requestId: draft.requestId,
        fromPoint: {
          address: draft.fromAddress.trim() || draft.originalFromAddress,
          latlng: draft.fromLatLng,
        },
        toPoint: {
          address: draft.toAddress.trim() || draft.originalToAddress,
          latlng: draft.toLatLng,
        },
      }))
    onSubmit(overrides)
  }

  const selectedDriver = drivers.find((d) => d.id === selectedDriverId)

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[2000] p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-card shadow-card w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            {step === 2 && (
              <button
                onClick={() => setStep(1)}
                className="p-2 hover:bg-surface rounded-xl transition-colors flex-shrink-0"
              >
                <ArrowLeft size={18} />
              </button>
            )}
            <div className="min-w-0">
              <h2 className="text-base font-bold">Назначить водителя</h2>
              <p className="text-xs text-muted mt-0.5 truncate">
                {drafts.length} {drafts.length === 1 ? 'заявка' : drafts.length < 5 ? 'заявки' : 'заявок'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-surface rounded-xl transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Stepper */}
        <div className="px-5 py-3 border-b border-border flex-shrink-0 flex items-center gap-3">
          <StepBadge n={1} label="Точки маршрута" active={step === 1} done={step > 1} />
          <CaretRight size={14} weight="bold" className="text-border flex-shrink-0" />
          <StepBadge n={2} label="Выбор водителя" active={step === 2} done={false} />
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto bg-surface/40">
          {step === 1 && (
            <div className="p-4 space-y-4">
              {drafts.map((draft, idx) => {
                const req = requestById.get(draft.requestId)
                if (!req) return null
                return (
                  <RideDraftCard
                    key={draft.requestId}
                    index={idx}
                    request={req}
                    draft={draft}
                    onSetActive={(active) => updateDraft(draft.requestId, { active })}
                    onMovePoint={(latlng) => movePoint(draft.requestId, draft.active, latlng)}
                    onDragMarker={(point, latlng) => movePoint(draft.requestId, point, latlng)}
                    onChangeAddress={(point, value) =>
                      updateDraft(
                        draft.requestId,
                        point === 'from' ? { fromAddress: value } : { toAddress: value },
                      )
                    }
                    onReset={() =>
                      updateDraft(draft.requestId, {
                        fromAddress: draft.originalFromAddress,
                        fromLatLng: draft.originalFromLatLng,
                        toAddress: draft.originalToAddress,
                        toLatLng: draft.originalToLatLng,
                        active: 'from',
                      })
                    }
                  />
                )
              })}
            </div>
          )}

          {step === 2 && (
            <>
              <div className="px-4 pt-4 pb-3 sticky top-0 bg-surface/95 backdrop-blur z-10">
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl border-[1.5px] border-border bg-white focus-within:border-black transition-colors">
                  <MagnifyingGlass size={14} className="text-muted flex-shrink-0" />
                  <input
                    autoFocus
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Поиск по имени, машине, номеру"
                    className="flex-1 text-sm outline-none bg-transparent placeholder:text-muted"
                  />
                </div>
              </div>
              <div className="px-4 pb-4 space-y-2">
                {filteredDrivers.length === 0 && (
                  <p className="text-xs text-muted text-center py-12">
                    {drivers.length === 0 ? 'Нет водителей' : 'Никто не найден'}
                  </p>
                )}
                {filteredDrivers.map((driver) => {
                  const selected = selectedDriverId === driver.id
                  return (
                    <button
                      key={driver.id}
                      onClick={() => onSelectDriver(driver.id)}
                      className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl border-[1.5px] text-left bg-white transition-all ${
                        selected ? 'border-black' : 'border-border hover:border-muted'
                      }`}
                    >
                      {driver.photoUrl ? (
                        <img
                          src={driver.photoUrl}
                          alt={driver.name}
                          className="w-12 h-12 rounded-xl object-contain bg-surface flex-shrink-0"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-xl bg-surface flex items-center justify-center flex-shrink-0">
                          <Car size={18} />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-bold truncate">{driver.name}</p>
                          <span
                            className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                              driver.isOnline ? 'bg-accent' : 'bg-border'
                            }`}
                            title={driver.isOnline ? 'Онлайн' : 'Офлайн'}
                          />
                        </div>
                        <p className="text-[11px] text-muted truncate">
                          {[driver.carBrand, driver.carModel].filter(Boolean).join(' ')}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <LithuanianPlate value={driver.carPlate} size="sm" />
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-amber-600">
                            <Star size={11} weight="fill" /> {driver.rating.toFixed(1)}
                          </span>
                          <span className="text-border">·</span>
                          <span className="text-[10px] text-muted">{driver.seatsCount ?? '—'} мест</span>
                        </div>
                      </div>
                      {selected && (
                        <div className="w-7 h-7 rounded-full bg-black flex items-center justify-center flex-shrink-0">
                          <Check size={14} className="text-white" />
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-border flex-shrink-0">
          {step === 1 ? (
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 py-2.5 rounded-xl bg-surface text-sm font-semibold transition-all active:scale-[0.97]"
              >
                Отмена
              </button>
              <button
                onClick={() => setStep(2)}
                className="flex-[2] py-2.5 rounded-xl bg-black text-white text-sm font-bold transition-all active:scale-[0.97] inline-flex items-center justify-center gap-2"
              >
                Далее: выбрать водителя
                <CaretRight size={16} weight="bold" />
              </button>
            </div>
          ) : (
            <div className="flex gap-3">
              <button
                onClick={() => setStep(1)}
                className="px-4 py-2.5 rounded-xl bg-surface text-sm font-semibold transition-all active:scale-[0.97] inline-flex items-center gap-1.5"
              >
                <ArrowLeft size={14} />
                Назад
              </button>
              <button
                onClick={handleConfirm}
                disabled={!selectedDriverId || isAssigning}
                className="flex-1 py-2.5 rounded-xl bg-black text-white text-sm font-bold transition-all active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
              >
                {isAssigning
                  ? 'Назначаем…'
                  : selectedDriver
                    ? `Назначить ${selectedDriver.name.split(' ')[0]}`
                    : 'Назначить'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function StepBadge({
  n,
  label,
  active,
  done,
}: {
  n: number
  label: string
  active: boolean
  done: boolean
}) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span
        className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0 transition-colors ${
          done
            ? 'bg-accent text-black'
            : active
              ? 'bg-black text-white'
              : 'bg-surface text-muted'
        }`}
      >
        {done ? <Check size={12} /> : n}
      </span>
      <span
        className={`text-xs font-semibold truncate ${active || done ? 'text-black' : 'text-muted'}`}
      >
        {label}
      </span>
    </div>
  )
}

function RideDraftCard({
  index,
  request,
  draft,
  onSetActive,
  onMovePoint,
  onDragMarker,
  onChangeAddress,
  onReset,
}: {
  index: number
  request: RideRequest
  draft: RideDraft
  onSetActive: (active: ActivePoint) => void
  onMovePoint: (latlng: LatLng) => void
  onDragMarker: (point: ActivePoint, latlng: LatLng) => void
  onChangeAddress: (point: ActivePoint, value: string) => void
  onReset: () => void
}) {
  const edited = isOverridden(draft)
  return (
    <div className="bg-white rounded-card border border-border overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center gap-3">
        <span className="inline-flex items-center justify-center w-6 h-6 rounded-pill bg-surface text-[11px] font-bold flex-shrink-0">
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold truncate">{request.passengerName}</p>
          <p className="text-[11px] text-muted truncate">{request.passengerPhone}</p>
        </div>
        {edited && (
          <button
            onClick={onReset}
            className="text-[10px] font-semibold px-2.5 py-1 rounded-pill bg-surface hover:bg-border transition-colors flex-shrink-0"
          >
            Сбросить
          </button>
        )}
      </div>

      {/* Active point toggle */}
      <div className="px-4 pt-3">
        <div className="grid grid-cols-2 gap-2 p-1 bg-surface rounded-xl">
          <button
            onClick={() => onSetActive('from')}
            className={`py-1.5 rounded-lg text-xs font-bold transition-all inline-flex items-center justify-center gap-1.5 ${
              draft.active === 'from'
                ? 'bg-white shadow-sm text-black'
                : 'text-muted hover:text-black'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-point-a" />
            Откуда (A)
          </button>
          <button
            onClick={() => onSetActive('to')}
            className={`py-1.5 rounded-lg text-xs font-bold transition-all inline-flex items-center justify-center gap-1.5 ${
              draft.active === 'to'
                ? 'bg-white shadow-sm text-black'
                : 'text-muted hover:text-black'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-point-b" />
            Куда (B)
          </button>
        </div>
        <p className="text-[10px] text-muted mt-2 mb-2 px-1">
          Клик по карте перемещает активную точку. Маркер можно перетаскивать.
        </p>
      </div>

      {/* Mini map */}
      <div className="px-4">
        <div className="h-56 rounded-xl overflow-hidden border border-border relative">
          <MapContainer
            center={[draft.fromLatLng.lat, draft.fromLatLng.lng]}
            zoom={13}
            style={{ width: '100%', height: '100%' }}
            zoomControl={true}
            attributionControl={false}
          >
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <FitBoundsOnce from={draft.fromLatLng} to={draft.toLatLng} />
            <MapClickHandler onPick={onMovePoint} />

            <Marker
              position={[draft.fromLatLng.lat, draft.fromLatLng.lng]}
              icon={draft.active === 'from' ? iconA : iconADim}
              draggable
              eventHandlers={{
                dragend(event) {
                  const m = event.target as L.Marker
                  const pos = m.getLatLng()
                  onDragMarker('from', { lat: pos.lat, lng: pos.lng })
                },
                click() {
                  onSetActive('from')
                },
              }}
            />
            <Marker
              position={[draft.toLatLng.lat, draft.toLatLng.lng]}
              icon={draft.active === 'to' ? iconB : iconBDim}
              draggable
              eventHandlers={{
                dragend(event) {
                  const m = event.target as L.Marker
                  const pos = m.getLatLng()
                  onDragMarker('to', { lat: pos.lat, lng: pos.lng })
                },
                click() {
                  onSetActive('to')
                },
              }}
            />
            <Polyline
              positions={[
                [draft.fromLatLng.lat, draft.fromLatLng.lng],
                [draft.toLatLng.lat, draft.toLatLng.lng],
              ]}
              pathOptions={{ color: '#000', weight: 2.5, dashArray: '8, 8', opacity: 0.7 }}
            />
          </MapContainer>

          {edited && (
            <span className="absolute top-2 left-2 z-[500] px-2 py-1 rounded-pill bg-amber-100 text-amber-800 text-[10px] font-bold shadow">
              Изменено
            </span>
          )}
        </div>
      </div>

      {/* Addresses */}
      <div className="p-4 space-y-3">
        <AddressField
          color="point-a"
          label="Откуда"
          active={draft.active === 'from'}
          value={draft.fromAddress}
          latlng={draft.fromLatLng}
          onFocus={() => onSetActive('from')}
          onChange={(v) => onChangeAddress('from', v)}
        />
        <AddressField
          color="point-b"
          label="Куда"
          active={draft.active === 'to'}
          value={draft.toAddress}
          latlng={draft.toLatLng}
          onFocus={() => onSetActive('to')}
          onChange={(v) => onChangeAddress('to', v)}
        />
      </div>
    </div>
  )
}

function AddressField({
  color,
  label,
  active,
  value,
  latlng,
  onFocus,
  onChange,
}: {
  color: 'point-a' | 'point-b'
  label: string
  active: boolean
  value: string
  latlng: LatLng
  onFocus: () => void
  onChange: (value: string) => void
}) {
  return (
    <div
      className={`rounded-xl border-[1.5px] px-3 py-2 transition-colors ${
        active ? 'border-black bg-white' : 'border-border bg-surface/30'
      }`}
    >
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-muted mb-1">
        <span className={`w-1.5 h-1.5 rounded-full bg-${color}`} />
        {label}
      </div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        className="w-full text-sm font-medium outline-none bg-transparent"
      />
      <p className="text-[10px] text-muted font-mono mt-1 flex items-center gap-1">
        <MapPin size={9} />
        {latlng.lat.toFixed(5)}, {latlng.lng.toFixed(5)}
      </p>
    </div>
  )
}
