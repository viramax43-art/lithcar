import L from 'leaflet'
import type { LatLng } from '../types'

export type GeolocationResult = LatLng & { accuracy: number }

export type GetUserGeolocationOptions = {
  highAccuracy?: boolean
  timeoutMs?: number
  /** Accept the first fix at or below this accuracy (meters). */
  maxAcceptableAccuracyM?: number
}

const DEFAULT_TIMEOUT_MS = 15_000
const GOOD_ACCURACY_M = 35

export function getUserGeolocation(options: GetUserGeolocationOptions = {}): Promise<GeolocationResult> {
  const {
    highAccuracy = true,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxAcceptableAccuracyM = GOOD_ACCURACY_M,
  } = options

  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('unsupported'))
      return
    }

    let settled = false
    let best: GeolocationPosition | null = null
    let watchId: number | undefined

    const finish = (pos: GeolocationPosition) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (watchId !== undefined) navigator.geolocation.clearWatch(watchId)
      resolve({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
      })
    }

    const fail = (err: GeolocationPositionError) => {
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
      else fail({ code: 3, message: 'timeout', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError)
    }, timeoutMs)

    const geoOptions: PositionOptions = {
      enableHighAccuracy: highAccuracy,
      maximumAge: 0,
      timeout: timeoutMs,
    }

    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        if (!best || pos.coords.accuracy < best.coords.accuracy) {
          best = pos
        }
        if (pos.coords.accuracy <= maxAcceptableAccuracyM) {
          finish(pos)
        }
      },
      () => {
        navigator.geolocation.getCurrentPosition(finish, fail, geoOptions)
      },
      geoOptions,
    )
  })
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
