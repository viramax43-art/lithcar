import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import L from 'leaflet'
import { createRequest, getCurrentUser, getPricing, getRideQuote, listServiceZones } from '../../../lib/backend'
import { ensurePassengerAccessToken } from '../../../infrastructure/auth/passengerAuthSession'
import { DEFAULT_PRICING_SETTINGS } from '../../../lib/pricingDefaults'
import {
  RateLimitedError,
  isRateLimited,
  rateLimitRetryInMs,
  reverseGeocode as nominatimReverse,
  searchPlaces as nominatimSearch,
  type NominatimSearchResult,
} from '../../../lib/geocode'
import { hapticImpact, hapticNotification, hapticSelection } from '../../../lib/telegram'
import type { LatLng, PricingSettings, RideQuote, ServiceZone } from '../../../types'
import { coordsNear } from '../../../utils/geo'
import {
  isPickupZoneCheckActive,
  resolvePickupLocation,
} from '../../../utils/serviceZones'
import type { MutableRefObject } from 'react'
import { resolveGeocodeSearchScope } from '../../../lib/mapRegion'
import { DEFAULT_PIN_ANCHOR_Y_FRAC } from '../../../lib/mapPinAnchor'

const STORAGE_KEY = 'ride_new_request_draft'

interface RequestDraft {
  fromPoint: LatLng | null
  toPoint: LatLng | null
  fromAddress: string
  toAddress: string
  dateTime: string
  activeField: 'from' | 'to'
}

function loadDraft(): Partial<RequestDraft> {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as Partial<RequestDraft>
  } catch {
    return {}
  }
}

function saveDraft(draft: RequestDraft): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draft))
  } catch { /* quota exceeded — ignore */ }
}

function clearDraft(): void {
  try { sessionStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
}

export function useNewRequestController(pinAnchorYFracRef?: MutableRefObject<number>) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const [pricing, setPricing] = useState<PricingSettings>(DEFAULT_PRICING_SETTINGS)
  const [quote, setQuote] = useState<RideQuote | null>(null)
  const [quoteLoading, setQuoteLoading] = useState(false)
  const [quoteError, setQuoteError] = useState<string | null>(null)
  const [serviceZones, setServiceZones] = useState<ServiceZone[]>([])
  const [passengerName, setPassengerName] = useState(() =>
    t('passenger.defaultUserName', { defaultValue: 'Current user' }),
  )
  const activeZones = useMemo(
    () => serviceZones.filter((z) => z.isActive),
    [serviceZones],
  )
  const hasZones = activeZones.length > 0

  const draft = useRef(loadDraft()).current
  const [activeField, setActiveField] = useState<'from' | 'to'>(draft.activeField ?? 'from')
  const [fromPoint, setFromPoint] = useState<LatLng | null>(draft.fromPoint ?? null)
  const [toPoint, setToPoint] = useState<LatLng | null>(draft.toPoint ?? null)
  const [fromAddress, setFromAddress] = useState(draft.fromAddress ?? '')
  const [toAddress, setToAddress] = useState(draft.toAddress ?? '')
  const [dateTime, setDateTime] = useState(draft.dateTime ?? '')

  const [pinLatLng, setPinLatLng] = useState<LatLng | null>(null)
  const [pinAddress, setPinAddress] = useState('')
  const [pickupToast, setPickupToast] = useState<string | null>(null)

  const [isPanning, setIsPanning] = useState(false)
  const [isResolving, setIsResolving] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<NominatimSearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [zoneWarning, setZoneWarning] = useState<string | null>(null)
  const [isLocating, setIsLocating] = useState(false)

  const mapRef = useRef<L.Map | null>(null)
  const resolveSearchScope = useCallback(() => {
    const map = mapRef.current
    const center = map?.getCenter()
    return resolveGeocodeSearchScope(
      activeZones,
      center ? { lat: center.lat, lng: center.lng } : null,
    )
  }, [activeZones])
  const fallbackPinAnchorRef = useRef(DEFAULT_PIN_ANCHOR_Y_FRAC)
  const anchorRef = pinAnchorYFracRef ?? fallbackPinAnchorRef
  const armPinFromMapCenterRef = useRef<() => void>(() => {})
  const pinLatLngRef = useRef(pinLatLng)
  pinLatLngRef.current = pinLatLng
  const pinAddressRef = useRef(pinAddress)
  pinAddressRef.current = pinAddress
  const skipPinCommitCountRef = useRef(0)
  const blockAutoPinOnceRef = useRef(false)
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>()
  const zoneWarningTimer = useRef<ReturnType<typeof setTimeout>>()
  const pickupToastTimer = useRef<ReturnType<typeof setTimeout>>()
  const reverseTimer = useRef<ReturnType<typeof setTimeout>>()
  const reverseAbort = useRef<AbortController | null>(null)
  const searchAbort = useRef<AbortController | null>(null)
  const reverseSeq = useRef(0)
  const quoteTimeout = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        await ensurePassengerAccessToken()
        const [pricingData, zonesData, me] = await Promise.all([
          getPricing(),
          listServiceZones('bearer', { limit: 500, offset: 0 }),
          getCurrentUser(),
        ])
        if (cancelled) return
        setPricing(pricingData)
        setServiceZones(zonesData.items)
        setPassengerName(me.username || me.user_id)
      } catch (error) {
        if (cancelled) return
        setErrorMessage(error instanceof Error ? error.message : t('errors.loadDataFailed', { defaultValue: 'Failed to load data.' }))
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
            showZoneWarning(
              t('geo.rateLimitRetry', {
                seconds: Math.ceil(rateLimitRetryInMs() / 1000),
                defaultValue: `Too many map requests. Retry in ~${Math.ceil(rateLimitRetryInMs() / 1000)} sec.`,
              }),
            )
            if (seq === reverseSeq.current) {
              setPinAddress(fallbackAddress)
            }
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
            // Timeout or cancelled — show coordinates so the user can still confirm.
            setPinAddress(fallbackAddress)
            return
          }
          if (err instanceof RateLimitedError) {
            showZoneWarning(t('geo.rateLimitRetry30', { defaultValue: 'Too many map requests. Retry in 30 sec.' }))
          }
          setPinAddress(fallbackAddress)
        } finally {
          // Always clear the spinner for the latest pin request — stale/aborted runs must not leave it stuck.
          if (seq === reverseSeq.current) {
            setIsResolving(false)
          }
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
    setZoneWarning(null)
    setPickupToast(null)
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
      searchTimeout.current = setTimeout(async () => {
        if (isRateLimited()) {
          showZoneWarning(
            t('geo.rateLimitRetry', {
              seconds: Math.ceil(rateLimitRetryInMs() / 1000),
              defaultValue: `Too many map requests. Retry in ~${Math.ceil(rateLimitRetryInMs() / 1000)} sec.`,
            }),
          )
          return
        }
        setIsSearching(true)
        const controller = new AbortController()
        searchAbort.current = controller
        try {
          const data = await nominatimSearch(query, controller.signal, resolveSearchScope())
          setSearchResults(data)
        } catch (err) {
          if ((err as Error)?.name === 'AbortError') return
          setSearchResults([])
          if (err instanceof RateLimitedError) {
            showZoneWarning(t('geo.rateLimitRetry30', { defaultValue: 'Too many map requests. Retry in 30 sec.' }))
          }
        } finally {
          setIsSearching(false)
        }
      }, 600)
    },
    [showZoneWarning, t, resolveSearchScope],
  )

  useEffect(() => {
    const q = searchQuery
    if (q.length >= 3) {
      if (searchAbort.current) {
        searchAbort.current.abort()
        searchAbort.current = null
      }
      setIsSearching(true)
      const controller = new AbortController()
      searchAbort.current = controller
      void (async () => {
        try {
          const data = await nominatimSearch(q, controller.signal, resolveSearchScope())
          setSearchResults(data)
        } catch {
          setSearchResults([])
        } finally {
          setIsSearching(false)
        }
      })()
    } else {
      setSearchResults([])
    }

    if (pinLatLng) {
      // Refresh label in the new language without bumping reverseSeq — that would
      // orphan an in-flight commitPin() and leave isResolving stuck forever.
      const snapshot = pinLatLng
      void (async () => {
        try {
          const addr = await nominatimReverse(snapshot)
          const current = pinLatLngRef.current
          if (current?.lat !== snapshot.lat || current?.lng !== snapshot.lng) return
          setPinAddress(addr || `${snapshot.lat.toFixed(4)}, ${snapshot.lng.toFixed(4)}`)
        } catch {
          /* keep current label */
        }
      })()
    }

    void (async () => {
      if (fromPoint) {
        try {
          const addr = await nominatimReverse(fromPoint)
          if (addr) setFromAddress(addr)
        } catch {
          /* ignore */
        }
      }
      if (toPoint) {
        try {
          const addr = await nominatimReverse(toPoint)
          if (addr) setToAddress(addr)
        } catch {
          /* ignore */
        }
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh geocode labels when language changes
  }, [i18n.language])

  const handleSelectSearchResult = useCallback(
    (result: NominatimSearchResult) => {
      const latlng: LatLng = { lat: parseFloat(result.lat), lng: parseFloat(result.lon) }
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
    if (!navigator.geolocation) {
      showZoneWarning(t('geo.geolocationUnsupported', { defaultValue: 'Geolocation is not supported.' }))
      return
    }
    setIsLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsLocating(false)
        panMapToTarget({ lat: pos.coords.latitude, lng: pos.coords.longitude }, 16)
      },
      () => {
        setIsLocating(false)
        showZoneWarning(t('geo.locationFailed', { defaultValue: 'Could not determine location.' }))
      },
      { enableHighAccuracy: true, timeout: 8000 },
    )
  }, [panMapToTarget, showZoneWarning, t])

  const handleSubmit = useCallback(async () => {
    const [datePart, timePart] = dateTime.split('T')
    if (!fromPoint || !toPoint || !datePart || !timePart) return
    setSubmitting(true)
    setErrorMessage(null)
    try {
      await createRequest({
        passengerName,
        from: { address: fromAddress, latlng: fromPoint },
        to: { address: toAddress, latlng: toPoint },
        dateTime,
      })
      hapticNotification('success')
      setSubmitted(true)
      clearDraft()
      setTimeout(() => navigate('/requests'), 1200)
    } catch (error) {
      hapticNotification('error')
      setErrorMessage(error instanceof Error ? error.message : t('errors.submitRequestFailed', { defaultValue: 'Failed to submit request.' }))
    } finally {
      setSubmitting(false)
    }
  }, [dateTime, fromAddress, fromPoint, navigate, passengerName, toAddress, toPoint, t])

  useEffect(() => {
    if (!fromPoint || !toPoint) {
      setQuote(null)
      setQuoteError(null)
      setQuoteLoading(false)
      return
    }

    if (quoteTimeout.current) clearTimeout(quoteTimeout.current)
    setQuoteLoading(true)
    setQuoteError(null)

    quoteTimeout.current = setTimeout(() => {
      void (async () => {
        try {
          const result = await getRideQuote({
            fromLat: fromPoint.lat,
            fromLng: fromPoint.lng,
            toLat: toPoint.lat,
            toLng: toPoint.lng,
          })
          setQuote(result)
        } catch (error) {
          setQuote(null)
          setQuoteError(error instanceof Error ? error.message : t('errors.quoteFailed', { defaultValue: 'Failed to calculate price.' }))
        } finally {
          setQuoteLoading(false)
        }
      })()
    }, 500)

    return () => {
      if (quoteTimeout.current) clearTimeout(quoteTimeout.current)
    }
  }, [fromPoint, toPoint, pricing.pricingMode, t])

  useEffect(() => {
    saveDraft({ fromPoint, toPoint, fromAddress, toAddress, dateTime, activeField })
  }, [fromPoint, toPoint, fromAddress, toAddress, dateTime, activeField])

  useEffect(() => {
    if (fromPoint && toPoint) return
    if (showSearch) return
    const timer = window.setTimeout(() => armPinFromMapCenterRef.current(), 350)
    return () => window.clearTimeout(timer)
  }, [fromPoint, toPoint, activeField, showSearch])

  useEffect(() => {
    if (!showSearch) return
    if (reverseTimer.current) clearTimeout(reverseTimer.current)
    if (reverseAbort.current) {
      reverseAbort.current.abort()
      reverseAbort.current = null
    }
    setIsResolving(false)
  }, [showSearch])

  useEffect(() => {
    return () => {
      if (searchTimeout.current) clearTimeout(searchTimeout.current)
      if (zoneWarningTimer.current) clearTimeout(zoneWarningTimer.current)
      if (pickupToastTimer.current) clearTimeout(pickupToastTimer.current)
      if (reverseTimer.current) clearTimeout(reverseTimer.current)
      if (reverseAbort.current) reverseAbort.current.abort()
      if (searchAbort.current) searchAbort.current.abort()
      if (quoteTimeout.current) clearTimeout(quoteTimeout.current)
    }
  }, [])

  // Both date and time parts must be set ("2026-06-10T" with an empty time is invalid).
  const [draftDatePart, draftTimePart] = dateTime.split('T')
  const hasValidDateTime = Boolean(draftDatePart && draftTimePart)
  const canSubmit = Boolean(fromPoint && toPoint && hasValidDateTime && !submitting)
  const activeIsFrom = effectiveField === 'from'
  const isPinLive = !(fromPoint && toPoint)
  const isPickingPointA = !fromPoint
  const isPickingPointB = Boolean(fromPoint && !toPoint)
  const pinReadyForConfirm = Boolean(pinLatLng && !isResolving)

  const displayPoints =
    quote?.points ??
    (pricing.pricingMode === 'fixed' ? pricing.pointsPerRide : null)

  return {
    pricing,
    quote,
    quoteLoading,
    quoteError,
    displayPoints,
    passengerName,
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
    pinLatLng,
    pinAddress,
    isPanning,
    setIsPanning,
    isResolving,
    showSearch,
    setShowSearch,
    searchQuery,
    setSearchQuery,
    searchResults,
    setSearchResults,
    isSearching,
    submitted,
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
    handleSearch,
    handleSelectSearchResult,
    handleLocateMe,
    handleSubmit,
    canSubmit,
    hasValidDateTime,
    activeIsFrom,
    isPinLive,
    isPickingPointA,
    isPickingPointB,
    pinReadyForConfirm,
  }
}
