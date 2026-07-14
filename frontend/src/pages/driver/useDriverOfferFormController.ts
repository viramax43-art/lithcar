import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import L from 'leaflet'
import { createDriverOffer, getPricing, listServiceZones } from '../../lib/backend'
import { DEFAULT_PRICING_SETTINGS } from '../../lib/pricingDefaults'
import {
  RateLimitedError,
  isRateLimited,
  rateLimitRetryInMs,
  reverseGeocode as nominatimReverse,
  searchPlaces as nominatimSearch,
  type NominatimSearchResult,
} from '../../lib/geocode'
import { hapticImpact, hapticNotification, hapticSelection } from '../../lib/telegram'
import type { LatLng, PricingSettings, ServiceZone } from '../../types'
import { coordsNear } from '../../utils/geo'
import {
  isPickupZoneCheckActive,
  resolvePickupLocation,
} from '../../utils/serviceZones'
import type { MutableRefObject } from 'react'
import { resolveGeocodeSearchScope } from '../../lib/mapRegion'
import { DEFAULT_PIN_ANCHOR_Y_FRAC } from '../../lib/mapPinAnchor'

export function useDriverOfferFormController(
  onSuccess: () => void,
  pinAnchorYFracRef?: MutableRefObject<number>,
) {
  const { t } = useTranslation()
  const [pricing, setPricing] = useState<PricingSettings>(DEFAULT_PRICING_SETTINGS)
  const [serviceZones, setServiceZones] = useState<ServiceZone[]>([])
  const [totalSeatsInput, setTotalSeatsInput] = useState('1')

  const parsedTotalSeats = useMemo(() => {
    const trimmed = totalSeatsInput.trim()
    if (!trimmed) return null
    const value = Number.parseInt(trimmed, 10)
    if (!Number.isFinite(value)) return null
    return value
  }, [totalSeatsInput])
  const activeZones = useMemo(
    () => serviceZones.filter((z) => z.isActive),
    [serviceZones],
  )
  const hasZones = activeZones.length > 0
  const resolveSearchScope = useCallback(() => {
    const map = mapRef.current
    const center = map?.getCenter()
    return resolveGeocodeSearchScope(
      activeZones,
      center ? { lat: center.lat, lng: center.lng } : null,
    )
  }, [activeZones])

  const [activeField, setActiveField] = useState<'from' | 'to'>('from')
  const [fromPoint, setFromPoint] = useState<LatLng | null>(null)
  const [toPoint, setToPoint] = useState<LatLng | null>(null)
  const [fromAddress, setFromAddress] = useState('')
  const [toAddress, setToAddress] = useState('')
  const [dateTime, setDateTime] = useState('')

  const [pinLatLng, setPinLatLng] = useState<LatLng | null>(null)
  const [pinAddress, setPinAddress] = useState('')
  const [pickupToast, setPickupToast] = useState<string | null>(null)
  const [isPanning, setIsPanning] = useState(false)
  const [isResolving, setIsResolving] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<NominatimSearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [zoneWarning, setZoneWarning] = useState<string | null>(null)
  const [isLocating, setIsLocating] = useState(false)

  const mapRef = useRef<L.Map | null>(null)
  const fallbackPinAnchorRef = useRef(DEFAULT_PIN_ANCHOR_Y_FRAC)
  const anchorRef = pinAnchorYFracRef ?? fallbackPinAnchorRef
  const armPinFromMapCenterRef = useRef<() => void>(() => {})
  const pinLatLngRef = useRef(pinLatLng)
  pinLatLngRef.current = pinLatLng
  const skipPinCommitCountRef = useRef(0)
  const blockAutoPinOnceRef = useRef(false)
  const reverseTimer = useRef<ReturnType<typeof setTimeout>>()
  const reverseAbort = useRef<AbortController | null>(null)
  const reverseSeq = useRef(0)
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>()
  const searchAbort = useRef<AbortController | null>(null)
  const zoneWarningTimer = useRef<ReturnType<typeof setTimeout>>()
  const pickupToastTimer = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const [pricingData, zonesData] = await Promise.all([
          getPricing('cookie'),
          listServiceZones('cookie', { limit: 500, offset: 0 }),
        ])
        if (cancelled) return
        setPricing(pricingData)
        setServiceZones(zonesData.items)
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : t('errors.loadDataFailed', { defaultValue: 'Failed to load data.' }))
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [t])

  const showZoneWarning = useCallback((msg: string) => {
    setZoneWarning(msg)
    if (zoneWarningTimer.current) clearTimeout(zoneWarningTimer.current)
    zoneWarningTimer.current = setTimeout(() => setZoneWarning(null), 3000)
  }, [])

  const showPickupToast = useCallback(() => {
    setPickupToast(t('passenger.pickupAvailableHere', { defaultValue: 'Pickup available here' }))
    if (pickupToastTimer.current) clearTimeout(pickupToastTimer.current)
    pickupToastTimer.current = setTimeout(() => setPickupToast(null), 4000)
  }, [t])

  const cancelPinResolution = useCallback(() => {
    reverseSeq.current += 1
    if (reverseTimer.current) clearTimeout(reverseTimer.current)
    if (reverseAbort.current) {
      reverseAbort.current.abort()
      reverseAbort.current = null
    }
    setPinLatLng(null)
    setPinAddress('')
    setIsResolving(false)
  }, [])

  const effectiveField: 'from' | 'to' = !fromPoint ? 'from' : !toPoint ? 'to' : activeField
  const pickupZoneCheckActive = isPickupZoneCheckActive(effectiveField, hasZones)

  const panMapToTarget = useCallback((target: LatLng, zoom = 15) => {
    const map = mapRef.current
    if (!map) return
    skipPinCommitCountRef.current += 1
    const z = Math.max(map.getZoom(), zoom)
    const targetPx = map.project([target.lat, target.lng], z)
    const size = map.getSize()
    const dy = size.y * (0.5 - anchorRef.current)
    const desiredCenterPx = targetPx.add(L.point(0, dy))
    const newCenter = map.unproject(desiredCenterPx, z)
    map.flyTo(newCenter, z, { duration: 0.5 })
  }, [anchorRef])

  const commitPin = useCallback(
    (latlng: LatLng) => {
      if (showSearch) return
      if (fromPoint && toPoint) return

      const prev = pinLatLngRef.current
      if (prev && coordsNear(prev, latlng)) {
        setIsResolving(false)
        return
      }

      setPinLatLng(latlng)
      setPinAddress('')
      if (reverseTimer.current) clearTimeout(reverseTimer.current)
      if (reverseAbort.current) {
        reverseAbort.current.abort()
        reverseAbort.current = null
      }
      setIsResolving(true)
      const seq = ++reverseSeq.current
      reverseTimer.current = setTimeout(async () => {
        const fallbackAddress = `${latlng.lat.toFixed(4)}, ${latlng.lng.toFixed(4)}`
        try {
          if (isRateLimited()) {
            showZoneWarning(t('geo.rateLimitRetry', { seconds: Math.ceil(rateLimitRetryInMs() / 1000), defaultValue: 'Too many map requests.' }))
            if (seq === reverseSeq.current) setPinAddress(fallbackAddress)
            return
          }
          const controller = new AbortController()
          reverseAbort.current = controller
          const addr = await nominatimReverse(latlng, controller.signal)
          if (seq !== reverseSeq.current) return
          setPinAddress(addr || fallbackAddress)
        } catch (err) {
          if (seq !== reverseSeq.current) return
          if ((err as Error)?.name === 'AbortError') {
            setPinAddress(fallbackAddress)
            return
          }
          setPinAddress(fallbackAddress)
        } finally {
          if (seq === reverseSeq.current) setIsResolving(false)
        }
      }, 700)
    },
    [fromPoint, showSearch, showZoneWarning, toPoint, t],
  )

  const armPinFromMapCenter = useCallback(() => {
    if (blockAutoPinOnceRef.current) {
      blockAutoPinOnceRef.current = false
      return
    }
    const map = mapRef.current
    if (!map) return
    const size = map.getSize()
    const px = L.point(size.x * 0.5, size.y * anchorRef.current)
    const ll = map.containerPointToLatLng(px)
    commitPin({ lat: ll.lat, lng: ll.lng })
  }, [commitPin, anchorRef])

  armPinFromMapCenterRef.current = armPinFromMapCenter

  const confirmPoint = useCallback(() => {
    if (!pinLatLng) return
    const fieldForZone: 'from' | 'to' = !fromPoint ? 'from' : !toPoint ? 'to' : activeField
    if (isPickupZoneCheckActive(fieldForZone, hasZones)) {
      const preview = resolvePickupLocation(pinLatLng, activeZones)
      if (preview.snapped && preview.zone) {
        blockAutoPinOnceRef.current = true
        cancelPinResolution()
        panMapToTarget(preview.latlng)
        showPickupToast()
        return
      }
    }
    const resolved = pinAddress || `${pinLatLng.lat.toFixed(4)}, ${pinLatLng.lng.toFixed(4)}`
    if (!fromPoint) {
      setFromPoint(pinLatLng)
      setFromAddress(resolved)
      setActiveField('to')
      hapticImpact('light')
      window.setTimeout(() => armPinFromMapCenter(), 200)
    } else if (!toPoint) {
      setToPoint(pinLatLng)
      setToAddress(resolved)
      hapticImpact('medium')
    }
    cancelPinResolution()
  }, [pinLatLng, pinAddress, fromPoint, toPoint, activeField, activeZones, hasZones, armPinFromMapCenter, cancelPinResolution, panMapToTarget, showPickupToast])

  const commitPinFromMap = useCallback(
    (latlng: LatLng) => {
      if (skipPinCommitCountRef.current > 0) {
        skipPinCommitCountRef.current -= 1
        return
      }
      commitPin(latlng)
    },
    [commitPin],
  )

  const handleSearch = useCallback(
    (query: string) => {
      setSearchQuery(query)
      if (searchTimeout.current) clearTimeout(searchTimeout.current)
      if (searchAbort.current) {
        searchAbort.current.abort()
        searchAbort.current = null
      }
      if (query.length < 3) {
        setSearchResults([])
        setIsSearching(false)
        return
      }
      setIsSearching(true)
      searchTimeout.current = setTimeout(async () => {
        try {
          const controller = new AbortController()
          searchAbort.current = controller
          const results = await nominatimSearch(query, controller.signal, resolveSearchScope())
          setSearchResults(results)
        } catch {
          setSearchResults([])
        } finally {
          setIsSearching(false)
        }
      }, 400)
    },
    [resolveSearchScope],
  )

  const handleSelectSearchResult = useCallback(
    (result: NominatimSearchResult) => {
      const latlng = { lat: parseFloat(result.lat), lng: parseFloat(result.lon) }
      const shortName = result.display_name.split(',').slice(0, 3).join(',')
      if (!fromPoint) {
        setFromPoint(latlng)
        setFromAddress(shortName)
        setActiveField('to')
        hapticSelection()
      } else if (!toPoint) {
        setToPoint(latlng)
        setToAddress(shortName)
        hapticSelection()
      } else if (activeField === 'from') {
        setFromPoint(latlng)
        setFromAddress(shortName)
        hapticSelection()
      } else {
        setToPoint(latlng)
        setToAddress(shortName)
        hapticSelection()
      }
      setShowSearch(false)
      setSearchQuery('')
      setSearchResults([])
      panMapToTarget(latlng)
    },
    [activeField, fromPoint, panMapToTarget, toPoint],
  )

  const handleLocateMe = useCallback(() => {
    if (!navigator.geolocation) return
    setIsLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsLocating(false)
        panMapToTarget({ lat: pos.coords.latitude, lng: pos.coords.longitude }, 16)
      },
      () => setIsLocating(false),
      { enableHighAccuracy: true, timeout: 8000 },
    )
  }, [panMapToTarget])

  const handleSeatsInputChange = useCallback((raw: string) => {
    setTotalSeatsInput(raw.replace(/\D/g, ''))
  }, [])

  const normalizeSeatsInput = useCallback(() => {
    setTotalSeatsInput((current) => {
      const value = Number.parseInt(current, 10)
      if (!Number.isFinite(value) || value < 1) return '1'
      return String(value)
    })
  }, [])

  const handleSubmit = useCallback(async () => {
    const [datePart, timePart] = dateTime.split('T')
    if (!fromPoint || !toPoint || !datePart || !timePart || parsedTotalSeats === null) return
    if (parsedTotalSeats < 1) return
    setSubmitting(true)
    setErrorMessage(null)
    try {
      await createDriverOffer({
        fromPoint: { address: fromAddress, latlng: fromPoint },
        toPoint: { address: toAddress, latlng: toPoint },
        dateTime: `${datePart}T${timePart}`,
        totalSeats: parsedTotalSeats,
      })
      hapticNotification('success')
      onSuccess()
    } catch (error) {
      hapticNotification('error')
      setErrorMessage(error instanceof Error ? error.message : t('errors.submitRequestFailed', { defaultValue: 'Failed to submit.' }))
    } finally {
      setSubmitting(false)
    }
  }, [dateTime, fromAddress, fromPoint, onSuccess, parsedTotalSeats, t, toAddress, toPoint])

  useEffect(() => {
    if (fromPoint && toPoint) return
    if (showSearch) return
    const timer = window.setTimeout(() => armPinFromMapCenterRef.current(), 350)
    return () => window.clearTimeout(timer)
  }, [fromPoint, toPoint, activeField, showSearch])

  const [draftDatePart, draftTimePart] = dateTime.split('T')
  const hasValidDateTime = Boolean(draftDatePart && draftTimePart)
  const canSubmit = Boolean(
    fromPoint &&
      toPoint &&
      hasValidDateTime &&
      !submitting &&
      parsedTotalSeats !== null &&
      parsedTotalSeats >= 1,
  )
  const activeIsFrom = effectiveField === 'from'
  const isPinLive = !(fromPoint && toPoint)
  const pinReadyForConfirm = Boolean(pinLatLng && !isResolving)

  return {
    pricing,
    hasZones,
    activeZones,
    pickupZoneCheckActive,
    pickupToast,
    setPickupToast,
    activeField,
    setActiveField,
    fromPoint,
    setFromPoint,
    toPoint,
    setToPoint,
    fromAddress,
    setFromAddress,
    toAddress,
    setToAddress,
    dateTime,
    setDateTime,
    totalSeatsInput,
    handleSeatsInputChange,
    normalizeSeatsInput,
    pinLatLng,
    pinAddress,
    isPanning,
    setIsPanning,
    isResolving,
    showSearch,
    setShowSearch,
    searchQuery,
    setSearchQuery,
    handleSearch,
    searchResults,
    setSearchResults,
    isSearching,
    submitting,
    errorMessage,
    zoneWarning,
    setZoneWarning,
    isLocating,
    mapRef,
    commitPin,
    commitPinFromMap,
    confirmPoint,
    armPinFromMapCenter,
    handleSelectSearchResult,
    handleLocateMe,
    handleSubmit,
    canSubmit,
    activeIsFrom,
    isPinLive,
    pinReadyForConfirm,
  }
}
