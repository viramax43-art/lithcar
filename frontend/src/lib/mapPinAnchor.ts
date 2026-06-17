export const DEFAULT_PIN_ANCHOR_Y_FRAC = 0.5

/** Vertical fraction (0–1) of the map where the selection pin sits — center of the unobstructed area. */
export function computePinAnchorYFrac(mapHeightPx: number, obstructionBottomPx: number): number {
  if (mapHeightPx <= 0) return DEFAULT_PIN_ANCHOR_Y_FRAC
  const visibleHeight = Math.max(0, mapHeightPx - obstructionBottomPx)
  if (visibleHeight <= 0) return DEFAULT_PIN_ANCHOR_Y_FRAC
  return visibleHeight / 2 / mapHeightPx
}

export function pinTopCss(frac: number): string {
  return `${frac * 100}%`
}

export function pinLabelTopCss(frac: number): string {
  return `calc(${frac * 100}% - 88px)`
}
