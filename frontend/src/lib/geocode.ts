import type { LatLng } from '../types'
import i18n from '../i18n'
import { normalizeLanguage } from '../i18n/languages'

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

let cooldownUntil = 0
let lastRequestAt = 0
let inflightChain: Promise<unknown> = Promise.resolve()

const reverseCache = new Map<string, string>()
const searchCache = new Map<string, NominatimSearchResult[]>()

export function isRateLimited(): boolean {
  return Date.now() < cooldownUntil
}

export function rateLimitRetryInMs(): number {
  return Math.max(0, cooldownUntil - Date.now())
}

function getAcceptLanguage(): string {
  return normalizeLanguage(i18n.language)
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
  // Don't block the chain on individual failures.
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
  // Round to ~10m precision so tiny pan jitter hits the cache.
  return `${latlng.lat.toFixed(4)},${latlng.lng.toFixed(4)}`
}

/**
 * Reverse-geocode lat/lng to a short human-readable address via Nominatim.
 * Returns empty string on failure. Throws {@link RateLimitedError} when 429.
 */
export async function reverseGeocode(latlng: LatLng, signal?: AbortSignal): Promise<string> {
  const key = coordKey(latlng)
  const cached = reverseCache.get(key)
  if (cached !== undefined) return cached

  return scheduleNominatim(async () => {
    if (signal?.aborted) {
      const err = new Error('aborted')
      err.name = 'AbortError'
      throw err
    }
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${latlng.lat}&lon=${latlng.lng}&format=json&accept-language=${getAcceptLanguage()}`,
        { signal },
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
 * Forward search via Nominatim, scoped to Vilnius/Lithuania.
 * Throws {@link RateLimitedError} when 429.
 */
export async function searchPlaces(
  query: string,
  signal?: AbortSignal,
): Promise<NominatimSearchResult[]> {
  const q = query.trim()
  if (!q) return []
  const cached = searchCache.get(q.toLowerCase())
  if (cached) return cached

  return scheduleNominatim(async () => {
    if (signal?.aborted) {
      const err = new Error('aborted')
      err.name = 'AbortError'
      throw err
    }
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
          q,
        )}&format=json&limit=6&countrycodes=lt&viewbox=24.9,54.5,25.6,54.85&bounded=1&accept-language=${getAcceptLanguage()}`,
        { signal },
      )
      handleNominatimResponse(res)
      if (!res.ok) return []
      const data = (await res.json()) as NominatimSearchResult[]
      searchCache.set(q.toLowerCase(), data)
      return data
    } catch (err) {
      if (err instanceof RateLimitedError) throw err
      if ((err as Error)?.name === 'AbortError') throw err
      return []
    }
  })
}
