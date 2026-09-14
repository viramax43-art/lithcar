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

export function getAccessToken(): string | null {
  return null
}

export function saveAccessToken(_token: string): void {
  // Access tokens are issued as httpOnly cookies by the backend.
}

export function clearAccessToken(): void {
  // Handled by passengerAuthSession.logout via /auth/logout.
}

export function readCachedInitData(): string {
  return safeGet(INIT_DATA_KEY)
}

export function cacheInitData(initData: string): void {
  if (!initData) return
  safeSet(INIT_DATA_KEY, initData)
}
