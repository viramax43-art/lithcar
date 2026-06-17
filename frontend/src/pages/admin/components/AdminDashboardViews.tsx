import { SignOut, X } from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'
import type { AdminSessionUser } from '../../../lib/backend'
import LanguageSwitcher from '../../../components/LanguageSwitcher'
import NotificationBell from '../../../components/notifications/NotificationBell'
import type { AppNotification } from '../../../types'
import { getAdminRoleLabel } from '../utils/adminRolePresentation'

export function AdminSessionChecking() {
  const { t } = useTranslation()
  return <div className="min-h-[100dvh] flex items-center justify-center text-sm text-muted">{t('admin.checkingSession', { defaultValue: 'Checking admin session...' })}</div>
}

export function AdminLoginScreen({
  adminKeyInput,
  isAdminAuthorizing,
  errorMessage,
  onChangeKey,
  onLogin,
}: {
  adminKeyInput: string
  isAdminAuthorizing: boolean
  errorMessage: string | null
  onChangeKey: (value: string) => void
  onLogin: () => void
}) {
  const { t } = useTranslation()
  return (
    <div className="min-h-[100dvh] bg-surface flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white rounded-card shadow-card p-6 space-y-5">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight">RIDE</h1>
          <p className="text-sm text-muted mt-1">{t('admin.panel', { defaultValue: 'Admin panel' })}</p>
        </div>
        <p className="text-sm text-muted">{t('admin.enterAccessKey', { defaultValue: 'Enter access key. Login/password is not required.' })}</p>
        <form
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault()
            if (adminKeyInput.trim() && !isAdminAuthorizing) onLogin()
          }}
        >
          <input
            type="password"
            value={adminKeyInput}
            onChange={(event) => onChangeKey(event.target.value)}
            placeholder="ride_admin_..."
            autoComplete="current-password"
            className="w-full px-4 py-3 rounded-xl border-[1.5px] border-border bg-surface outline-none focus:border-black focus:bg-white transition-colors"
          />
          <button
            type="submit"
            disabled={!adminKeyInput.trim() || isAdminAuthorizing}
            className={`w-full py-3 rounded-xl font-bold text-sm transition-all ${adminKeyInput.trim() && !isAdminAuthorizing ? 'bg-black text-white hover:bg-zinc-800 active:scale-[0.97]' : 'bg-surface text-muted'}`}
          >
            {isAdminAuthorizing
              ? t('admin.verifyingKey', { defaultValue: 'Verifying key...' })
              : t('driver.login', { defaultValue: 'Sign in' })}
          </button>
        </form>
        {errorMessage && <p className="text-xs font-medium text-red-600">{errorMessage}</p>}
      </div>
    </div>
  )
}

export function AdminHeader({
  onlineDriversCount,
  adminSession,
  onLogout,
  onNotificationSelect,
}: {
  onlineDriversCount: number
  adminSession: AdminSessionUser
  onLogout: () => void
  onNotificationSelect?: (notification: AppNotification) => void
}) {
  const { t } = useTranslation()
  return (
    <header
      className="admin-dashboard-header flex items-center justify-between px-4 md:px-6 h-14 md:h-16 bg-black text-white flex-shrink-0 user-safe-top"
      style={{ paddingTop: 'var(--app-safe-area-top-total, 0px)', minHeight: 'calc(3.5rem + var(--app-safe-area-top-total, 0px))' }}
    >
      <div className="flex items-center gap-2 md:gap-4">
        <h1 className="text-lg md:text-xl font-extrabold tracking-tight">RIDE</h1>
        <span className="w-px h-6 bg-white/20" />
        <span className="text-base md:text-xl font-extrabold tracking-tight">{t('admin.panel', { defaultValue: 'Admin panel' })}</span>
      </div>
      <div className="flex items-center gap-2 md:gap-5">
        <NotificationBell
          pool="admin"
          variant="dark"
          onNotificationSelect={onNotificationSelect}
        />
        <div className="flex-shrink-0">
          <LanguageSwitcher variant="header" />
        </div>
        <div className="flex items-center gap-1.5 md:gap-2 px-2.5 md:px-3 py-2 rounded-pill bg-white/10">
          <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
          <span className="text-[11px] md:text-xs font-semibold">
            {onlineDriversCount} <span className="text-white/60 font-medium hidden sm:inline">{t('common.online', { defaultValue: 'online' })}</span>
          </span>
        </div>
        <div className="text-right admin-header-desktop-extras">
          <p className="text-xs font-semibold leading-tight">{adminSession.name}</p>
          <p className="text-[10px] text-white/50 leading-tight">{getAdminRoleLabel(adminSession.role, (key, defaultValue) => t(key, { defaultValue }))}</p>
        </div>
        <button
          onClick={onLogout}
          className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-pill bg-white/10 hover:bg-white/20 transition-colors touch-none"
        >
          <SignOut size={14} weight="bold" />
          <span className="hidden sm:inline">{t('driver.logout', { defaultValue: 'Sign out' })}</span>
        </button>
      </div>
    </header>
  )
}

export function AdminErrorToast({ errorMessage, onClose }: { errorMessage: string; onClose: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="admin-error-toast fixed bottom-6 left-4 right-4 md:left-auto md:right-6 md:max-w-sm z-[3000] bg-white border-[1.5px] border-red-200 rounded-card shadow-card p-4 flex items-start gap-3 animate-slide-up">
      <div className="w-8 h-8 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0">
        <X size={16} className="text-red-600" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold text-red-900">{t('common.error', { defaultValue: 'Error' })}</p>
        <p className="text-xs text-red-700 mt-0.5 break-words">{errorMessage}</p>
      </div>
      <button onClick={onClose} className="w-10 h-10 -m-1 flex items-center justify-center hover:bg-surface rounded-lg flex-shrink-0 transition-colors touch-none">
        <X size={14} className="text-muted" />
      </button>
    </div>
  )
}
