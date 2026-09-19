import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import i18n from '../../i18n'
import { normalizeLanguage } from '../../i18n/languages'
import { getCurrentUser } from '../../infrastructure/api/passengerApi'
import L from 'leaflet'
import { listServiceZones } from '../../lib/backend'
import { ensurePassengerAccessToken } from '../../infrastructure/auth/passengerAuthSession'
import {
  RateLimitedError,
  isRateLimited,
  rateLimitRetryInMs,
  reverseGeocode as nominatimReverse,
  searchPlaces as nominatimSearch,
  type NominatimSearchResult,
} from '../../lib/geocode'
import { closeTelegramWebApp, hapticImpact, hapticNotification, sendTelegramWebAppData } from '../../lib/telegram'
import type { LatLng, ServiceZone } from '../../types'
import { coordsNear } from '../../utils/geo'
import { isPickupZoneCheckActive, resolvePickupLocation } from '../../utils/serviceZones'
import { resolveGeocodeSearchScope } from '../../lib/mapRegion'
import { DEFAULT_PIN_ANCHOR_Y_FRAC } from '../../lib/mapPinAnchor'

export type BotPickField = 'from' | 'to'

export function useBotAddressPicker() {
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const field: BotPickField = searchParams.get('field') === 'to' ? 'to' : 'from'
  const isFrom = field === 'from'

  const [serviceZones, setServiceZones] = useState<ServiceZone[]>([])
  const activeZones = useMemo(() => serviceZones.filter((z) => z.isActive), [serviceZones])
  const hasZones = activeZones.length > 0

  const [pinLatLng, setPinLatLng] = useState<LatLng | null>(null)
  const [pinAddress, setPinAddress] = useState('')
  const [pickupToast, setPickupToast] = useState<string | null>(null)
  const [isPanning, setIsPanning] = useState(false)
  const [isResolving, setIsResolving] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<NominatimSearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [zoneWarning, setZoneWarning] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const mapRef = useRef<L.Map | null>(null)
  const pinAnchorYFracRef = useRef(DEFAULT_PIN_ANCHOR_Y_FRAC)
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
    ;(async () => {
      try {
        await ensurePassengerAccessToken()
        try {
          const user = await getCurrentUser()
          if (!cancelled) {
            await i18n.changeLanguage(normalizeLanguage(user.language))
          }
        } catch {
          // keep locally selected language
        }
        const zonesData = await listServiceZones('bearer', { limit: 500, offset: 0 })
        if (!cancelled) setServiceZones(zonesData.items)
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(
            error instanceof Error ? error.message : t('errors.loadDataFailed', { defaultValue: 'Failed to load data.' }),
          )
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

  const panMapToTarget = useCallback((target: LatLng, zoom = 15) => {
    const map = mapRef.current
    if (!map) return
    skipPinCommitCountRef.current += 1
    const z = Math.max(map.getZoom(), zoom)
    const targetPx = map.project([target.lat, target.lng], z)
    const size = map.getSize()
    const dy = size.y * (0.5 - pinAnchorYFracRef.current)
    const desiredCenterPx = targetPx.add(L.point(0, dy))
    const newCenter = map.unproject(desiredCenterPx, z)
    map.flyTo(newCenter, z, { duration: 0.5 })
  }, [])

  const commitPin = useCallback(
    (latlng: LatLng) => {
      if (showSearch) return
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
          if ((err as Error)?.name !== 'AbortError') {
            if (err instanceof RateLimitedError) {
              showZoneWarning(t('geo.rateLimitRetry30', { defaultValue: 'Too many map requests. Retry in 30 sec.' }))
            }
          }
          setPinAddress(fallbackAddress)
        } finally {
          if (seq === reverseSeq.current) setIsResolving(false)
        }
      }, 700)
    },
    [showSearch, showZoneWarning, t],
  )

  const armPinFromMapCenter = useCallback(() => {
    if (blockAutoPinOnceRef.current) {
      blockAutoPinOnceRef.current = false
      return
    }
    const map = mapRef.current
    if (!map) return
    const size = map.getSize()
    const px = L.point(size.x * 0.5, size.y * pinAnchorYFracRef.current)
    const ll = map.containerPointToLatLng(px)
    commitPin({ lat: ll.lat, lng: ll.lng })
  }, [commitPin])

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

  const resolveSearchScope = useCallback(() => {
    const map = mapRef.current
    const center = map?.getCenter()
    return resolveGeocodeSearchScope(
      activeZones,
      center ? { lat: center.lat, lng: center.lng } : null,
    )
  }, [activeZones])

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
      }, 350)
    },
    [resolveSearchScope],
  )

  const handleSelectSearchResult = useCallback(
    (result: NominatimSearchResult) => {
      setShowSearch(false)
      setSearchQuery('')
      setSearchResults([])
      const latlng = { lat: parseFloat(result.lat), lng: parseFloat(result.lon) }
      panMapToTarget(latlng)
      window.setTimeout(() => commitPin(latlng), 250)
    },
    [commitPin, panMapToTarget],
  )

  const confirmPoint = useCallback(() => {
    if (!pinLatLng || isSubmitting) return

    let finalLatLng = pinLatLng
    if (isPickupZoneCheckActive(field, hasZones)) {
      const preview = resolvePickupLocation(pinLatLng, activeZones)
      if (preview.snapped && preview.zone) {
        blockAutoPinOnceRef.current = true
        cancelPinResolution()
        panMapToTarget(preview.latlng)
        showPickupToast()
        return
      }
      finalLatLng = preview.latlng
    }

    const resolvedAddress = pinAddress || `${finalLatLng.lat.toFixed(4)}, ${finalLatLng.lng.toFixed(4)}`
    setIsSubmitting(true)
    const sent = sendTelegramWebAppData({
      field,
      lat: finalLatLng.lat,
      lng: finalLatLng.lng,
      address: resolvedAddress,
    })
    if (!sent) {
      setIsSubmitting(false)
      setErrorMessage(t('bot.pickNeedsTelegram', { defaultValue: 'Open this screen from the Telegram bot.' }))
      hapticNotification('error')
      return
    }
    hapticImpact('medium')
    closeTelegramWebApp()
  }, [
    pinLatLng,
    pinAddress,
    isSubmitting,
    field,
    hasZones,
    activeZones,
    cancelPinResolution,
    panMapToTarget,
    showPickupToast,
    t,
  ])

  const isPinLive = Boolean(pinLatLng)
  const pinReadyForConfirm = isPinLive && !isResolving && !isPanning && Boolean(pinAddress)
  const pickupZoneCheckActive = isPickupZoneCheckActive(field, hasZones)

  const pickerModel = {
    activeField: field,
    setActiveField: () => undefined,
    fromPoint: isFrom ? pinLatLng : null,
    toPoint: isFrom ? null : pinLatLng,
    fromAddress: isFrom ? pinAddress : '',
    toAddress: isFrom ? '' : pinAddress,
    activeIsFrom: isFrom,
    isPinLive,
    pinReadyForConfirm,
    pickupToast,
    setPickupToast,
    isPanning,
    isResolving,
    pinAddress,
    showSearch,
    setShowSearch,
    setSearchQuery,
    setSearchResults,
    searchQuery,
    searchResults,
    isSearching,
    handleSearch,
    handleSelectSearchResult,
    zoneWarning,
    setZoneWarning,
    pickupZoneCheckActive,
    confirmPoint,
    setFromPoint: () => undefined,
    setFromAddress: () => undefined,
    setToPoint: () => undefined,
    setToAddress: () => undefined,
    armPinFromMapCenter,
  }

  const [isLocating, setIsLocating] = useState(false)

  const handleLocateMe = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return
    setIsLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const target = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        panMapToTarget(target, 16)
        window.setTimeout(() => commitPin(target), 250)
        setIsLocating(false)
      },
      () => setIsLocating(false),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    )
  }, [commitPin, panMapToTarget])

  return {
    field,
    isFrom,
    errorMessage,
    isSubmitting,
    activeZones,
    mapRef,
    pinAnchorYFracRef,
    pickerModel,
    setIsPanning,
    commitPinFromMap,
    isLocating,
    handleLocateMe,
    registerMap: (map: L.Map) => {
      mapRef.current = map
    },
  }
}
