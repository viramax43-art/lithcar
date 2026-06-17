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
import { isPointInAnyZone } from '../../utils/geo'
import { PIN_ANCHOR_Y_FRAC } from '../passenger/new-request/NewRequestMapBinder'

export function useDriverOfferFormController(onSuccess: () => void) {
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

  const [activeField, setActiveField] = useState<'from' | 'to'>('from')
  const [fromPoint, setFromPoint] = useState<LatLng | null>(null)
  const [toPoint, setToPoint] = useState<LatLng | null>(null)
  const [fromAddress, setFromAddress] = useState('')
  const [toAddress, setToAddress] = useState('')
  const [dateTime, setDateTime] = useState('')

  const [pinLatLng, setPinLatLng] = useState<LatLng | null>(null)
  const [pinAddress, setPinAddress] = useState('')
  const [pinOutOfZone, setPinOutOfZone] = useState(false)
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
  const armPinFromMapCenterRef = useRef<() => void>(() => {})
  const reverseTimer = useRef<ReturnType<typeof setTimeout>>()
  const reverseAbort = useRef<AbortController | null>(null)
  const reverseSeq = useRef(0)
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>()
  const searchAbort = useRef<AbortController | null>(null)
  const zoneWarningTimer = useRef<ReturnType<typeof setTimeout>>()

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

  const commitPin = useCallback(
    (latlng: LatLng) => {
      if (showSearch) return
      if (fromPoint && toPoint) return
      setPinLatLng(latlng)
      const inZone = !hasZones || isPointInAnyZone(latlng, activeZones)
      setPinOutOfZone(!inZone)
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
    [activeZones, fromPoint, hasZones, showSearch, showZoneWarning, toPoint, t],
  )

  const armPinFromMapCenter = useCallback(() => {
    const map = mapRef.current
    if (!map) return
    const size = map.getSize()
    const px = L.point(size.x * 0.5, size.y * PIN_ANCHOR_Y_FRAC)
    const ll = map.containerPointToLatLng(px)
    commitPin({ lat: ll.lat, lng: ll.lng })
  }, [commitPin])

  armPinFromMapCenterRef.current = armPinFromMapCenter

  const confirmPoint = useCallback(() => {
    if (!pinLatLng) return
    if (hasZones && !isPointInAnyZone(pinLatLng, activeZones)) {
      showZoneWarning(t('geo.pointOutOfZone', { defaultValue: 'Point is outside service area' }))
      return
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
    setPinLatLng(null)
    setPinAddress('')
    setPinOutOfZone(false)
    setIsResolving(false)
  }, [pinLatLng, pinAddress, fromPoint, toPoint, activeZones, hasZones, showZoneWarning, armPinFromMapCenter, t])

  const panMapToTarget = useCallback((target: LatLng, zoom = 15) => {
    const map = mapRef.current
    if (!map) return
    const z = Math.max(map.getZoom(), zoom)
    map.flyTo([target.lat, target.lng], z, { duration: 0.5 })
  }, [])

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
          const results = await nominatimSearch(query, controller.signal)
          setSearchResults(results)
        } catch {
          setSearchResults([])
        } finally {
          setIsSearching(false)
        }
      }, 400)
    },
    [],
  )

  const handleSelectSearchResult = useCallback(
    (result: NominatimSearchResult) => {
      const latlng = { lat: parseFloat(result.lat), lng: parseFloat(result.lon) }
      if (hasZones && !isPointInAnyZone(latlng, activeZones)) {
        showZoneWarning(t('geo.addressOutOfZone', { defaultValue: 'This address is outside the service area.' }))
        return
      }
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
    [activeField, activeZones, fromPoint, hasZones, panMapToTarget, showZoneWarning, toPoint, t],
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
  const effectiveField = !fromPoint ? 'from' : !toPoint ? 'to' : activeField
  const activeIsFrom = effectiveField === 'from'
  const isPinLive = !(fromPoint && toPoint)
  const pinReadyForConfirm = Boolean(pinLatLng && !pinOutOfZone && !isResolving)

  return {
    pricing,
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
    pinOutOfZone,
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
