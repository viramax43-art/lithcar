import type { LatLng } from '../types'

/**
 * Reserved for the passenger's own booked ride. It is deliberately excluded
 * from the regular palette so "my ride" can never look like somebody else's.
 */
export const OWN_OFFER_COLOR = '#16A34A'

/**
 * Saturated, sufficiently dark colours: they stay readable under a white
 * marker border and as a 2px route line on a light map. Green is omitted on
 * purpose — it is reserved for OWN_OFFER_COLOR.
 */
export const OFFER_COLOR_PALETTE = [
  '#2563EB',
  '#F97316',
  '#9333EA',
  '#0D9488',
  '#DB2777',
  '#CA8A04',
  '#4F46E5',
  '#DC2626',
  '#0891B2',
  '#7C2D12',
  '#C026D3',
  '#475569',
] as const

export interface OfferColorInput {
  id: string
  bookedByMe?: boolean
}

export interface OfferRoutePoints {
  from: { latlng: LatLng }
  to: { latlng: LatLng }
}

export interface OfferViewportBounds {
  south: number
  west: number
  north: number
  east: number
}

/** FNV-1a keeps the same offer colour across renders and list reorderings. */
export function offerColorSeed(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function findFreePaletteColor(
  usedColors: ReadonlySet<string>,
  start: number,
  palette: readonly string[],
): string | null {
  for (let offset = 0; offset < palette.length; offset += 1) {
    const forward = palette[(start + offset) % palette.length]
    if (!usedColors.has(forward)) return forward
    if (offset === 0) continue
    const backward = palette[(start - offset + palette.length) % palette.length]
    if (!usedColors.has(backward)) return backward
  }
  return null
}

/**
 * When more rides are visible than the palette has slots, generate additional
 * hues instead of reusing a colour already present in the viewport. The hue
 * range around OWN_OFFER_COLOR (green) is skipped so an overflow colour can
 * never be mistaken for the passenger's own ride.
 */
function overflowOfferColor(seed: number, overflowIndex: number): string {
  const rawHue = Math.round((seed % 360 + overflowIndex * 137.508) % 360)
  const hue = rawHue >= 105 && rawHue <= 180 ? (rawHue + 75) % 360 : rawHue
  const lightness = overflowIndex % 2 === 0 ? 42 : 52
  return `hsl(${hue} 72% ${lightness}%)`
}

/**
 * Assigns one colour per ride for the rides currently visible in the map.
 *
 * Offers are sorted by a stable hash and get their preferred palette slot;
 * collisions are resolved by probing the nearest free slot. As a result every
 * ride in the viewport has a different colour and the list order never matters.
 *
 * `previous` (the result of the previous call) keeps colours that are already
 * on screen when a poll adds/removes rides or the viewport changes; only new
 * rides receive new colours. Entries for rides that are no longer present are
 * ignored, so the palette is not consumed by invisible rides.
 */
export function assignOfferColors(
  offers: readonly OfferColorInput[],
  palette: readonly string[] = OFFER_COLOR_PALETTE,
  previous?: ReadonlyMap<string, string>,
): Map<string, string> {
  const result = new Map<string, string>()
  if (palette.length === 0) return result

  const unique = new Map<string, OfferColorInput>()
  for (const offer of offers) unique.set(offer.id, offer)

  const regularOffers = [...unique.values()]
    .filter((offer) => !offer.bookedByMe)
    .sort((left, right) => {
      const seedDiff = offerColorSeed(left.id) - offerColorSeed(right.id)
      return seedDiff !== 0 ? seedDiff : left.id.localeCompare(right.id)
    })

  const usedColors = new Set<string>()
  const pending: OfferColorInput[] = []

  for (const offer of regularOffers) {
    const previousColor = previous?.get(offer.id)
    if (
      previousColor &&
      previousColor !== OWN_OFFER_COLOR &&
      !usedColors.has(previousColor)
    ) {
      usedColors.add(previousColor)
      result.set(offer.id, previousColor)
    } else {
      pending.push(offer)
    }
  }

  let overflowCount = 0

  for (const offer of pending) {
    const seed = offerColorSeed(offer.id)
    const paletteColor = findFreePaletteColor(usedColors, seed % palette.length, palette)
    if (paletteColor) {
      usedColors.add(paletteColor)
      result.set(offer.id, paletteColor)
      continue
    }

    let overflowColor = overflowOfferColor(seed, overflowCount)
    overflowCount += 1
    while (usedColors.has(overflowColor)) {
      overflowColor = overflowOfferColor(seed, overflowCount)
      overflowCount += 1
    }
    usedColors.add(overflowColor)
    result.set(offer.id, overflowColor)
  }

  for (const offer of unique.values()) {
    if (offer.bookedByMe) result.set(offer.id, OWN_OFFER_COLOR)
  }

  return result
}

/** Stable fallback for an offer outside the current viewport (e.g. selected from a list). */
export function fallbackOfferColor(
  offerId: string,
  palette: readonly string[] = OFFER_COLOR_PALETTE,
): string {
  if (palette.length === 0) return OWN_OFFER_COLOR
  return palette[offerColorSeed(offerId) % palette.length]
}

export function sameViewportBounds(
  left: OfferViewportBounds | null,
  right: OfferViewportBounds | null,
): boolean {
  if (left === right) return true
  if (!left || !right) return false
  const epsilon = 1e-9
  return (
    Math.abs(left.south - right.south) < epsilon &&
    Math.abs(left.west - right.west) < epsilon &&
    Math.abs(left.north - right.north) < epsilon &&
    Math.abs(left.east - right.east) < epsilon
  )
}

function pointInBounds(point: LatLng, bounds: OfferViewportBounds): boolean {
  return (
    point.lat >= bounds.south &&
    point.lat <= bounds.north &&
    point.lng >= bounds.west &&
    point.lng <= bounds.east
  )
}

function orientation(a: LatLng, b: LatLng, c: LatLng): number {
  const value = (b.lng - a.lng) * (c.lat - a.lat) - (b.lat - a.lat) * (c.lng - a.lng)
  if (Math.abs(value) < 1e-12) return 0
  return value > 0 ? 1 : 2
}

function onSegment(a: LatLng, b: LatLng, c: LatLng): boolean {
  return (
    b.lng <= Math.max(a.lng, c.lng) + 1e-12 &&
    b.lng >= Math.min(a.lng, c.lng) - 1e-12 &&
    b.lat <= Math.max(a.lat, c.lat) + 1e-12 &&
    b.lat >= Math.min(a.lat, c.lat) - 1e-12
  )
}

function segmentsIntersect(a: LatLng, b: LatLng, c: LatLng, d: LatLng): boolean {
  const o1 = orientation(a, b, c)
  const o2 = orientation(a, b, d)
  const o3 = orientation(c, d, a)
  const o4 = orientation(c, d, b)

  if (o1 !== o2 && o3 !== o4) return true
  if (o1 === 0 && onSegment(a, c, b)) return true
  if (o2 === 0 && onSegment(a, d, b)) return true
  if (o3 === 0 && onSegment(c, a, d)) return true
  if (o4 === 0 && onSegment(c, b, d)) return true
  return false
}

/**
 * True when any part of the A→B ride is visible. Checking only endpoints is
 * not enough: a long ride can cross the viewport while both endpoints stay
 * outside the screen.
 */
export function offerIntersectsViewport(
  offer: OfferRoutePoints,
  bounds: OfferViewportBounds,
  paddingRatio = 0.08,
): boolean {
  const latPadding = Math.abs(bounds.north - bounds.south) * paddingRatio
  const lngPadding = Math.abs(bounds.east - bounds.west) * paddingRatio
  const padded: OfferViewportBounds = {
    south: bounds.south - latPadding,
    west: bounds.west - lngPadding,
    north: bounds.north + latPadding,
    east: bounds.east + lngPadding,
  }

  const from = offer.from.latlng
  const to = offer.to.latlng
  if (pointInBounds(from, padded) || pointInBounds(to, padded)) return true

  const topLeft: LatLng = { lat: padded.north, lng: padded.west }
  const topRight: LatLng = { lat: padded.north, lng: padded.east }
  const bottomLeft: LatLng = { lat: padded.south, lng: padded.west }
  const bottomRight: LatLng = { lat: padded.south, lng: padded.east }

  return (
    segmentsIntersect(from, to, topLeft, topRight) ||
    segmentsIntersect(from, to, topRight, bottomRight) ||
    segmentsIntersect(from, to, bottomRight, bottomLeft) ||
    segmentsIntersect(from, to, bottomLeft, topLeft)
  )
}
