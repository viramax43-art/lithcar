const INIT_DATA_KEY = 'ride_init_data'
const ACCESS_TOKEN_KEY = 'ride_access_token_mem'

let memoryAccessToken: string | null = null

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
  if (memoryAccessToken) return memoryAccessToken
  const stored = safeGet(ACCESS_TOKEN_KEY)
  if (stored) {
    memoryAccessToken = stored
    return stored
  }
  return null
}

export function saveAccessToken(token: string): void {
  memoryAccessToken = token || null
  if (token) safeSet(ACCESS_TOKEN_KEY, token)
  else safeRemove(ACCESS_TOKEN_KEY)
}

export function clearAccessToken(): void {
  memoryAccessToken = null
  safeRemove(ACCESS_TOKEN_KEY)
}

export function readCachedInitData(): string {
  return safeGet(INIT_DATA_KEY)
}

export function cacheInitData(initData: string): void {
  if (!initData) return
  safeSet(INIT_DATA_KEY, initData)
}
