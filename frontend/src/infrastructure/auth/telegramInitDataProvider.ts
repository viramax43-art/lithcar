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

function resolveInitDataOnce(): string {
  const resolved =
    readInitDataFromTelegramGlobals() || readInitDataFromUrl() || getEnvTelegramInitData() || readCachedInitData()

  if (resolved) {
    cacheInitData(resolved)
    return resolved
  }
  if (!isBrowserTestAuthEnabled()) return ''
  return 'test:7370074938:hrd:hrdlean'
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

export async function waitForTelegramInitData(maxAttempts = 10, delayMs = 120): Promise<string> {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const initData = resolveInitDataOnce()
    if (initData) return initData
    await sleep(delayMs)
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
