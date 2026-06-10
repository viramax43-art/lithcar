import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { AdminKeyInfo } from '../../../lib/backend'
import AdminModalShell from './AdminModalShell'
import { getAdminRoleLabel } from '../utils/adminRolePresentation'
import { isCoarsePointer } from '../../../lib/pointer'

interface EditStaffModalProps {
  staff: AdminKeyInfo
  onClose: () => void
  onSubmit: (payload: { name: string; role: 'admin' | 'moderator' }) => Promise<void>
}

const inputCls =
  'w-full px-3 py-2.5 rounded-xl border-[1.5px] border-border bg-surface text-sm outline-none focus:border-black focus:bg-white transition-colors'

export default function EditStaffModal({ staff, onClose, onSubmit }: EditStaffModalProps) {
  const { t } = useTranslation()
  const [name, setName] = useState(staff.name)
  const [role, setRole] = useState<'admin' | 'moderator'>(
    staff.role === 'moderator' ? 'moderator' : 'admin'
  )
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const handleSubmit = async () => {
    if (!name.trim()) return
    setSubmitting(true)
    try {
      await onSubmit({ name: name.trim(), role })
      onClose()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AdminModalShell onClose={onClose} title={t('admin.editStaff.title')} maxWidthClass="max-w-sm">
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void handleSubmit()
        }}
      >
        <div className="px-5 py-4 space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted">{t('common.name')}</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} autoFocus={!isCoarsePointer} />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted">{t('common.role')}</label>
            <div className="grid grid-cols-2 gap-2">
              {(['admin', 'moderator'] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className={`py-2.5 rounded-xl text-sm font-semibold transition-all ${
                    role === r ? 'bg-black text-white' : 'bg-surface text-muted'
                  }`}
                >
                  {getAdminRoleLabel(r, (key, defaultValue) => t(key, { defaultValue }))}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div
          className="flex gap-3 px-5 py-4 border-t border-border"
          style={{ paddingBottom: 'max(1rem, var(--app-safe-area-bottom-total, 0px))' }}
        >
          <button type="button" onClick={onClose} className="flex-1 min-h-[44px] py-2.5 rounded-xl bg-surface hover:bg-border text-sm font-semibold transition-all active:scale-[0.97]">
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            disabled={submitting || !name.trim()}
            className="flex-1 min-h-[44px] py-2.5 rounded-xl bg-black text-white text-sm font-bold transition-all hover:bg-zinc-800 active:scale-[0.97] disabled:opacity-50"
          >
            {submitting ? t('common.saving') : t('common.save')}
          </button>
        </div>
      </form>
    </AdminModalShell>
  )
}
