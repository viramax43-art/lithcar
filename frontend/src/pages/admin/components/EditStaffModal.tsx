import { useEffect, useState } from 'react'
import { X } from '@phosphor-icons/react'

import type { AdminKeyInfo } from '../../../lib/backend'

interface EditStaffModalProps {
  staff: AdminKeyInfo
  onClose: () => void
  onSubmit: (payload: { name: string; role: 'admin' | 'moderator' }) => Promise<void>
}

const inputCls =
  'w-full px-3 py-2.5 rounded-xl border-[1.5px] border-border bg-surface text-sm outline-none focus:border-black focus:bg-white transition-colors'

export default function EditStaffModal({ staff, onClose, onSubmit }: EditStaffModalProps) {
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[2000] p-4" onClick={onClose}>
      <div className="bg-white rounded-card shadow-card w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-base font-bold">Редактировать сотрудника</h2>
          <button onClick={onClose} className="p-2 hover:bg-surface rounded-xl transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted">Имя</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} autoFocus />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted">Роль</label>
            <div className="grid grid-cols-2 gap-2">
              {(['admin', 'moderator'] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setRole(r)}
                  className={`py-2.5 rounded-xl text-sm font-semibold transition-all ${
                    role === r ? 'bg-black text-white' : 'bg-surface text-muted'
                  }`}
                >
                  {r === 'admin' ? 'Admin' : 'Moderator'}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-3 px-5 py-4 border-t border-border">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-surface text-sm font-semibold transition-all active:scale-[0.97]">
            Отмена
          </button>
          <button
            onClick={() => void handleSubmit()}
            disabled={submitting || !name.trim()}
            className="flex-1 py-2.5 rounded-xl bg-black text-white text-sm font-bold transition-all active:scale-[0.97] disabled:opacity-50"
          >
            {submitting ? 'Сохраняем…' : 'Сохранить'}
          </button>
        </div>
      </div>
    </div>
  )
}
