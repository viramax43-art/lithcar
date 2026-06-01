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
