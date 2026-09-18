import { resolveApiBaseUrl } from '../../config/env'
import i18n from '../../i18n'
import { getRequiredTelegramInitData } from './telegramInitDataProvider'
import {
  clearAccessToken as clearStoredAccessToken,
  getAccessToken as readStoredAccessToken,
  saveAccessToken,
} from './tokenStorage'

const API_V1 = '/api/v1'
const FETCH_TIMEOUT_MS = 10000

let sessionRefreshPromise: Promise<void> | null = null

function authHeaders(): Record<string, string> {
  const token = readStoredAccessToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(
        i18n.t('errors.sessionInitFailed', {
          defaultValue: 'Network timeout while initializing session.',
        }),
      )
    }
    throw err
  } finally {
    window.clearTimeout(timer)
  }
}

async function refreshSessionCookies(): Promise<boolean> {
  try {
    const response = await fetchWithTimeout(`${resolveApiBaseUrl()}${API_V1}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    })
    return response.ok
  } catch {
    return false
  }
}

async function loginWithTelegramInitData(initData: string): Promise<void> {
  const response = await fetchWithTimeout(`${resolveApiBaseUrl()}${API_V1}/auth`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ initData }),
  })
  if (!response.ok) {
    let detail = ''
    try {
      const payload = (await response.json()) as { detail?: unknown }
      if (typeof payload.detail === 'string') detail = payload.detail
    } catch {
      // ignore
    }
    throw new Error(
      detail ||
        i18n.t('errors.telegramAuthFailed', {
          defaultValue: 'Failed to authenticate via Telegram initData.',
        }),
    )
  }

  try {
    const payload = (await response.json()) as { access_token?: unknown }
    if (typeof payload.access_token === 'string' && payload.access_token) {
      saveAccessToken(payload.access_token)
    }
  } catch {
    // cookie-only responses still ok
  }

  if (!(await hasActiveSession())) {
    throw new Error(
      i18n.t('errors.telegramAuthFailed', {
        defaultValue: 'Failed to authenticate via Telegram initData.',
      }),
    )
  }
}

async function hasActiveSession(): Promise<boolean> {
  try {
    const response = await fetchWithTimeout(`${resolveApiBaseUrl()}${API_V1}/users/me`, {
      credentials: 'include',
      headers: authHeaders(),
    })
    return response.ok
  } catch {
    return false
  }
}

async function ensurePassengerSession(forceReauth = false): Promise<void> {
  if (sessionRefreshPromise) {
    await sessionRefreshPromise
    if (!forceReauth || readStoredAccessToken()) return
  }

  const run = (async () => {
    if (!forceReauth && (await hasActiveSession())) return
    if (!forceReauth && (await refreshSessionCookies()) && (await hasActiveSession())) return
    const initData = await getRequiredTelegramInitData()
    await loginWithTelegramInitData(initData)
  })()

  sessionRefreshPromise = run
  try {
    await run
  } finally {
    if (sessionRefreshPromise === run) {
      sessionRefreshPromise = null
    }
  }
}

export async function ensurePassengerAccessToken(forceRefresh = false): Promise<string> {
  await ensurePassengerSession(forceRefresh)
  return readStoredAccessToken() ?? ''
}

export function clearAccessToken(): void {
  clearStoredAccessToken()
  void fetch(`${resolveApiBaseUrl()}${API_V1}/auth/logout`, {
    method: 'POST',
    credentials: 'include',
  }).catch(() => undefined)
}

export function getAccessToken(): string | null {
  return readStoredAccessToken()
}
