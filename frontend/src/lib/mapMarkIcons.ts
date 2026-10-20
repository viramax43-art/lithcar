import L from 'leaflet'

import { offerColorTextColor } from './offerMapColors'

const DEFAULT_COLOR = '#EF4444'
const HEX_COLOR_REGEX = /^#([0-9A-F]{3}|[0-9A-F]{6})$/i
const MARKER_OUTLINE = '#0F172A'
const MARKER_OUTLINE_SHADOW = 'rgba(15,23,42,0.45)'

export const MAP_MARK_PALETTE = [
  '#EF4444',
  '#3B82F6',
  '#22C55E',
  '#F59E0B',
  '#A855F7',
  '#111827',
]

export function normalizeMapMarkColor(value: string | null | undefined): string {
  if (!value) return DEFAULT_COLOR
  const normalized = value.trim().toUpperCase()
  return HEX_COLOR_REGEX.test(normalized) ? normalized : DEFAULT_COLOR
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

const offerEndpointIconCache = new Map<string, L.DivIcon>()

export interface OfferEndpointIconOptions {
  /** A or B. */
  label: string
  /** Shared by both endpoints of one ride. */
  color: string
  /** Reserved green styling, check mark and an optional "your ride" tag. */
  isOwn?: boolean
  selected?: boolean
  subdued?: boolean
  size?: number
  showOwnBadge?: boolean
  ownBadgeLabel?: string
}

/**
 * A/B endpoint badge for a passenger offer. Both endpoints of one ride receive
 * the same colour, which lets a passenger pair them even when many routes
 * overlap at a low zoom level. The passenger's own booking is always green,
 * has a check mark and can show a "your ride" label.
 */
export function makeOfferEndpointIcon(options: OfferEndpointIconOptions): L.DivIcon {
  const {
    label,
    color,
    isOwn = false,
    selected = false,
    subdued = false,
    size = 30,
    showOwnBadge = false,
    ownBadgeLabel = '',
  } = options

  const effectiveSize = subdued && !isOwn ? 28 : size
  const badgeVisible = Boolean(isOwn && showOwnBadge && ownBadgeLabel.trim())
  const badgeText = escapeHtml(ownBadgeLabel.trim())
  const cacheKey = [
    label,
    color,
    isOwn,
    selected,
    subdued,
    effectiveSize,
    badgeVisible,
    badgeText,
  ].join('|')
  const cached = offerEndpointIconCache.get(cacheKey)
  if (cached) return cached

  const opacity = subdued && !isOwn ? 0.55 : 1
  const scale = selected ? 1.08 : subdued && !isOwn ? 0.9 : 1
  const labelColor = offerColorTextColor(color)
  const labelShadow = labelColor === '#FFFFFF' ? '0 1px 2px rgba(0,0,0,0.7)' : 'none'
  // The white inner ring separates the fill from the dark outer ring. That
  // outer ring keeps every badge visible on a light map, while the white ring
  // does the same over dark map features. Selected and own markers get a second
  // white ring so they stay on top of a dense cluster of routes.
  const ring = selected
    ? `0 0 0 2px ${MARKER_OUTLINE},0 0 0 5px #fff,0 0 0 7px ${MARKER_OUTLINE},0 6px 18px ${MARKER_OUTLINE_SHADOW}`
    : isOwn
      ? `0 0 0 2px ${MARKER_OUTLINE},0 0 0 5px #fff,0 0 0 7px ${MARKER_OUTLINE},0 6px 18px rgba(21,128,61,0.5)`
      : `0 0 0 2px ${MARKER_OUTLINE},0 4px 12px ${MARKER_OUTLINE_SHADOW}`
  const checkMark = isOwn
    ? `<div style="position:absolute;right:-4px;top:-4px;width:15px;height:15px;border-radius:50%;background:#fff;color:${color};font-size:10px;font-weight:900;line-height:15px;text-align:center;border:1.5px solid ${color};box-shadow:0 0 0 1px ${MARKER_OUTLINE};box-sizing:border-box;">✓</div>`
    : ''
  const ownBadge = badgeVisible
    ? `<div style="margin-top:3px;padding:2px 6px;border-radius:9999px;background:#fff;color:${color};font-size:9px;font-weight:800;line-height:1.15;white-space:nowrap;border:1px solid ${color};box-shadow:0 1px 5px rgba(0,0,0,0.18);font-family:Inter,system-ui,sans-serif;">${badgeText}</div>`
    : ''
  const totalWidth = Math.max(effectiveSize, badgeVisible ? 96 : effectiveSize)
  const totalHeight = effectiveSize + (badgeVisible ? 20 : 0)

  const icon = L.divIcon({
    className: '',
    html: `<div style="position:relative;display:flex;flex-direction:column;align-items:center;width:${totalWidth}px;opacity:${opacity};transform:scale(${scale});transform-origin:center top;font-family:Inter,system-ui,sans-serif;">
      <div style="position:relative;width:${effectiveSize}px;height:${effectiveSize}px;border-radius:50%;background:${color};border:3px solid #fff;display:flex;align-items:center;justify-content:center;color:${labelColor};text-shadow:${labelShadow};font-size:${Math.round(effectiveSize * 0.4)}px;font-weight:900;box-shadow:${ring};box-sizing:border-box;">
        ${escapeHtml(label)}
        ${checkMark}
      </div>
      ${ownBadge}
    </div>`,
    iconSize: [totalWidth, totalHeight],
    iconAnchor: [totalWidth / 2, effectiveSize / 2],
  })

  offerEndpointIconCache.set(cacheKey, icon)
  return icon
}

export function makeMapMarkIcon(color: string | null | undefined, size = 36): L.DivIcon {
  const fill = normalizeMapMarkColor(color)
  const width = Math.round(size)
  const height = Math.round(size * 1.3)
  const pinRadius = Math.round(width * 0.24)

  return L.divIcon({
    className: '',
    html: `<svg width="${width}" height="${height}" viewBox="0 0 40 52" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <path d="M20 1.5C9.78 1.5 1.5 9.78 1.5 20C1.5 33.87 17.35 47.94 19.15 49.5C19.65 49.93 20.36 49.93 20.86 49.5C22.66 47.94 38.5 33.87 38.5 20C38.5 9.78 30.22 1.5 20 1.5Z" fill="${fill}" stroke="#FFFFFF" stroke-width="2.5"/>
  <circle cx="20" cy="20" r="${pinRadius}" fill="#FFFFFF" fill-opacity="0.88"/>
</svg>`,
    iconSize: [width, height],
    iconAnchor: [width / 2, height - 2],
    popupAnchor: [0, -(height - 8)],
  })
}
