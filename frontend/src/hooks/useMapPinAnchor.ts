import { useCallback, useEffect, useRef, useState, type MutableRefObject, type RefObject } from 'react'
import type L from 'leaflet'
import {
  computePinAnchorYFrac,
  DEFAULT_PIN_ANCHOR_Y_FRAC,
} from '../lib/mapPinAnchor'

interface UseMapPinAnchorOptions {
  mapRef?: MutableRefObject<L.Map | null>
  isPinLive?: boolean
  onAnchorChange?: () => void
  /** Keep pin Y fraction fixed while a point is armed — prevents layout-driven geocode loops. */
  lockAnchorFrac?: boolean
}

/** Ignore sub-pixel layout jitter from spinners / address labels. */
const ANCHOR_FRAC_EPSILON = 0.008
const OBSTRUCTION_PX_EPSILON = 14

export function useMapPinAnchor(
  mapAreaRef: RefObject<HTMLElement | null>,
  bottomSheetRef: RefObject<HTMLElement | null>,
  pinAnchorYFracRef: MutableRefObject<number>,
  options: UseMapPinAnchorOptions = {},
) {
  const { mapRef, isPinLive = false, onAnchorChange, lockAnchorFrac = false } = options
  const [pinAnchorYFrac, setPinAnchorYFrac] = useState(DEFAULT_PIN_ANCHOR_Y_FRAC)
  const [obstructionPx, setObstructionPx] = useState(0)
  const lastObstructionRef = useRef(0)
  const onAnchorChangeRef = useRef(onAnchorChange)
  onAnchorChangeRef.current = onAnchorChange

  const measure = useCallback(() => {
    const mapEl = mapAreaRef.current
    if (!mapEl) return

    const mapRect = mapEl.getBoundingClientRect()
    const mapHeight = mapRect.height
    let obstruction = 0

    const sheetEl = bottomSheetRef.current
    if (sheetEl) {
      const sheetRect = sheetEl.getBoundingClientRect()
      obstruction = Math.max(0, mapRect.bottom - sheetRect.top)
    }

    const frac = computePinAnchorYFrac(mapHeight, obstruction)

    if (lockAnchorFrac) {
      if (Math.abs(obstruction - lastObstructionRef.current) > OBSTRUCTION_PX_EPSILON) {
        lastObstructionRef.current = obstruction
        setObstructionPx(obstruction)
      }
      return
    }

    const changed = Math.abs(frac - pinAnchorYFracRef.current) > ANCHOR_FRAC_EPSILON
      || Math.abs(obstruction - lastObstructionRef.current) > OBSTRUCTION_PX_EPSILON

    if (changed) {
      pinAnchorYFracRef.current = frac
      lastObstructionRef.current = obstruction
      setPinAnchorYFrac(frac)
      setObstructionPx(obstruction)
      onAnchorChangeRef.current?.()
    }
  }, [mapAreaRef, bottomSheetRef, lockAnchorFrac, pinAnchorYFracRef])

  useEffect(() => {
    measure()
    const mapEl = mapAreaRef.current
    const sheetEl = bottomSheetRef.current
    if (!mapEl) return

    const ro = new ResizeObserver(() => measure())
    ro.observe(mapEl)
    if (sheetEl) ro.observe(sheetEl)

    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [measure, mapAreaRef, bottomSheetRef])

  useEffect(() => {
    const map = mapRef?.current
    if (!map) return
    map.invalidateSize()
  }, [pinAnchorYFrac, mapRef])

  return { pinAnchorYFrac, obstructionPx }
}
