import type { LatLng } from '../types'
import i18n from '../i18n'
import { getNominatimAcceptLanguage } from './mapLocale'
import { resolveGeocodeSearchScope, type GeocodeSearchScope } from './mapRegion'

/**
 * Nominatim public instance has a strict usage policy: at most 1 request/second
 * and no parallel calls. We add client-side throttling, caching and abort
 * support to stay friendly and to recover from 429 rate-limits.
 */

export class RateLimitedError extends Error {
  constructor() {
    super('Nominatim rate limit (429)')
    this.name = 'RateLimitedError'
  }
}

const RATE_LIMIT_COOLDOWN_MS = 30_000
const MIN_INTERVAL_MS = 1_100 // Nominatim policy: <= 1 req/sec.
const NOMINATIM_FETCH_TIMEOUT_MS = 12_000

let cooldownUntil = 0
let lastRequestAt = 0
let inflightChain: Promise<unknown> = Promise.resolve()

const reverseCache = new Map<string, string>()
const searchCache = new Map<string, NominatimSearchResult[]>()

export function clearGeocodeCaches(): void {
  reverseCache.clear()
  searchCache.clear()
}

function currentLanguageKey(): string {
  return getNominatimAcceptLanguage(i18n.language)
}

if (typeof window !== 'undefined') {
  i18n.on('languageChanged', () => {
    clearGeocodeCaches()
  })
}

export function isRateLimited(): boolean {
  return Date.now() < cooldownUntil
}

export function rateLimitRetryInMs(): number {
  return Math.max(0, cooldownUntil - Date.now())
}

/** Serialize requests so we never exceed 1/sec, and apply the cooldown window. */
async function scheduleNominatim<T>(task: () => Promise<T>): Promise<T> {
  const run = async (): Promise<T> => {
    if (isRateLimited()) throw new RateLimitedError()
    const wait = Math.max(0, MIN_INTERVAL_MS - (Date.now() - lastRequestAt))
    if (wait > 0) await new Promise((r) => setTimeout(r, wait))
    lastRequestAt = Date.now()
    return task()
  }
  const next = inflightChain.then(run, run) as Promise<T>
  inflightChain = next.catch(() => undefined)
  return next
}

function handleNominatimResponse(res: Response): void {
  if (res.status === 429) {
    cooldownUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS
    throw new RateLimitedError()
  }
}

function coordKey(latlng: LatLng): string {
  return `${latlng.lat.toFixed(4)},${latlng.lng.toFixed(4)}`
}

function reverseCacheKey(latlng: LatLng): string {
  return `${coordKey(latlng)}|${currentLanguageKey()}`
}

function searchCacheKey(query: string, scope: GeocodeSearchScope): string {
  return `${query.trim().toLowerCase()}|${scope.viewbox}|${scope.countryCodes ?? 'any'}|${currentLanguageKey()}`
}

function fetchWithTimeout(url: string, signal?: AbortSignal): Promise<Response> {
  const timeoutController = new AbortController()
  const timeoutId = window.setTimeout(() => timeoutController.abort(), NOMINATIM_FETCH_TIMEOUT_MS)
  const onExternalAbort = () => timeoutController.abort()
  signal?.addEventListener('abort', onExternalAbort)
  const mergedSignal = timeoutController.signal

  return fetch(url, { signal: mergedSignal }).finally(() => {
    window.clearTimeout(timeoutId)
    signal?.removeEventListener('abort', onExternalAbort)
  })
}

/**
 * Reverse-geocode lat/lng to a short human-readable address via Nominatim.
 * Returns empty string on failure. Throws {@link RateLimitedError} when 429.
 */
export async function reverseGeocode(latlng: LatLng, signal?: AbortSignal): Promise<string> {
  const key = reverseCacheKey(latlng)
  const cached = reverseCache.get(key)
  if (cached !== undefined) return cached

  const acceptLanguage = encodeURIComponent(currentLanguageKey())

  return scheduleNominatim(async () => {
    if (signal?.aborted) {
      const err = new Error('aborted')
      err.name = 'AbortError'
      throw err
    }
    try {
      const res = await fetchWithTimeout(
        `https://nominatim.openstreetmap.org/reverse?lat=${latlng.lat}&lon=${latlng.lng}&format=json&accept-language=${acceptLanguage}`,
        signal,
      )
      handleNominatimResponse(res)
      if (!res.ok) return ''
      const data = (await res.json()) as { display_name?: string }
      const addr =
        data.display_name
          ?.split(',')
          .slice(0, 3)
          .join(',')
          .trim() ?? ''
      reverseCache.set(key, addr)
      return addr
    } catch (err) {
      if (err instanceof RateLimitedError) throw err
      if ((err as Error)?.name === 'AbortError') throw err
      return ''
    }
  })
}

export interface NominatimSearchResult {
  place_id: number
  display_name: string
  lat: string
  lon: string
}

/**
 * Forward search via Nominatim, scoped to service zones or the configured map region.
 * Throws {@link RateLimitedError} when 429.
 */
export async function searchPlaces(
  query: string,
  signal?: AbortSignal,
  scope: GeocodeSearchScope = resolveGeocodeSearchScope(),
): Promise<NominatimSearchResult[]> {
  const q = query.trim()
  if (!q) return []
  const cacheKey = searchCacheKey(q, scope)
  const cached = searchCache.get(cacheKey)
  if (cached && cached.length > 0) return cached

  const acceptLanguage = encodeURIComponent(currentLanguageKey())
  const countryParam = `&countrycodes=${scope.countryCodes}`
  const viewboxParam = scope.viewbox ? `&viewbox=${scope.viewbox}` : ''

  return scheduleNominatim(async () => {
    if (signal?.aborted) {
      const err = new Error('aborted')
      err.name = 'AbortError'
      throw err
    }
    try {
      const res = await fetchWithTimeout(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
          q,
        )}&format=json&limit=8${countryParam}${viewboxParam}&accept-language=${acceptLanguage}`,
        signal,
      )
      handleNominatimResponse(res)
      if (!res.ok) return []
      const data = (await res.json()) as NominatimSearchResult[]
      if (data.length > 0) searchCache.set(cacheKey, data)
      return data
    } catch (err) {
      if (err instanceof RateLimitedError) throw err
      if ((err as Error)?.name === 'AbortError') throw err
      return []
    }
  })
}
