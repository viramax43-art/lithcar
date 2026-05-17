import { resolveApiBaseUrl } from '../../config/env'
import { clearAccessToken, ensurePassengerAccessToken } from '../auth/passengerAuthSession'

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE'
export type AuthMode = 'bearer' | 'cookie' | 'none'

export interface ApiRequestOptions {
  method?: HttpMethod
  body?: unknown
  authMode?: AuthMode
}

async function performRequest(
  path: string,
  options: ApiRequestOptions,
  forceRefreshToken: boolean,
): Promise<Response> {
  const { method = 'GET', body, authMode = 'bearer' } = options
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (authMode === 'bearer') {
    const token = await ensurePassengerAccessToken(forceRefreshToken)
    headers.Authorization = `Bearer ${token}`
  }
  return fetch(`${resolveApiBaseUrl()}${path}`, {
    method,
    credentials: authMode === 'cookie' ? 'include' : undefined,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const authMode = options.authMode ?? 'bearer'
  let response = await performRequest(path, options, false)

  if (response.status === 401 && authMode === 'bearer') {
    clearAccessToken()
    response = await performRequest(path, options, true)
  }

  if (!response.ok) {
    const message = await response.text()
    if (response.status === 401 && authMode === 'bearer') {
      clearAccessToken()
    }
    throw new Error(message || `API request failed (${response.status})`)
  }

  if (response.status === 204) {
    return undefined as T
  }
  return (await response.json()) as T
}

export async function uploadMultipart<T>(path: string, formData: FormData): Promise<T> {
  const response = await fetch(`${resolveApiBaseUrl()}${path}`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  })
  if (!response.ok) {
    const message = await response.text()
    throw new Error(message || `Upload failed (${response.status})`)
  }
  return (await response.json()) as T
}
