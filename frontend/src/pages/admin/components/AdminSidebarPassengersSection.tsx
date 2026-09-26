import { CaretDown, CaretRight, MagnifyingGlass, Minus, Plus, User } from '@phosphor-icons/react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { AdminSidebarProps } from './AdminSidebar.types'
import { inputCls } from './AdminSidebarShared'
import { getAdminRoleLabel } from '../utils/adminRolePresentation'

type PassengersSectionProps = Pick<
  AdminSidebarProps,
  | 'activeTab'
  | 'passengers'
  | 'passengersTotal'
  | 'isLoadingMorePassengers'
  | 'onLoadMorePassengers'
  | 'handleAdjustPassengerPoints'
  | 'adminSession'
>

export function AdminSidebarPassengersSection({
  activeTab,
  passengers,
  passengersTotal,
  isLoadingMorePassengers,
  onLoadMorePassengers,
  handleAdjustPassengerPoints,
  adminSession,
}: PassengersSectionProps) {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [pointsDraft, setPointsDraft] = useState('')
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  const filteredPassengers = useMemo(() => {
    const query = search.trim().toLowerCase().replace(/^@/, '')
    if (!query) return passengers
    return passengers.filter((passenger) =>
      passenger.userId.toLowerCase().includes(query)
      || (passenger.username ?? '').toLowerCase().includes(query),
    )
  }, [passengers, search])

  if (activeTab !== 'passengers') return null

  const canAdjust = adminSession.role === 'chief_admin' || adminSession.role === 'admin'
  const amount = Number(pointsDraft)
  const validAmount = Number.isInteger(amount) && amount > 0 && amount <= 100000

  const adjust = async (userId: string, direction: 1 | -1) => {
    if (!validAmount || updatingId) return
    setUpdatingId(userId)
    try {
      const saved = await handleAdjustPassengerPoints(userId, amount * direction)
      if (saved) setPointsDraft('')
    } finally {
      setUpdatingId(null)
    }
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <MagnifyingGlass size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t('admin.passengers.searchPlaceholder')}
          className={`${inputCls} pl-9`}
        />
      </div>

      {filteredPassengers.map((passenger) => {
        const expanded = expandedId === passenger.userId
        const label = passenger.username ? `@${passenger.username}` : passenger.userId
        return (
          <div key={passenger.userId} className="rounded-card border-[1.5px] border-border overflow-hidden bg-white">
            <button
              type="button"
              onClick={() => {
                setExpandedId(expanded ? null : passenger.userId)
                setPointsDraft('')
              }}
              className="w-full p-3.5 text-left"
            >
              <div className="flex items-center gap-3">
                <span className="w-9 h-9 rounded-full bg-surface flex items-center justify-center flex-shrink-0">
                  <User size={18} weight="bold" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <p className="text-sm font-bold truncate">{label}</p>
                    {passenger.role && passenger.role !== 'passenger' && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-pill bg-surface text-muted flex-shrink-0">
                        {getAdminRoleLabel(passenger.role, (key, defaultValue) => t(key, { defaultValue }))}
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-muted truncate">ID: {passenger.userId}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-base font-extrabold">{passenger.pointsBalance}</p>
                  <p className="text-[9px] uppercase font-semibold text-muted">{t('admin.passengers.points')}</p>
                </div>
                {expanded ? <CaretDown size={15} /> : <CaretRight size={15} />}
              </div>
            </button>

            {expanded && (
              <div className="border-t border-border p-3.5 space-y-3 bg-surface/40">
                {canAdjust ? (
                  <>
                    <label className="block text-[10px] font-semibold text-muted uppercase tracking-wider">
                      {t('admin.passengers.amount')}
                    </label>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={100000}
                      step={1}
                      value={pointsDraft}
                      onChange={(event) => setPointsDraft(event.target.value)}
                      placeholder="0"
                      className={inputCls}
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        disabled={!validAmount || updatingId !== null}
                        onClick={() => void adjust(passenger.userId, 1)}
                        className="py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
                      >
                        <Plus size={15} weight="bold" />
                        {t('admin.passengers.add')}
                      </button>
                      <button
                        type="button"
                        disabled={!validAmount || updatingId !== null || amount > passenger.pointsBalance}
                        onClick={() => void adjust(passenger.userId, -1)}
                        className="py-2.5 rounded-xl bg-red-600 text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
                      >
                        <Minus size={15} weight="bold" />
                        {t('admin.passengers.deduct')}
                      </button>
                    </div>
                    {updatingId === passenger.userId && (
                      <p className="text-[11px] text-muted text-center">{t('common.saving')}</p>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-muted">{t('admin.passengers.readOnly')}</p>
                )}
              </div>
            )}
          </div>
        )
      })}

      {filteredPassengers.length === 0 && (
        <p className="text-xs text-muted text-center py-10">{t('admin.passengers.empty')}</p>
      )}
      {!search.trim() && passengers.length < passengersTotal && (
        <button
          type="button"
          disabled={isLoadingMorePassengers}
          onClick={onLoadMorePassengers}
          className="w-full py-2.5 rounded-xl bg-surface text-xs font-bold disabled:opacity-50"
        >
          {isLoadingMorePassengers ? t('common.loading') : t('admin.passengers.loadMore')}
        </button>
      )}
    </div>
  )
}
