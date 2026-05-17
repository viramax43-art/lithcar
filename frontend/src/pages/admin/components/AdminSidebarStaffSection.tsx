import { Key, PencilSimple } from '@phosphor-icons/react'

import InlineConfirm from './InlineConfirm'
import { inputCls, KeyReveal, type CopyState } from './AdminSidebarShared'
import type { AdminSidebarProps } from './AdminSidebar.types'

type StaffSectionProps = Pick<
  AdminSidebarProps,
  | 'activeTab'
  | 'adminSession'
  | 'newManagedKeyName'
  | 'setNewManagedKeyName'
  | 'newManagedKeyRole'
  | 'setNewManagedKeyRole'
  | 'handleCreateManagedKey'
  | 'lastCreatedAdminKey'
  | 'rotatedAdminKeys'
  | 'managedAdminKeys'
  | 'handleRevokeManagedKey'
  | 'handleRotateManagedKey'
> & {
  showStaffForm: boolean
  setEditingStaff: (staff: AdminSidebarProps['managedAdminKeys'][number]) => void
  copyState: CopyState
  copiedToken: string | null
  copyText: (value: string, token: string) => Promise<void>
}

export function AdminSidebarStaffSection({
  activeTab,
  adminSession,
  newManagedKeyName,
  setNewManagedKeyName,
  newManagedKeyRole,
  setNewManagedKeyRole,
  handleCreateManagedKey,
  lastCreatedAdminKey,
  rotatedAdminKeys,
  managedAdminKeys,
  handleRevokeManagedKey,
  handleRotateManagedKey,
  showStaffForm,
  setEditingStaff,
  copyState,
  copiedToken,
  copyText,
}: StaffSectionProps) {
  if (activeTab !== 'staff' || adminSession.role !== 'chief_admin') {
    return null
  }

  return (
    <div className="space-y-3">
      {showStaffForm && (
        <div className="rounded-card border-[1.5px] border-black p-4 space-y-3 bg-surface/50">
          <p className="text-sm font-bold">Новый аккаунт персонала</p>
          <input
            value={newManagedKeyName}
            onChange={(event) => setNewManagedKeyName(event.target.value)}
            placeholder="Имя сотрудника"
            className={inputCls}
          />
          <div>
            <p className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-1.5">Роль</p>
            <div className="grid grid-cols-2 gap-2">
              {(['admin', 'moderator'] as const).map((role) => (
                <button
                  key={role}
                  onClick={() => setNewManagedKeyRole(role)}
                  className={`py-2 rounded-xl text-xs font-semibold transition-colors ${
                    newManagedKeyRole === role ? 'bg-black text-white' : 'bg-surface text-muted'
                  }`}
                >
                  {role === 'admin' ? 'Admin' : 'Moderator'}
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={() => void handleCreateManagedKey()}
            disabled={!newManagedKeyName.trim()}
            className="w-full py-2.5 bg-black text-white rounded-xl text-sm font-bold disabled:opacity-50 transition-all active:scale-[0.97]"
          >
            Создать аккаунт
          </button>
          {lastCreatedAdminKey && (
            <KeyReveal
              title="Ключ доступа (показывается один раз):"
              value={lastCreatedAdminKey}
              onCopy={() => void copyText(lastCreatedAdminKey, 'admin:lastCreated')}
              copied={copiedToken === 'admin:lastCreated' && copyState === 'ok'}
              copyError={copiedToken === 'admin:lastCreated' && copyState === 'error'}
            />
          )}
        </div>
      )}

      {managedAdminKeys.map((item) => (
        <div key={item.id} className="rounded-card border-[1.5px] border-border p-3 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-bold truncate">{item.name}</p>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-pill bg-surface text-muted">
                  {item.role}
                </span>
              </div>
              <p className="text-[10px] text-muted font-mono mt-0.5">{item.keyPrefix}…</p>
            </div>
            {item.role === 'chief_admin' && (
              <span className="text-[10px] px-2 py-1 rounded-pill bg-slate-200 text-slate-700 flex-shrink-0">
                Системный
              </span>
            )}
          </div>

          {item.role !== 'chief_admin' && (
            <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
              <button
                onClick={() => setEditingStaff(item)}
                className="inline-flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-pill bg-surface hover:bg-border transition-colors"
              >
                <PencilSimple size={11} /> Редактировать
              </button>
              <button
                onClick={() => void handleRotateManagedKey(item.id)}
                className="inline-flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-pill bg-surface hover:bg-border transition-colors"
              >
                <Key size={11} /> Новый ключ
              </button>
              <InlineConfirm
                label="Удалить"
                confirmLabel="Точно удалить?"
                onConfirm={() => void handleRevokeManagedKey(item.id)}
                className="ml-auto"
              />
            </div>
          )}

          {rotatedAdminKeys[item.id] && (
            <KeyReveal
              title="Новый ключ:"
              value={rotatedAdminKeys[item.id]}
              onCopy={() => void copyText(rotatedAdminKeys[item.id], `admin:${item.id}`)}
              copied={copiedToken === `admin:${item.id}` && copyState === 'ok'}
              copyError={copiedToken === `admin:${item.id}` && copyState === 'error'}
            />
          )}
        </div>
      ))}

      {managedAdminKeys.length === 0 && !showStaffForm && (
        <p className="text-xs text-muted text-center py-12">Аккаунтов персонала нет</p>
      )}
    </div>
  )
}
