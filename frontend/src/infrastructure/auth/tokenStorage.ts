const TOKEN_KEY = 'ride_access_token'
const INIT_DATA_KEY = 'ride_init_data'

function safeGet(key: string): string {
  try {
    return localStorage.getItem(key) ?? ''
  } catch {
    return ''
  }
}

function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // noop
  }
}

function safeRemove(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    // noop
  }
}

export function getAccessToken(): string | null {
  const token = safeGet(TOKEN_KEY)
  return token || null
}

export function saveAccessToken(token: string): void {
  if (!token) return
  safeSet(TOKEN_KEY, token)
}

export function clearAccessToken(): void {
  safeRemove(TOKEN_KEY)
}

export function readCachedInitData(): string {
  return safeGet(INIT_DATA_KEY)
}

export function cacheInitData(initData: string): void {
  if (!initData) return
  safeSet(INIT_DATA_KEY, initData)
}
