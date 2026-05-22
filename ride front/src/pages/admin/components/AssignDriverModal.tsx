import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Car, CaretRight, Check, MagnifyingGlass, Star, X } from '@phosphor-icons/react'

import type { Driver, LatLng, RideRequest } from '../../../types'
import { reverseGeocode } from '../../../lib/geocode'
import type { RidePointOverride } from '../../../lib/backend'
import LithuanianPlate from '../../../components/LithuanianPlate'
import { isOverridden, RideDraftCard, StepBadge, type ActivePoint, type RideDraft } from './AssignDriverModalParts'

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
  const requestIdsKey = useMemo(() => requestIds.join('|'), [requestIds])
  const initializedForKeyRef = useRef<string | null>(null)
  const buildInitialDrafts = useCallback((): RideDraft[] => {
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
  const [drafts, setDrafts] = useState<RideDraft[]>(() => buildInitialDrafts())

  // Keep edited points stable while admin polling refreshes requests list.
  useEffect(() => {
    if (initializedForKeyRef.current === requestIdsKey) return
    setDrafts(buildInitialDrafts())
    setStep(1)
    setQuery('')
    initializedForKeyRef.current = requestIdsKey
  }, [buildInitialDrafts, requestIdsKey])

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
        className="bg-white rounded-card shadow-card w-full max-w-5xl max-h-[96vh] flex flex-col overflow-hidden"
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
