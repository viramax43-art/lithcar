import { useEffect, useMemo, useState } from 'react'
import { Car, Check, MagnifyingGlass } from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'

import type { Driver, RideRequest } from '../../../types'
import RatingBadge from '../../../components/RatingBadge'
import LithuanianPlate from '../../../components/LithuanianPlate'
import AdminModalShell from './AdminModalShell'
import { isCoarsePointer } from '../../../lib/pointer'

interface AssignDriverModalProps {
  requestIds: string[]
  requests: RideRequest[]
  drivers: Driver[]
  selectedDriverId: string
  isAssigning: boolean
  onSelectDriver: (driverId: string) => void
  onClose: () => void
  onSubmit: () => void
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
  const { t } = useTranslation()
  const [query, setQuery] = useState('')

  const requestCount = useMemo(
    () => requestIds.filter((id) => requests.some((request) => request.id === id)).length,
    [requestIds, requests],
  )

  useEffect(() => {
    setQuery('')
  }, [requestIds.join('|')])

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

  const selectedDriver = drivers.find((d) => d.id === selectedDriverId)

  return (
    <AdminModalShell
      onClose={onClose}
      title={t('admin.assignModal.title')}
      subtitle={t('admin.assignModal.requestCount', { count: requestCount })}
      maxWidthClass="max-w-lg"
    >
        <div className="flex-1 overflow-y-auto bg-surface/40 min-h-0">
          <div className="px-4 pt-4 pb-3 sticky top-0 bg-surface/95 backdrop-blur z-10">
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl border-[1.5px] border-border bg-white focus-within:border-black transition-colors">
              <MagnifyingGlass size={14} className="text-muted flex-shrink-0" />
              <input
                autoFocus={!isCoarsePointer}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('admin.assignModal.searchPlaceholder')}
                className="flex-1 text-sm outline-none bg-transparent placeholder:text-muted"
              />
            </div>
          </div>
          <div className="px-4 pb-4 space-y-2">
            {filteredDrivers.length === 0 && (
              <p className="text-xs text-muted text-center py-12">
                {drivers.length === 0
                  ? t('admin.assignModal.noDrivers')
                  : t('admin.assignModal.noMatch')}
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
                        title={driver.isOnline ? t('common.online') : t('common.offline')}
                      />
                    </div>
                    <RatingBadge rating={driver.rating} size="sm" />
                    <p className="text-[11px] text-muted truncate mt-0.5">
                      {[driver.carBrand, driver.carModel].filter(Boolean).join(' ')}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <LithuanianPlate value={driver.carPlate} size="sm" />
                      <span className="text-[10px] text-muted">
                        {driver.seatsCount != null
                          ? t('admin.drivers.seatsCount', { count: driver.seatsCount })
                          : '—'}
                      </span>
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
        </div>

        <div
          className="px-5 py-4 border-t border-border flex-shrink-0 flex gap-3"
          style={{ paddingBottom: 'max(1rem, var(--app-safe-area-bottom-total, 0px))' }}
        >
          <button
            onClick={onClose}
            className="flex-1 min-h-[44px] py-2.5 rounded-xl bg-surface text-sm font-semibold transition-all active:scale-[0.97]"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={onSubmit}
            disabled={!selectedDriverId || isAssigning}
            className="flex-[2] min-h-[44px] py-2.5 rounded-xl bg-black text-white text-sm font-bold transition-all active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isAssigning
              ? t('common.assigning')
              : selectedDriver
                ? t('admin.assignModal.assignNamed', { name: selectedDriver.name.split(' ')[0] })
                : t('admin.requests.assign')}
          </button>
        </div>
    </AdminModalShell>
  )
}
