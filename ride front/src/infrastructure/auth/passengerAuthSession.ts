import { resolveApiBaseUrl } from '../../config/env'
import { clearAccessToken, getAccessToken, saveAccessToken } from './tokenStorage'
import { getRequiredTelegramInitData } from './telegramInitDataProvider'

interface TokenResponse {
  access_token: string
}

let tokenRefreshPromise: Promise<string> | null = null

async function loginWithTelegramInitData(initData: string): Promise<string> {
  const response = await fetch(`${resolveApiBaseUrl()}/api/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ initData }),
  })
  if (!response.ok) {
    throw new Error('Не удалось выполнить авторизацию через Telegram initData.')
  }
  const body: TokenResponse = await response.json()
  saveAccessToken(body.access_token)
  return body.access_token
}

async function refreshAccessToken(): Promise<string> {
  if (tokenRefreshPromise) return tokenRefreshPromise
  tokenRefreshPromise = (async () => {
    const initData = await getRequiredTelegramInitData()
    return loginWithTelegramInitData(initData)
  })()
  try {
    return await tokenRefreshPromise
  } finally {
    tokenRefreshPromise = null
  }
}

export async function ensurePassengerAccessToken(forceRefresh = false): Promise<string> {
  const cachedToken = getAccessToken()
  if (cachedToken && !forceRefresh) return cachedToken
  return refreshAccessToken()
}

export { clearAccessToken, getAccessToken }
