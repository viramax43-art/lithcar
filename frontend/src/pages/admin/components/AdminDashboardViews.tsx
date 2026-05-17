import { SignOut, X } from '@phosphor-icons/react'
import type { AdminSessionUser } from '../../../lib/backend'
import { getAdminRoleLabel } from '../utils/adminRolePresentation'

export function AdminSessionChecking() {
  return <div className="min-h-[100dvh] flex items-center justify-center text-sm text-muted">Проверяем сессию админки...</div>
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
  return (
    <div className="min-h-[100dvh] bg-surface flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white rounded-card shadow-card p-6 space-y-5">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight">RIDE</h1>
          <p className="text-sm text-muted mt-1">Панель администратора</p>
        </div>
        <p className="text-sm text-muted">Введите ключ доступа. Логин/пароль не требуется.</p>
        <input
          type="password"
          value={adminKeyInput}
          onChange={(event) => onChangeKey(event.target.value)}
          placeholder="ride_admin_..."
          className="w-full px-4 py-3 rounded-xl border-[1.5px] border-border bg-surface outline-none focus:border-black focus:bg-white transition-colors"
        />
        <button
          onClick={onLogin}
          disabled={!adminKeyInput.trim() || isAdminAuthorizing}
          className={`w-full py-3 rounded-xl font-bold text-sm transition-all ${adminKeyInput.trim() && !isAdminAuthorizing ? 'bg-black text-white active:scale-[0.97]' : 'bg-surface text-muted'}`}
        >
          {isAdminAuthorizing ? 'Проверяем ключ...' : 'Войти'}
        </button>
        {errorMessage && <p className="text-xs font-medium text-red-600">{errorMessage}</p>}
      </div>
    </div>
  )
}

export function AdminHeader({
  onlineDriversCount,
  adminSession,
  onLogout,
}: {
  onlineDriversCount: number
  adminSession: AdminSessionUser
  onLogout: () => void
}) {
  return (
    <header className="flex items-center justify-between px-6 h-16 bg-black text-white flex-shrink-0">
      <div className="flex items-center gap-4">
        <h1 className="text-xl font-extrabold tracking-tight">RIDE</h1>
        <span className="w-px h-5 bg-white/20" />
        <span className="text-sm font-semibold text-white/80">Админ-панель</span>
      </div>
      <div className="flex items-center gap-5">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-pill bg-white/10">
          <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
          <span className="text-xs font-semibold">
            {onlineDriversCount} <span className="text-white/60 font-medium">онлайн</span>
          </span>
        </div>
        <div className="text-right">
          <p className="text-xs font-semibold leading-tight">{adminSession.name}</p>
          <p className="text-[10px] text-white/50 leading-tight">{getAdminRoleLabel(adminSession.role)}</p>
        </div>
        <button
          onClick={onLogout}
          className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-pill bg-white/10 hover:bg-white/20 transition-colors"
        >
          <SignOut size={14} weight="bold" />
          Выйти
        </button>
      </div>
    </header>
  )
}

export function AdminErrorToast({ errorMessage, onClose }: { errorMessage: string; onClose: () => void }) {
  return (
    <div className="fixed bottom-6 right-6 z-[3000] max-w-sm bg-white border-[1.5px] border-red-200 rounded-card shadow-card p-4 flex items-start gap-3 animate-slide-up">
      <div className="w-8 h-8 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0">
        <X size={16} className="text-red-600" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold text-red-900">Ошибка</p>
        <p className="text-xs text-red-700 mt-0.5 break-words">{errorMessage}</p>
      </div>
      <button onClick={onClose} className="p-1 hover:bg-surface rounded-lg flex-shrink-0 transition-colors">
        <X size={14} className="text-muted" />
      </button>
    </div>
  )
}
