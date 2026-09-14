import { resolveApiBaseUrl } from '../../config/env'
import i18n from '../../i18n'
import { getRequiredTelegramInitData } from './telegramInitDataProvider'

const API_V1 = '/api/v1'

let sessionRefreshPromise: Promise<void> | null = null

async function refreshSessionCookies(): Promise<boolean> {
  const response = await fetch(`${resolveApiBaseUrl()}${API_V1}/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
  })
  return response.ok
}

async function loginWithTelegramInitData(initData: string): Promise<void> {
  const response = await fetch(`${resolveApiBaseUrl()}${API_V1}/auth`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ initData }),
  })
  if (!response.ok) {
    throw new Error(
      i18n.t('errors.telegramAuthFailed', {
        defaultValue: 'Failed to authenticate via Telegram initData.',
      }),
    )
  }
}

async function hasActiveSession(): Promise<boolean> {
  const response = await fetch(`${resolveApiBaseUrl()}${API_V1}/users/me`, {
    credentials: 'include',
  })
  return response.ok
}

async function ensurePassengerSession(forceReauth = false): Promise<void> {
  if (sessionRefreshPromise) {
    await sessionRefreshPromise
    return
  }

  sessionRefreshPromise = (async () => {
    if (!forceReauth && (await hasActiveSession())) {
      return
    }
    if (!forceReauth && (await refreshSessionCookies()) && (await hasActiveSession())) {
      return
    }
    const initData = await getRequiredTelegramInitData()
    await loginWithTelegramInitData(initData)
  })()

  try {
    await sessionRefreshPromise
  } finally {
    sessionRefreshPromise = null
  }
}

/** @deprecated Access tokens are stored in httpOnly cookies; kept for API compatibility. */
export async function ensurePassengerAccessToken(forceRefresh = false): Promise<string> {
  await ensurePassengerSession(forceRefresh)
  return ''
}

export function clearAccessToken(): void {
  void fetch(`${resolveApiBaseUrl()}${API_V1}/auth/logout`, {
    method: 'POST',
    credentials: 'include',
  })
}

export function getAccessToken(): string | null {
  return null
}
