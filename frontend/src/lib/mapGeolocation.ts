import L from 'leaflet'
import type { LatLng } from '../types'

export type GeolocationResult = LatLng & { accuracy: number }

export type GetUserGeolocationOptions = {
  highAccuracy?: boolean
  timeoutMs?: number
  /** Accept the first fix at or below this accuracy (meters). Use Infinity to accept any fix. */
  maxAcceptableAccuracyM?: number
}

export class GeolocationRequestError extends Error {
  code: 'unsupported' | 'permission_denied' | 'unavailable' | 'timeout' | 'unknown'

  constructor(code: GeolocationRequestError['code'], message?: string) {
    super(message ?? code)
    this.name = 'GeolocationRequestError'
    this.code = code
  }
}

const DEFAULT_TIMEOUT_MS = 18_000
const GOOD_ACCURACY_M = 80

type TelegramLocationData = {
  latitude: number
  longitude: number
  horizontal_accuracy?: number | null
}

type TelegramLocationManager = {
  isInited?: boolean
  isLocationAvailable?: boolean
  isAccessGranted?: boolean
  init?: (callback?: () => void) => void
  getLocation?: (callback: (location: TelegramLocationData | null) => void) => void
  openSettings?: () => void
}

function getTelegramLocationManager(): TelegramLocationManager | null {
  const webApp = (window as Window & {
    Telegram?: { WebApp?: { LocationManager?: TelegramLocationManager; isVersionAtLeast?: (v: string) => boolean } }
  }).Telegram?.WebApp
  if (!webApp?.LocationManager) return null
  if (webApp.isVersionAtLeast && !webApp.isVersionAtLeast('8.0')) return null
  return webApp.LocationManager
}

function mapBrowserError(err: GeolocationPositionError | null | undefined): GeolocationRequestError {
  if (!err) return new GeolocationRequestError('unknown')
  if (err.code === err.PERMISSION_DENIED) return new GeolocationRequestError('permission_denied', err.message)
  if (err.code === err.POSITION_UNAVAILABLE) return new GeolocationRequestError('unavailable', err.message)
  if (err.code === err.TIMEOUT) return new GeolocationRequestError('timeout', err.message)
  return new GeolocationRequestError('unknown', err.message)
}

function fromCoords(lat: number, lng: number, accuracy: number): GeolocationResult {
  return { lat, lng, accuracy: Number.isFinite(accuracy) ? accuracy : 9999 }
}

function tryTelegramLocation(timeoutMs: number): Promise<GeolocationResult | null> {
  const manager = getTelegramLocationManager()
  if (!manager?.getLocation) return Promise.resolve(null)

  return new Promise((resolve) => {
    let settled = false
    const done = (value: GeolocationResult | null) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(value)
    }
    const timer = setTimeout(() => done(null), Math.min(timeoutMs, 12_000))

    const request = () => {
      try {
        manager.getLocation?.((location) => {
          if (
            location &&
            Number.isFinite(location.latitude) &&
            Number.isFinite(location.longitude)
          ) {
            done(
              fromCoords(
                location.latitude,
                location.longitude,
                location.horizontal_accuracy ?? 50,
              ),
            )
            return
          }
          done(null)
        })
      } catch {
        done(null)
      }
    }

    try {
      if (manager.isInited) {
        request()
      } else if (manager.init) {
        manager.init(() => request())
        // Some clients never fire init callback — still try once.
        setTimeout(() => {
          if (!settled) request()
        }, 400)
      } else {
        request()
      }
    } catch {
      done(null)
    }
  })
}

function getCurrentPositionOnce(options: PositionOptions): Promise<GeolocationResult> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new GeolocationRequestError('unsupported'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve(
          fromCoords(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy),
        ),
      (err) => reject(mapBrowserError(err)),
      options,
    )
  })
}

function watchUntilAccurate(options: {
  highAccuracy: boolean
  timeoutMs: number
  maxAcceptableAccuracyM: number
}): Promise<GeolocationResult> {
  const { highAccuracy, timeoutMs, maxAcceptableAccuracyM } = options

  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new GeolocationRequestError('unsupported'))
      return
    }

    let settled = false
    let best: GeolocationResult | null = null
    let watchId: number | undefined
    let lastError: GeolocationRequestError | null = null

    const finish = (pos: GeolocationResult) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (watchId !== undefined) navigator.geolocation.clearWatch(watchId)
      resolve(pos)
    }

    const fail = (err: GeolocationRequestError) => {
      if (settled) return
      if (best) {
        finish(best)
        return
      }
      settled = true
      clearTimeout(timer)
      if (watchId !== undefined) navigator.geolocation.clearWatch(watchId)
      reject(err)
    }

    const timer = setTimeout(() => {
      if (best) finish(best)
      else fail(lastError ?? new GeolocationRequestError('timeout'))
    }, timeoutMs)

    const geoOptions: PositionOptions = {
      enableHighAccuracy: highAccuracy,
      maximumAge: highAccuracy ? 0 : 60_000,
      timeout: Math.min(timeoutMs, highAccuracy ? 12_000 : 15_000),
    }

    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const next = fromCoords(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy)
        if (!best || next.accuracy < best.accuracy) best = next
        if (next.accuracy <= maxAcceptableAccuracyM) finish(next)
      },
      (err) => {
        lastError = mapBrowserError(err)
        // watchPosition often fails in Telegram WebView — fall back to one-shot.
        void getCurrentPositionOnce(geoOptions)
          .then(finish)
          .catch((oneShotErr) => {
            lastError =
              oneShotErr instanceof GeolocationRequestError
                ? oneShotErr
                : mapBrowserError(err)
          })
      },
      geoOptions,
    )
  })
}

/**
 * Robust locate for Telegram Mini App + browsers:
 * 1) Telegram LocationManager (Bot API 8+)
 * 2) high-accuracy watch / getCurrentPosition
 * 3) low-accuracy / cached position fallback
 */
export async function getUserGeolocation(
  options: GetUserGeolocationOptions = {},
): Promise<GeolocationResult> {
  const {
    highAccuracy = true,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxAcceptableAccuracyM = GOOD_ACCURACY_M,
  } = options

  const fromTelegram = await tryTelegramLocation(timeoutMs)
  if (fromTelegram) return fromTelegram

  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    throw new GeolocationRequestError('unsupported')
  }

  let lastError: unknown = null

  if (highAccuracy) {
    try {
      return await watchUntilAccurate({
        highAccuracy: true,
        timeoutMs: Math.min(timeoutMs, 12_000),
        maxAcceptableAccuracyM,
      })
    } catch (error) {
      lastError = error
      if (error instanceof GeolocationRequestError && error.code === 'permission_denied') {
        throw error
      }
    }
  }

  try {
    return await watchUntilAccurate({
      highAccuracy: false,
      timeoutMs,
      maxAcceptableAccuracyM: Math.max(maxAcceptableAccuracyM, 500),
    })
  } catch (error) {
    lastError = error
  }

  try {
    return await getCurrentPositionOnce({
      enableHighAccuracy: false,
      maximumAge: 120_000,
      timeout: 10_000,
    })
  } catch (error) {
    lastError = error
  }

  if (lastError instanceof GeolocationRequestError) throw lastError
  throw new GeolocationRequestError('unavailable')
}

export function openTelegramLocationSettings(): boolean {
  const manager = getTelegramLocationManager()
  if (!manager?.openSettings) return false
  try {
    manager.openSettings()
    return true
  } catch {
    return false
  }
}

/** Map center so that `target` sits under the pin at pinAnchorYFrac (0–1 from top). */
export function computeMapCenterForLatLngUnderPin(
  map: L.Map,
  target: LatLng,
  pinAnchorYFrac: number,
  zoom?: number,
): LatLng {
  const z = zoom ?? map.getZoom()
  const targetPx = map.project([target.lat, target.lng], z)
  const size = map.getSize()
  const dy = size.y * (0.5 - pinAnchorYFrac)
  const desiredCenterPx = targetPx.add(L.point(0, dy))
  const newCenter = map.unproject(desiredCenterPx, z)
  return { lat: newCenter.lat, lng: newCenter.lng }
}

export function panMapToLatLngUnderPin(
  map: L.Map,
  target: LatLng,
  pinAnchorYFrac: number,
  zoom?: number,
  duration = 0.5,
): void {
  const z = Math.max(map.getZoom(), zoom ?? map.getZoom())
  const center = computeMapCenterForLatLngUnderPin(map, target, pinAnchorYFrac, z)
  map.flyTo([center.lat, center.lng], z, { duration })
}

export function waitForMapMoveEnd(map: L.Map, timeoutMs = 2500): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      map.off('moveend', onEnd)
      resolve()
    }, timeoutMs)
    const onEnd = () => {
      clearTimeout(timer)
      map.off('moveend', onEnd)
      resolve()
    }
    map.once('moveend', onEnd)
  })
}
