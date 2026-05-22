const API_TARGET = ((import.meta.env.VITE_API_TARGET as string | undefined) ?? 'local').toLowerCase()

const FALLBACK_LOCAL_API_URL = 'http://localhost:8000'

export function resolveApiBaseUrl(): string {
  const fallbackRemote = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? FALLBACK_LOCAL_API_URL
  const localUrl = (import.meta.env.VITE_API_BASE_URL_LOCAL as string | undefined) ?? FALLBACK_LOCAL_API_URL
  const remoteUrl = (import.meta.env.VITE_API_BASE_URL_REMOTE as string | undefined) ?? fallbackRemote
  return (API_TARGET === 'remote' ? remoteUrl : localUrl).replace(/\/$/, '')
}

export function isBrowserTestAuthEnabled(): boolean {
  const configured =
    (import.meta.env.VITE_ENABLE_BROWSER_TEST_AUTH as string | undefined) ??
    (API_TARGET === 'remote' ? 'false' : 'true')
  return configured !== 'false'
}

export function getEnvTelegramInitData(): string {
  return (import.meta.env.VITE_TELEGRAM_INIT_DATA as string | undefined) ?? ''
}
