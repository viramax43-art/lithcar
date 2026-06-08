import { MapPin, X } from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'
import { isOverridden, type RideDraft } from './AssignDriverModalParts'

interface AdminRouteEditBarProps {
  draft: RideDraft
  passengerName: string
  rideNumber: number
  isSaving: boolean
  onDraftChange: (draft: RideDraft) => void
  onCancel: () => void
  onSave: () => void
  onReset: () => void
}

export default function AdminRouteEditBar({
  draft,
  passengerName,
  rideNumber,
  isSaving,
  onDraftChange,
  onCancel,
  onSave,
  onReset,
}: AdminRouteEditBarProps) {
  const { t } = useTranslation()
  const changed = isOverridden(draft)

  return (
    <div
      className="admin-route-edit-bar absolute left-0 right-0 bottom-0 z-[1100] bg-white border-t border-border shadow-[0_-4px_20px_rgba(0,0,0,0.08)]"
      style={{ paddingBottom: 'var(--app-safe-area-bottom-total, 0px)' }}
    >
      <div className="px-4 pt-3 pb-2 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold truncate">{t('admin.editRoute.title', { defaultValue: 'Edit route' })}</p>
          <p className="text-[11px] text-muted truncate">
            {passengerName} · {t('common.rideShort', { number: rideNumber })}
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="p-2 hover:bg-surface rounded-xl transition-colors flex-shrink-0"
          aria-label={t('common.cancel', { defaultValue: 'Cancel' })}
        >
          <X size={16} />
        </button>
      </div>

      <div className="px-4 pb-2">
        <div className="grid grid-cols-2 gap-2 p-1 bg-surface rounded-xl">
          <button
            type="button"
            onClick={() => onDraftChange({ ...draft, active: 'from' })}
            className={`py-1.5 rounded-lg text-xs font-bold transition-all inline-flex items-center justify-center gap-1.5 ${
              draft.active === 'from' ? 'bg-white shadow-sm text-black' : 'text-muted hover:text-black'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-point-a" />
            {t('driver.fromPointA', { defaultValue: 'Point A' })}
          </button>
          <button
            type="button"
            onClick={() => onDraftChange({ ...draft, active: 'to' })}
            className={`py-1.5 rounded-lg text-xs font-bold transition-all inline-flex items-center justify-center gap-1.5 ${
              draft.active === 'to' ? 'bg-white shadow-sm text-black' : 'text-muted hover:text-black'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-point-b" />
            {t('driver.toPointB', { defaultValue: 'Point B' })}
          </button>
        </div>
      </div>

      <div className="admin-route-edit-inputs px-4 pb-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
        <label className="block space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted">
            {t('passenger.fromLabel', { defaultValue: 'Pickup' })}
          </span>
          <input
            type="text"
            value={draft.fromAddress}
            onFocus={() => onDraftChange({ ...draft, active: 'from' })}
            onChange={(e) => onDraftChange({ ...draft, fromAddress: e.target.value })}
            className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-black/10"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted">
            {t('passenger.toLabel', { defaultValue: 'Destination' })}
          </span>
          <input
            type="text"
            value={draft.toAddress}
            onFocus={() => onDraftChange({ ...draft, active: 'to' })}
            onChange={(e) => onDraftChange({ ...draft, toAddress: e.target.value })}
            className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-black/10"
          />
        </label>
      </div>

      {changed && (
        <p className="px-4 pb-2 text-[10px] text-amber-700 font-semibold flex items-center gap-1">
          <MapPin size={11} />
          {t('common.changed', { defaultValue: 'Changed' })}
        </p>
      )}

      <div className="px-4 pb-4 flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 h-11 rounded-xl border border-border text-sm font-bold"
        >
          {t('common.cancel', { defaultValue: 'Cancel' })}
        </button>
        {changed && (
          <button
            type="button"
            onClick={onReset}
            disabled={isSaving}
            className="h-11 px-4 rounded-xl border border-border bg-surface text-sm font-bold disabled:opacity-50"
          >
            {t('common.reset', { defaultValue: 'Reset' })}
          </button>
        )}
        <button
          type="button"
          disabled={isSaving || !changed}
          onClick={onSave}
          className="flex-1 h-11 rounded-xl bg-black text-white text-sm font-bold disabled:opacity-50"
        >
          {isSaving ? t('common.saving', { defaultValue: 'Saving...' }) : t('common.save', { defaultValue: 'Save' })}
        </button>
      </div>
    </div>
  )
}
