import L from 'leaflet'

const DEFAULT_COLOR = '#EF4444'
const HEX_COLOR_REGEX = /^#([0-9A-F]{3}|[0-9A-F]{6})$/i

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

const OFFER_CAR_SVG =
  '<svg width="14" height="14" viewBox="0 0 256 256" fill="#FFFFFF" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M240,112H229.2L201.9,49.6A16,16,0,0,0,186.8,40H69.2a16,16,0,0,0-15.1,9.6L26.8,112H16a8,8,0,0,0,0,16h8v64a16,16,0,0,0,16,16H64a16,16,0,0,0,16-16V168h96v32a16,16,0,0,0,16,16h24a16,16,0,0,0,16-16V128h8a8,8,0,0,0,0-16ZM69.2,56H186.8l24,64H45.2ZM64,208H40V168H64Zm128,0V168h24v40Z"/></svg>'

const offerPickupIconCache = new Map<string, L.DivIcon>()

export function makeOfferPickupIcon(options: {
  size?: number
  subdued?: boolean
  selected?: boolean
  booked?: boolean
} = {}): L.DivIcon {
  const { size = 32, subdued = false, selected = false, booked = false } = options
  const effectiveSize = subdued ? 28 : size
  const cacheKey = `${effectiveSize}-${subdued}-${selected}-${booked}`
  const cached = offerPickupIconCache.get(cacheKey)
  if (cached) return cached

  const opacity = subdued ? 0.55 : 1
  const scale = subdued ? 0.9 : selected ? 1.05 : 1
  const bg = booked ? '#16A34A' : '#000'
  const ring = selected
    ? `box-shadow:0 0 0 3px #fff,0 0 0 5px ${bg},0 2px 8px rgba(0,0,0,0.15);`
    : 'box-shadow:0 2px 8px rgba(0,0,0,0.15);'
  const bookedMark = booked
    ? '<div style="position:absolute;right:-2px;top:-2px;width:14px;height:14px;border-radius:50%;background:#fff;color:#16A34A;font-size:10px;font-weight:800;line-height:14px;text-align:center;border:1px solid #16A34A;">✓</div>'
    : ''

  const icon = L.divIcon({
    className: '',
    html: `<div style="position:relative;opacity:${opacity};transform:scale(${scale});transform-origin:center center;">
  <div style="width:${effectiveSize}px;height:${effectiveSize}px;border-radius:50%;background:${bg};border:3px solid #fff;display:flex;align-items:center;justify-content:center;${ring}">
    ${booked ? '' : OFFER_CAR_SVG}
    ${booked ? '<span style="color:#fff;font-size:14px;font-weight:800;line-height:1;">✓</span>' : ''}
  </div>
  ${bookedMark}
</div>`,
    iconSize: [effectiveSize, effectiveSize],
    iconAnchor: [effectiveSize / 2, effectiveSize / 2],
  })

  offerPickupIconCache.set(cacheKey, icon)
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
