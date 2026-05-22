import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import L from 'leaflet'
import { createRequest, getCurrentUser, getPricing, listServiceZones } from '../../../lib/backend'
import {
  RateLimitedError,
  isRateLimited,
  rateLimitRetryInMs,
  reverseGeocode as nominatimReverse,
  searchPlaces as nominatimSearch,
  type NominatimSearchResult,
} from '../../../lib/geocode'
import { hapticImpact, hapticNotification, hapticSelection } from '../../../lib/telegram'
import type { LatLng, PricingSettings, ServiceZone } from '../../../types'
import { isPointInAnyZone } from '../../../utils/geo'
import { PIN_ANCHOR_Y_FRAC } from './NewRequestMapBinder'

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

export function useNewRequestController() {
  const navigate = useNavigate()
  const [pricing, setPricing] = useState<PricingSettings>({ pointsPerRide: 10, pointPriceCents: 50, workStartTime: '06:00', workEndTime: '19:00', slotIntervalMinutes: 30 })
  const [serviceZones, setServiceZones] = useState<ServiceZone[]>([])
  const [passengerName, setPassengerName] = useState('Текущий пользователь')
  const activeZones = serviceZones.filter((z) => z.isActive)
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
  const [pinOutOfZone, setPinOutOfZone] = useState(false)

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
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>()
  const zoneWarningTimer = useRef<ReturnType<typeof setTimeout>>()
  const reverseTimer = useRef<ReturnType<typeof setTimeout>>()
  const reverseAbort = useRef<AbortController | null>(null)
  const searchAbort = useRef<AbortController | null>(null)
  const reverseSeq = useRef(0)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
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
        setErrorMessage(error instanceof Error ? error.message : 'Не удалось загрузить данные.')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

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
        if (isRateLimited()) {
          setIsResolving(false)
          showZoneWarning(`Слишком много запросов к карте. Повтор через ~${Math.ceil(rateLimitRetryInMs() / 1000)} сек.`)
          return
        }
        const controller = new AbortController()
        reverseAbort.current = controller
        try {
          const addr = await nominatimReverse(latlng, controller.signal)
          if (seq !== reverseSeq.current) return
          setIsResolving(false)
          setPinAddress(addr || `${latlng.lat.toFixed(4)}, ${latlng.lng.toFixed(4)}`)
        } catch (err) {
          if ((err as Error)?.name === 'AbortError') return
          if (seq !== reverseSeq.current) return
          setIsResolving(false)
          if (err instanceof RateLimitedError) {
            showZoneWarning('Слишком много запросов к карте. Повторите через 30 сек.')
          }
          setPinAddress(`${latlng.lat.toFixed(4)}, ${latlng.lng.toFixed(4)}`)
        }
      }, 700)
    },
    [activeZones, hasZones, showSearch, showZoneWarning, fromPoint, toPoint],
  )

  const confirmPoint = useCallback(() => {
    if (!pinLatLng) return
    if (hasZones && !isPointInAnyZone(pinLatLng, activeZones)) {
      showZoneWarning('Точка вне зоны обслуживания')
      return
    }
    const resolved = pinAddress || `${pinLatLng.lat.toFixed(4)}, ${pinLatLng.lng.toFixed(4)}`
    if (!fromPoint) {
      setFromPoint(pinLatLng)
      setFromAddress(resolved)
      setActiveField('to')
      hapticImpact('light')
    } else if (!toPoint) {
      setToPoint(pinLatLng)
      setToAddress(resolved)
      hapticImpact('medium')
    }
    setPinLatLng(null)
    setPinAddress('')
    setPinOutOfZone(false)
    setIsResolving(false)
    setZoneWarning(null)
    if (reverseTimer.current) clearTimeout(reverseTimer.current)
    if (reverseAbort.current) {
      reverseAbort.current.abort()
      reverseAbort.current = null
    }
  }, [pinLatLng, pinAddress, fromPoint, toPoint, activeZones, hasZones, showZoneWarning])

  const armPinFromMapCenter = useCallback(() => {
    const map = mapRef.current
    if (!map) return
    const size = map.getSize()
    const px = L.point(size.x * 0.5, size.y * PIN_ANCHOR_Y_FRAC)
    const ll = map.containerPointToLatLng(px)
    commitPin({ lat: ll.lat, lng: ll.lng })
  }, [commitPin])

  const panMapToTarget = useCallback((target: LatLng, zoom = 15) => {
    const map = mapRef.current
    if (!map) return
    const z = Math.max(map.getZoom(), zoom)
    const targetPx = map.project([target.lat, target.lng], z)
    const size = map.getSize()
    const dy = size.y * (0.5 - PIN_ANCHOR_Y_FRAC)
    const desiredCenterPx = targetPx.add(L.point(0, dy))
    const newCenter = map.unproject(desiredCenterPx, z)
    map.flyTo(newCenter, z, { duration: 0.5 })
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
      searchTimeout.current = setTimeout(async () => {
        if (isRateLimited()) {
          showZoneWarning(`Слишком много запросов к карте. Повтор через ~${Math.ceil(rateLimitRetryInMs() / 1000)} сек.`)
          return
        }
        setIsSearching(true)
        const controller = new AbortController()
        searchAbort.current = controller
        try {
          const data = await nominatimSearch(query, controller.signal)
          setSearchResults(data)
        } catch (err) {
          if ((err as Error)?.name === 'AbortError') return
          setSearchResults([])
          if (err instanceof RateLimitedError) {
            showZoneWarning('Слишком много запросов к карте. Повторите через 30 сек.')
          }
        } finally {
          setIsSearching(false)
        }
      }, 600)
    },
    [showZoneWarning],
  )

  const handleSelectSearchResult = useCallback(
    (result: NominatimSearchResult) => {
      const latlng: LatLng = { lat: parseFloat(result.lat), lng: parseFloat(result.lon) }
      if (hasZones && !isPointInAnyZone(latlng, activeZones)) {
        showZoneWarning('Этот адрес вне зоны обслуживания.')
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
    [activeField, activeZones, fromPoint, toPoint, hasZones, panMapToTarget, showZoneWarning],
  )

  const handleLocateMe = useCallback(() => {
    if (!navigator.geolocation) {
      showZoneWarning('Геолокация не поддерживается.')
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
        showZoneWarning('Не удалось определить локацию.')
      },
      { enableHighAccuracy: true, timeout: 8000 },
    )
  }, [panMapToTarget, showZoneWarning])

  const handleSubmit = useCallback(async () => {
    if (!fromPoint || !toPoint || !dateTime) return
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
      setErrorMessage(error instanceof Error ? error.message : 'Не удалось отправить заявку.')
    } finally {
      setSubmitting(false)
    }
  }, [dateTime, fromAddress, fromPoint, navigate, passengerName, toAddress, toPoint])

  useEffect(() => {
    saveDraft({ fromPoint, toPoint, fromAddress, toAddress, dateTime, activeField })
  }, [fromPoint, toPoint, fromAddress, toAddress, dateTime, activeField])

  useEffect(() => {
    return () => {
      if (searchTimeout.current) clearTimeout(searchTimeout.current)
      if (zoneWarningTimer.current) clearTimeout(zoneWarningTimer.current)
      if (reverseTimer.current) clearTimeout(reverseTimer.current)
      if (reverseAbort.current) reverseAbort.current.abort()
      if (searchAbort.current) searchAbort.current.abort()
    }
  }, [])

  const canSubmit = Boolean(fromPoint && toPoint && dateTime && !submitting)
  const effectiveField: 'from' | 'to' = !fromPoint ? 'from' : !toPoint ? 'to' : activeField
  const activeIsFrom = effectiveField === 'from'
  const isPinLive = !(fromPoint && toPoint)

  return {
    pricing,
    passengerName,
    hasZones,
    activeZones,
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
    pinOutOfZone,
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
    confirmPoint,
    armPinFromMapCenter,
    handleSearch,
    handleSelectSearchResult,
    handleLocateMe,
    handleSubmit,
    canSubmit,
    activeIsFrom,
    isPinLive,
  }
}
