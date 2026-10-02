import { bootstrapAdminSession, getAdminSession } from '../infrastructure/api/adminApi'
import { waitForTelegramInitData } from '../infrastructure/auth/telegramInitDataProvider'

/** Telegram WebApp globals available inside the Mini App WebView. */
type TelegramWebAppGlobal = {
  Telegram?: { WebApp?: { initData?: string } }
}

export function isInsideTelegramMiniApp(): boolean {
  if (typeof window === 'undefined') return false
  const telegram = (window as Window & TelegramWebAppGlobal).Telegram
  return typeof telegram?.WebApp?.initData === 'string' && Boolean(telegram?.WebApp?.initData)
}

/** Live Telegram initData, used to sign in to the admin panel without a key. */
export function readTelegramInitData(): string {
  if (typeof window === 'undefined') return ''
  const telegram = (window as Window & TelegramWebAppGlobal).Telegram
  const initData = telegram?.WebApp?.initData
  return typeof initData === 'string' ? initData : ''
}

type AdminSessionUser = Awaited<ReturnType<typeof bootstrapAdminSession>>

/**
 * Hard ceiling for the cold-start resolution of the panel.
 *
 * Requests to the API have no timeout of their own, so a stalled connection would otherwise
 * leave the panel on the "Checking admin session..." screen forever. Kept in line with the
 * app-level hard timeout of the passenger shell (`useEnsurePassengerSession`).
 */
export const INITIAL_ADMIN_SESSION_TIMEOUT_MS = 20_000

async function resolveSessionFromApi(): Promise<AdminSessionUser | null> {
  try {
    return await getAdminSession()
  } catch {
    // No key-based session yet — fall through to the silent Telegram sign-in.
  }

  try {
    return await bootstrapAdminSession(readTelegramInitData() || undefined)
  } catch {
    return null
  }
}

/**
 * Session of the admin panel on a cold start of the panel.
 *
 * Attempts, in order: the session already stored in the cookie (key or Telegram sign-in),
 * then the silent Mini App sign-in. Never throws and never hangs: `null` means the panel has
 * to show the sign-in screen, so the caller always leaves its "checking session" state.
 */
export async function resolveInitialAdminSession(
  timeoutMs: number = INITIAL_ADMIN_SESSION_TIMEOUT_MS,
): Promise<AdminSessionUser | null> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      resolveSessionFromApi(),
      new Promise<null>((resolve) => {
        timeoutId = setTimeout(() => resolve(null), timeoutMs)
      }),
    ])
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId)
  }
}

export function getAdminPanelUrl(): string {
  const base = import.meta.env.BASE_URL.replace(/\/?$/, '/')
  return `${window.location.origin}${base}admin`
}

export function getAppHomeUrl(): string {
  const base = import.meta.env.BASE_URL.replace(/\/?$/, '/')
  return `${window.location.origin}${base}`
}

/**
 * Open the admin panel inside the Mini App (same WebView) and sign in silently:
 * the staff account must be linked to this Telegram account by the chief admin.
 */
export async function enterAdminPanel(): Promise<void> {
  const initData = readTelegramInitData() || (await waitForTelegramInitData(2, 50).catch(() => ''))
  await bootstrapAdminSession(initData || undefined)
  window.location.assign(getAdminPanelUrl())
}

/** Leave the panel back to the passenger Mini App shell. */
export function leaveAdminPanel(): void {
  window.location.assign(getAppHomeUrl())
}
