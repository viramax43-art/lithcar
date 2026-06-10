import { Key, PencilSimple } from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'

import InlineConfirm from './InlineConfirm'
import { inputCls, KeyReveal, type CopyState } from './AdminSidebarShared'
import type { AdminSidebarProps } from './AdminSidebar.types'
import { getAdminDisplayName, getAdminRoleLabel } from '../utils/adminRolePresentation'

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
  const { t } = useTranslation()

  if (activeTab !== 'staff' || adminSession.role !== 'chief_admin') {
    return null
  }

  return (
    <div className="space-y-3">
      {showStaffForm && (
        <div className="rounded-card border-[1.5px] border-black p-4 space-y-3 bg-surface/50">
          <p className="text-sm font-bold">{t('admin.staff.newAccount')}</p>
          <input
            value={newManagedKeyName}
            onChange={(event) => setNewManagedKeyName(event.target.value)}
            placeholder={t('admin.staff.staffNamePlaceholder')}
            className={inputCls}
          />
          <div>
            <p className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-1.5">
              {t('common.role')}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {(['admin', 'moderator'] as const).map((role) => (
                <button
                  key={role}
                  onClick={() => setNewManagedKeyRole(role)}
                  className={`py-2 rounded-xl text-xs font-semibold transition-colors ${
                    newManagedKeyRole === role ? 'bg-black text-white' : 'bg-surface text-muted'
                  }`}
                >
                  {getAdminRoleLabel(role, (key, defaultValue) => t(key, { defaultValue }))}
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={() => void handleCreateManagedKey()}
            disabled={!newManagedKeyName.trim()}
            className="w-full py-2.5 bg-black text-white rounded-xl text-sm font-bold disabled:opacity-50 transition-all active:scale-[0.97]"
          >
            {t('admin.staff.createAccount')}
          </button>
          {lastCreatedAdminKey && (
            <KeyReveal
              title={t('admin.staff.accessKeyOnce')}
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
                <p className="text-sm font-bold truncate">
                  {getAdminDisplayName(item.name, item.role, (key, defaultValue) =>
                    t(key, { defaultValue }),
                  )}
                </p>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-pill bg-surface text-muted">
                  {getAdminRoleLabel(item.role, (key, defaultValue) => t(key, { defaultValue }))}
                </span>
              </div>
              <p className="text-[10px] text-muted font-mono mt-0.5">{item.keyPrefix}…</p>
            </div>
            {item.role === 'chief_admin' && (
              <span className="text-[10px] px-2 py-1 rounded-pill bg-slate-200 text-slate-700 flex-shrink-0">
                {t('common.system')}
              </span>
            )}
          </div>

          {item.role !== 'chief_admin' && (
            <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
              <button
                onClick={() => setEditingStaff(item)}
                className="min-h-[36px] inline-flex items-center gap-1 text-[10px] font-semibold px-3 py-2 rounded-pill bg-surface hover:bg-border transition-colors"
              >
                <PencilSimple size={11} /> {t('common.edit')}
              </button>
              <button
                onClick={() => void handleRotateManagedKey(item.id)}
                className="min-h-[36px] inline-flex items-center gap-1 text-[10px] font-semibold px-3 py-2 rounded-pill bg-surface hover:bg-border transition-colors"
              >
                <Key size={11} /> {t('common.newKey')}
              </button>
              <InlineConfirm
                label={t('common.delete')}
                confirmLabel={t('common.confirmDelete')}
                onConfirm={() => void handleRevokeManagedKey(item.id)}
                className="ml-auto"
              />
            </div>
          )}

          {rotatedAdminKeys[item.id] && (
            <KeyReveal
              title={t('admin.staff.newKeyTitle')}
              value={rotatedAdminKeys[item.id]}
              onCopy={() => void copyText(rotatedAdminKeys[item.id], `admin:${item.id}`)}
              copied={copiedToken === `admin:${item.id}` && copyState === 'ok'}
              copyError={copiedToken === `admin:${item.id}` && copyState === 'error'}
            />
          )}
        </div>
      ))}

      {managedAdminKeys.length === 0 && !showStaffForm && (
        <p className="text-xs text-muted text-center py-12">{t('admin.staff.empty')}</p>
      )}
    </div>
  )
}
