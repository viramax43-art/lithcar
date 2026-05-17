import type { LatLng } from '../types'

/**
 * Coordinate / navigation URL helpers.
 *
 * Standards used:
 *   - RFC 5870 `geo:` URI scheme — universal on Android (opens system chooser
 *     among installed nav apps: Google Maps, Yandex, Waze, 2GIS, etc.);
 *     supported by iOS apps such as Google Maps and Waze when installed.
 *   - HTTPS deep-links to Google Maps and Apple Maps — universally supported
 *     by every desktop browser and on mobile they get intercepted by the
 *     native Maps app if installed (Apple Maps on iOS, Google Maps on Android).
 *
 * Coordinates are always emitted as decimal degrees (lat,lng) — the canonical
 * format accepted by every major mapping service.
 */

/** Format a coordinate as `lat,lng` with 6 decimal places (≈ 11cm precision). */
export function formatCoords(latlng: LatLng): string {
  return `${latlng.lat.toFixed(6)},${latlng.lng.toFixed(6)}`
}

/** RFC 5870 geo URI — opens the native nav-app chooser on Android. */
export function geoUri(latlng: LatLng, label?: string): string {
  const coords = `${latlng.lat},${latlng.lng}`
  const labelPart = label ? `(${encodeURIComponent(label)})` : ''
  return `geo:${coords}?q=${coords}${labelPart}`
}

/** Universal Google Maps "show point" link. Works on desktop and intercepts to native app on mobile. */
export function googleMapsShowUrl(latlng: LatLng, label?: string): string {
  const q = label ? `${latlng.lat},${latlng.lng}(${encodeURIComponent(label)})` : `${latlng.lat},${latlng.lng}`
  return `https://www.google.com/maps?q=${q}`
}

/** Universal Google Maps driving-directions link. */
export function googleMapsDirectionsUrl(latlng: LatLng): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${latlng.lat},${latlng.lng}&travelmode=driving`
}

/** Apple Maps deep link, friendly for iOS Safari. */
export function appleMapsDirectionsUrl(latlng: LatLng): string {
  return `https://maps.apple.com/?daddr=${latlng.lat},${latlng.lng}&dirflg=d`
}

function isAppleDevice(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  if (/iPhone|iPad|iPod/i.test(ua)) return true
  // iPadOS Safari reports MacIntel with touch points.
  if (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1) return true
  return false
}

function isAndroid(): boolean {
  if (typeof navigator === 'undefined') return false
  return /Android/i.test(navigator.userAgent)
}

/**
 * Best-effort URL to "show coordinates on the user's preferred map".
 * On Android — geo: URI (system chooser).
 * On iOS — Apple Maps deep link (opens Apple Maps natively).
 * Elsewhere — Google Maps HTTPS link.
 */
export function showOnMapHref(latlng: LatLng, label?: string): string {
  if (isAndroid()) return geoUri(latlng, label)
  if (isAppleDevice()) {
    const lbl = label ? `&q=${encodeURIComponent(label)}` : ''
    return `https://maps.apple.com/?ll=${latlng.lat},${latlng.lng}${lbl}`
  }
  return googleMapsShowUrl(latlng, label)
}

/**
 * Best-effort URL to "build a driving route to coordinates" in user's preferred nav.
 * On Android — geo: URI (chooser opens — most apps accept it as a destination).
 * On iOS — Apple Maps directions deep link.
 * Elsewhere — Google Maps directions HTTPS.
 */
export function directionsHref(latlng: LatLng, label?: string): string {
  if (isAndroid()) return geoUri(latlng, label)
  if (isAppleDevice()) return appleMapsDirectionsUrl(latlng)
  return googleMapsDirectionsUrl(latlng)
}
