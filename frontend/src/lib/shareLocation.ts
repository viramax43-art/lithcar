import type { LatLng } from '../types'
import { openExternalLink } from './telegram'

export function locationShareUrl(point: LatLng, label: string): string {
  if (
    !Number.isFinite(point.lat) ||
    !Number.isFinite(point.lng) ||
    Math.abs(point.lat) > 90 ||
    Math.abs(point.lng) > 180
  ) {
    throw new Error('Invalid location')
  }
  const map = `https://www.google.com/maps/search/?api=1&query=${point.lat},${point.lng}`
  return `https://t.me/share/url?${new URLSearchParams({ url: map, text: label })}`
}

export function shareLocation(point: LatLng, label: string): void {
  openExternalLink(locationShareUrl(point, label))
}
