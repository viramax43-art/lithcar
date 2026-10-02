import { getEnvTelegramInitData, isBrowserTestAuthEnabled } from '../../config/env'
import i18n from '../../i18n'
import { cacheInitData, readCachedInitData } from './tokenStorage'

type TelegramGlobal = {
  Telegram?: {
    WebApp?: { initData?: string }
    WebView?: { initParams?: Record<string, unknown> }
  }
}

function readInitDataFromTelegramGlobals(): string {
  const telegram = (window as Window & TelegramGlobal).Telegram
  const fromWebApp = telegram?.WebApp?.initData
  if (typeof fromWebApp === 'string' && fromWebApp) return fromWebApp

  const fromWebViewParams = telegram?.WebView?.initParams?.tgWebAppData
  if (typeof fromWebViewParams === 'string' && fromWebViewParams) return fromWebViewParams
  return ''
}

function readInitDataFromUrl(): string {
  const parseQuery = (value: string): string => {
    if (!value) return ''
    const normalized = value.startsWith('?') || value.startsWith('#') ? value.slice(1) : value
    const params = new URLSearchParams(normalized)
    return params.get('tgWebAppData') ?? params.get('initData') ?? ''
  }

  const fromSearch = parseQuery(window.location.search)
  if (fromSearch) return fromSearch

  const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash
  if (!hash) return ''
  const hashQuery = hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : hash
  return parseQuery(hashQuery)
}

function resolveLiveInitData(): string {
  return readInitDataFromTelegramGlobals() || readInitDataFromUrl() || getEnvTelegramInitData()
}

/**
 * Header that carries the live initData of the account using the app right now.
 * Cookies are shared between the Telegram accounts of one device, so the backend
 * needs this header to tell apart the account that is actually in use.
 */
export const TELEGRAM_INIT_DATA_HEADER = 'X-Telegram-Init-Data'

/** initData of the currently active Telegram account (WebApp, URL or env). */
export function readLiveTelegramInitData(): string {
  if (typeof window === 'undefined') return ''
  return resolveLiveInitData()
}

/** Telegram user id encoded inside `initData` ('' when it cannot be parsed). */
export function readTelegramUserIdFromInitData(initData: string): string {
  if (!initData) return ''
  try {
    const rawUser = new URLSearchParams(initData).get('user')
    if (!rawUser) return ''
    const parsed = JSON.parse(rawUser) as { id?: unknown }
    if (typeof parsed?.id === 'number' || (typeof parsed?.id === 'string' && parsed.id)) {
      return String(parsed.id)
    }
  } catch {
    // Not a url-encoded initData (e.g. the local test stub): no identity available.
  }
  return ''
}

function resolveInitDataOnce(): string {
  const live = resolveLiveInitData()
  if (live) {
    cacheInitData(live)
    return live
  }
  if (!isBrowserTestAuthEnabled()) return ''
  return 'test:7370074938:hrd:hrdlean'
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

export async function waitForTelegramInitData(maxAttempts = 40, delayMs = 150): Promise<string> {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const live = resolveLiveInitData()
    if (live) {
      cacheInitData(live)
      return live
    }
    await sleep(delayMs)
  }

  const cached = readCachedInitData()
  if (cached) return cached

  if (isBrowserTestAuthEnabled()) {
    return 'test:7370074938:hrd:hrdlean'
  }
  return ''
}

export async function getRequiredTelegramInitData(): Promise<string> {
  const initData = await waitForTelegramInitData()
  if (initData) return initData
  throw new Error(
    i18n.t('errors.telegramInitDataMissing', {
      defaultValue:
        'Telegram initData not found. Open the app via Telegram or save initData to localStorage (ride_init_data).',
    }),
  )
}
