import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { MapContainer, TileLayer, Marker, Polyline, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import {
  MagnifyingGlass,
  X,
  Calendar,
  Clock,
  CaretRight,
  NavigationArrow,
  Warning,
  Coins,
  Crosshair,
} from '@phosphor-icons/react'
import BottomNav from '../../components/BottomNav'
import type { LatLng } from '../../types'
import { isPointInAnyZone } from '../../utils/geo'
import {
  createRequest,
  getCurrentUser,
  getPricing,
  listServiceZones,
} from '../../lib/backend'
import {
  RateLimitedError,
  isRateLimited,
  rateLimitRetryInMs,
  reverseGeocode as nominatimReverse,
  searchPlaces as nominatimSearch,
  type NominatimSearchResult,
} from '../../lib/geocode'
import type { PricingSettings, ServiceZone } from '../../types'
import { hapticImpact, hapticNotification, hapticSelection } from '../../lib/telegram'

const VILNIUS_CENTER: [number, number] = [54.6872, 25.2797]
/** Pin sits this fraction down the map element (so it stays above the bottom sheet). */
const PIN_ANCHOR_Y_FRAC = 0.42

const iconA = L.divIcon({
  className: '',
  html: '<div class="marker-a">A</div>',
  iconSize: [36, 36],
  iconAnchor: [18, 18],
})
const iconB = L.divIcon({
  className: '',
  html: '<div class="marker-b">B</div>',
  iconSize: [36, 36],
  iconAnchor: [18, 18],
})

/** Reports map handle and emits the pin's latlng on move events. */
function MapBinder({
  registerMap,
  onPanStart,
  onPanEnd,
}: {
  registerMap: (m: L.Map) => void
  onPanStart: () => void
  onPanEnd: (latlng: LatLng) => void
}) {
  const map = useMap()
  useEffect(() => {
    registerMap(map)
    // Emit initial pin location once the map mounts.
    const size = map.getSize()
    const px = L.point(size.x * 0.5, size.y * PIN_ANCHOR_Y_FRAC)
    const ll = map.containerPointToLatLng(px)
    onPanEnd({ lat: ll.lat, lng: ll.lng })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map])

  useMapEvents({
    movestart() {
      onPanStart()
    },
    moveend() {
      const size = map.getSize()
      const px = L.point(size.x * 0.5, size.y * PIN_ANCHOR_Y_FRAC)
      const ll = map.containerPointToLatLng(px)
      onPanEnd({ lat: ll.lat, lng: ll.lng })
    },
  })
  return null
}

export default function NewRequest() {
  const navigate = useNavigate()

  // Server data
  const [pricing, setPricing] = useState<PricingSettings>({ pointsPerRide: 10, pointPriceCents: 50 })
  const [serviceZones, setServiceZones] = useState<ServiceZone[]>([])
  const [passengerName, setPassengerName] = useState('Текущий пользователь')
  const [passengerPhone] = useState('+370 600 00000')
  const activeZones = serviceZones.filter((z) => z.isActive)
  const hasZones = activeZones.length > 0

  // Selection
  const [activeField, setActiveField] = useState<'from' | 'to'>('from')
  const [fromPoint, setFromPoint] = useState<LatLng | null>(null)
  const [toPoint, setToPoint] = useState<LatLng | null>(null)
  const [fromAddress, setFromAddress] = useState('')
  const [toAddress, setToAddress] = useState('')
  const [dateTime, setDateTime] = useState('')

  // Pin preview (not yet committed to fromPoint/toPoint — user must press "Подтвердить").
  const [pinLatLng, setPinLatLng] = useState<LatLng | null>(null)
  const [pinAddress, setPinAddress] = useState('')
  const [pinOutOfZone, setPinOutOfZone] = useState(false)

  // UI
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

  // Load pricing, zones, profile.
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

  /**
   * Update the pin preview state (NOT the confirmed point) as the user pans the map.
   * Resolves the address asynchronously for display above the pin. The actual
   * fromPoint/toPoint is only written when the user presses the confirm button.
   */
  const commitPin = useCallback(
    (latlng: LatLng) => {
      // Skip while user is interacting with search overlay.
      if (showSearch) return
      // Once both points are placed, the pin is idle.
      if (fromPoint && toPoint) return

      setPinLatLng(latlng)
      const inZone = !hasZones || isPointInAnyZone(latlng, activeZones)
      setPinOutOfZone(!inZone)
      setPinAddress('')

      // Debounced reverse-geocode for the preview label.
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
          showZoneWarning(
            `Слишком много запросов к карте. Повтор через ~${Math.ceil(rateLimitRetryInMs() / 1000)} сек.`,
          )
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

  /** Confirm the current pin position as the active field's point. */
  const confirmPoint = useCallback(() => {
    if (!pinLatLng) return
    if (hasZones && !isPointInAnyZone(pinLatLng, activeZones)) {
      showZoneWarning('Точка вне зоны обслуживания')
      return
    }
    const resolved = pinAddress || `${pinLatLng.lat.toFixed(4)}, ${pinLatLng.lng.toFixed(4)}`
    // Always fill A first, then B — regardless of which field has UI focus.
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
    // Reset pin state — user must pan the map again to arm the next confirmation.
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

  /** Arm the pin with the current map center (used after clearing a field). */
  const armPinFromMapCenter = useCallback(() => {
    const map = mapRef.current
    if (!map) return
    const size = map.getSize()
    const px = L.point(size.x * 0.5, size.y * PIN_ANCHOR_Y_FRAC)
    const ll = map.containerPointToLatLng(px)
    commitPin({ lat: ll.lat, lng: ll.lng })
  }, [commitPin])

  /** Pan the map so a target latlng appears under the pin anchor. */
  const panMapToTarget = useCallback((target: LatLng, zoom = 15) => {
    const map = mapRef.current
    if (!map) return
    const z = Math.max(map.getZoom(), zoom)
    const targetPx = map.project([target.lat, target.lng], z)
    const size = map.getSize()
    // Pin sits at (0.5, PIN_ANCHOR_Y_FRAC) of the container. The map center maps to (0.5, 0.5).
    // Shift the new center down so the target ends up under the pin.
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
          showZoneWarning(
            `Слишком много запросов к карте. Повтор через ~${Math.ceil(rateLimitRetryInMs() / 1000)} сек.`,
          )
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
      // Search result is an explicit selection — commit it to the first unfilled
      // point (A, then B) to match the confirm-button flow.
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

  const handleSubmit = async () => {
    if (!fromPoint || !toPoint || !dateTime) return
    setSubmitting(true)
    setErrorMessage(null)
    try {
      await createRequest({
        passengerName,
        passengerPhone,
        from: { address: fromAddress, latlng: fromPoint },
        to: { address: toAddress, latlng: toPoint },
        dateTime,
      })
      hapticNotification('success')
      setSubmitted(true)
      setTimeout(() => navigate('/requests'), 1200)
    } catch (error) {
      hapticNotification('error')
      setErrorMessage(error instanceof Error ? error.message : 'Не удалось отправить заявку.')
    } finally {
      setSubmitting(false)
    }
  }

  const canSubmit = Boolean(fromPoint && toPoint && dateTime && !submitting)
  // `effectiveField` reflects the point actually being placed right now: A until
  // it's confirmed, then B. Once both are confirmed, falls back to user's pref.
  const effectiveField: 'from' | 'to' = !fromPoint ? 'from' : !toPoint ? 'to' : activeField
  const activeIsFrom = effectiveField === 'from'
  const todayDate = new Date().toISOString().split('T')[0]
  // Pin is only "live" while at least one point is missing.
  // Once both A and B are placed, the pin is hidden and the map can be panned freely.
  const isPinLive = !(fromPoint && toPoint)

  return (
    <div className="relative h-[100dvh] overflow-hidden bg-white">
      {/* Map — full screen */}
      <div className="absolute inset-0" style={{ zIndex: 0 }}>
        <MapContainer
          center={VILNIUS_CENTER}
          zoom={13}
          style={{ width: '100%', height: '100%' }}
          zoomControl={false}
          attributionControl={true}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapBinder
            registerMap={(m) => (mapRef.current = m)}
            onPanStart={() => setIsPanning(true)}
            onPanEnd={(ll) => {
              setIsPanning(false)
              void commitPin(ll)
            }}
          />

          {/* Confirmed points are always shown as static markers. */}
          {fromPoint && <Marker position={[fromPoint.lat, fromPoint.lng]} icon={iconA} />}
          {toPoint && <Marker position={[toPoint.lat, toPoint.lng]} icon={iconB} />}

          {fromPoint && toPoint && (
            <Polyline
              positions={[
                [fromPoint.lat, fromPoint.lng],
                [toPoint.lat, toPoint.lng],
              ]}
              pathOptions={{ color: '#000', weight: 3, dashArray: '10, 10', opacity: 0.6 }}
            />
          )}
        </MapContainer>
      </div>

      {/* Center pin (Yandex Taxi style) — only while still placing a point. */}
      {isPinLive && (
        <>
          <div className={`center-pin ${activeIsFrom ? 'pin-a' : 'pin-b'} ${isPanning ? 'is-panning' : ''}`}>
            <div className="pin-body">
              <span>{activeIsFrom ? 'A' : 'B'}</span>
            </div>
          </div>
          <div className="center-pin-shadow" style={isPanning ? { width: 22, opacity: 0.45 } : undefined} />
        </>
      )}

      {/* Header (compact, floats over map) */}
      <header className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between gap-2 px-3 pt-3">
        <div className="flex items-center gap-2 px-3 py-2 rounded-pill bg-white/95 shadow-card backdrop-blur-sm">
          <h1 className="text-base font-extrabold tracking-tight">RIDE</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              hapticSelection()
              handleLocateMe()
            }}
            disabled={isLocating}
            className="w-10 h-10 rounded-pill bg-white shadow-card flex items-center justify-center active:scale-95 transition-transform disabled:opacity-60"
            title="Моя локация"
          >
            {isLocating ? (
              <span className="w-4 h-4 rounded-full border-[2px] border-border border-t-black animate-spin" />
            ) : (
              <Crosshair size={18} weight="bold" />
            )}
          </button>
          <button
            onClick={() => {
              hapticSelection()
              setShowSearch(true)
              setSearchQuery('')
              setSearchResults([])
            }}
            className="w-10 h-10 rounded-pill bg-white shadow-card flex items-center justify-center active:scale-95 transition-transform"
            title="Поиск адреса"
          >
            <MagnifyingGlass size={18} weight="bold" />
          </button>
        </div>
      </header>

      {/* Preview pill (above pin) — shows the address that will be confirmed. */}
      {isPinLive && (
        <div
          className="absolute left-1/2 -translate-x-1/2 z-10 pointer-events-none max-w-[80vw]"
          style={{ top: 'calc(42% - 88px)' }}
        >
          {pinOutOfZone ? (
            <div className="px-3 py-1.5 rounded-pill bg-red-500 text-white text-[11px] font-bold shadow-card inline-flex items-center gap-1.5 animate-fade-in">
              <Warning size={12} weight="fill" />
              Вне зоны обслуживания
            </div>
          ) : isResolving ? (
            <div className="px-3 py-1.5 rounded-pill bg-white text-black text-[11px] font-bold shadow-card inline-flex items-center gap-2 border border-black/10 animate-fade-in">
              <span
                className={`w-3 h-3 rounded-full border-[2px] border-border animate-spin ${
                  activeIsFrom ? 'border-t-point-a' : 'border-t-point-b'
                }`}
              />
              <span className="inline-flex items-center gap-0.5">
                Определяем адрес
                <span className="dot-pulse" style={{ animationDelay: '0ms' }}>.</span>
                <span className="dot-pulse" style={{ animationDelay: '150ms' }}>.</span>
                <span className="dot-pulse" style={{ animationDelay: '300ms' }}>.</span>
              </span>
            </div>
          ) : pinAddress ? (
            <div
              className={`px-3 py-1.5 rounded-pill text-white text-[11px] font-bold shadow-card truncate max-w-[80vw] animate-fade-in ${
                activeIsFrom ? 'bg-point-a' : 'bg-point-b'
              }`}
            >
              {pinAddress}
            </div>
          ) : (
            <div
              className={`px-3 py-1.5 rounded-pill text-white text-[11px] font-bold shadow-card ${
                activeIsFrom ? 'bg-point-a' : 'bg-point-b'
              }`}
            >
              {activeIsFrom ? 'Куда подать машину?' : 'Куда поедем?'}
            </div>
          )}
        </div>
      )}

      {/* Zone warning toast */}
      {zoneWarning && (
        <div className="absolute left-3 right-3 z-30 top-16 flex items-center gap-2 px-3 py-2.5 bg-red-50 border border-red-200 rounded-pill shadow-card animate-fade-in">
          <Warning size={16} weight="fill" className="text-red-500 flex-shrink-0" />
          <span className="text-xs font-semibold text-red-700 flex-1 truncate">{zoneWarning}</span>
          <button onClick={() => setZoneWarning(null)} className="flex-shrink-0">
            <X size={14} className="text-red-400" />
          </button>
        </div>
      )}

      {/* Bottom sheet */}
      <div
        className="absolute left-0 right-0 z-20 px-3"
        style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 64px + 8px)' }}
      >
        <div className="bg-white rounded-card shadow-card p-3 space-y-2.5 animate-slide-up">
          {/* From / To rows */}
          <div className="flex flex-col gap-1.5">
            <FieldRow
              dotClass="bg-point-a"
              label="Откуда"
              value={fromAddress}
              placeholder="Двигайте карту или нажмите для поиска"
              active={activeIsFrom}
              onClick={() => setActiveField('from')}
              onClear={
                fromPoint
                  ? () => {
                      setFromPoint(null)
                      setFromAddress('')
                      setActiveField('from')
                      // Arm the pin with the current map center so the confirm button becomes usable immediately.
                      armPinFromMapCenter()
                    }
                  : undefined
              }
              onSearch={() => {
                setActiveField('from')
                setShowSearch(true)
                setSearchQuery('')
                setSearchResults([])
              }}
            />
            <div className="ml-[18px] w-px h-2 bg-border" />
            <FieldRow
              dotClass="bg-point-b"
              label="Куда"
              value={toAddress}
              placeholder={fromPoint ? 'Двигайте карту или нажмите для поиска' : 'Сначала выберите точку A'}
              active={!activeIsFrom}
              onClick={() => setActiveField('to')}
              onClear={
                toPoint
                  ? () => {
                      setToPoint(null)
                      setToAddress('')
                      setActiveField('to')
                      armPinFromMapCenter()
                    }
                  : undefined
              }
              onSearch={() => {
                setActiveField('to')
                setShowSearch(true)
                setSearchQuery('')
                setSearchResults([])
              }}
            />
          </div>

          {/* Date & time */}
          <div className="flex items-center gap-2 pt-1.5 border-t border-surface">
            <div className="flex items-center gap-1.5 flex-1 px-2 py-1.5 rounded-lg bg-surface">
              <Calendar size={14} className="text-muted flex-shrink-0" />
              <input
                type="date"
                value={dateTime.split('T')[0] || ''}
                onChange={(e) => {
                  const time = dateTime.split('T')[1] || '12:00'
                  setDateTime(`${e.target.value}T${time}`)
                }}
                className="flex-1 text-xs font-semibold bg-transparent outline-none min-w-0"
                min={todayDate}
              />
            </div>
            <div className="flex items-center gap-1.5 flex-1 px-2 py-1.5 rounded-lg bg-surface">
              <Clock size={14} className="text-muted flex-shrink-0" />
              <input
                type="time"
                value={dateTime.split('T')[1] || ''}
                onChange={(e) => {
                  const date = dateTime.split('T')[0] || todayDate
                  setDateTime(`${date}T${e.target.value}`)
                }}
                className="flex-1 text-xs font-semibold bg-transparent outline-none min-w-0"
              />
            </div>
          </div>

          {/* Cost + CTA */}
          <div className="flex items-center justify-between text-[11px] text-muted px-0.5">
            <span className="inline-flex items-center gap-1">
              <Coins size={12} weight="fill" className="text-accent-dark" />
              Стоимость поездки
            </span>
            <span className="font-bold text-black text-xs">
              {pricing.pointsPerRide} pts · €{((pricing.pointsPerRide * pricing.pointPriceCents) / 100).toFixed(2)}
            </span>
          </div>

          {submitted ? (
            <div className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-accent/10 text-accent-dark font-bold text-sm">
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                <circle cx="10" cy="10" r="10" fill="#22EA36" />
                <path d="M6 10l3 3 5-6" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Заявка отправлена!
            </div>
          ) : !fromPoint ? (
            // Placing A — user must pan the map and confirm.
            <button
              onClick={confirmPoint}
              disabled={!pinLatLng || pinOutOfZone}
              className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all ${
                pinLatLng && !pinOutOfZone
                  ? 'bg-black text-white active:scale-[0.97]'
                  : 'bg-surface text-muted cursor-not-allowed'
              }`}
            >
              {pinOutOfZone ? 'Точка A вне зоны' : 'Подтвердить точку A'}
              <CaretRight size={14} weight="bold" />
            </button>
          ) : !toPoint ? (
            // Placing B — user must pan the map and confirm.
            <button
              onClick={confirmPoint}
              disabled={!pinLatLng || pinOutOfZone}
              className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all ${
                pinLatLng && !pinOutOfZone
                  ? 'bg-black text-white active:scale-[0.97]'
                  : 'bg-surface text-muted cursor-not-allowed'
              }`}
            >
              {pinOutOfZone ? 'Точка B вне зоны' : 'Подтвердить точку B'}
              <CaretRight size={14} weight="bold" />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all ${
                canSubmit
                  ? 'bg-black text-white active:scale-[0.97]'
                  : 'bg-surface text-muted cursor-not-allowed'
              }`}
            >
              {submitting ? 'Отправка…' : 'Заказать поездку'}
              <CaretRight size={14} weight="bold" />
            </button>
          )}

          {errorMessage && <p className="text-[11px] font-medium text-red-600">{errorMessage}</p>}
        </div>
      </div>

      {/* Search overlay */}
      {showSearch && (
        <div className="absolute inset-0 z-40 bg-white flex flex-col animate-fade-in">
          <header className="flex items-center gap-3 px-3 py-3 border-b border-border">
            <button
              onClick={() => {
                setShowSearch(false)
                setSearchResults([])
              }}
              className="p-2 -ml-1 hover:bg-surface rounded-xl transition-colors"
            >
              <X size={18} />
            </button>
            <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl bg-surface">
              <MagnifyingGlass size={16} className="text-muted flex-shrink-0" />
              <input
                autoFocus
                type="text"
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                placeholder={activeIsFrom ? 'Откуда?' : 'Куда?'}
                className="flex-1 text-sm font-medium outline-none bg-transparent placeholder:text-muted min-w-0"
              />
              {searchQuery && (
                <button
                  onClick={() => {
                    setSearchQuery('')
                    setSearchResults([])
                  }}
                >
                  <X size={14} className="text-muted" />
                </button>
              )}
            </div>
          </header>
          <div className="flex-1 overflow-y-auto">
            <button
              onClick={() => {
                setShowSearch(false)
                setSearchResults([])
              }}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface transition-colors border-b border-border/50"
            >
              <div className="w-9 h-9 rounded-full bg-surface flex items-center justify-center">
                <NavigationArrow size={16} weight="fill" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-black">Выбрать точку на карте</p>
                <p className="text-[11px] text-muted">Двигайте карту, чтобы поставить точку {activeIsFrom ? 'A' : 'B'}</p>
              </div>
              <CaretRight size={14} weight="bold" className="text-muted" />
            </button>

            {isSearching && <p className="px-4 py-3 text-sm text-muted">Ищем…</p>}
            {searchResults.map((r) => (
              <button
                key={r.place_id}
                onClick={() => handleSelectSearchResult(r)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface transition-colors border-b border-border/50 last:border-b-0"
              >
                <div className="w-9 h-9 rounded-full bg-surface flex items-center justify-center flex-shrink-0">
                  <MagnifyingGlass size={14} className="text-muted" />
                </div>
                <span className="text-sm text-black flex-1 truncate">{r.display_name}</span>
              </button>
            ))}
            {!isSearching && searchQuery.length >= 3 && searchResults.length === 0 && (
              <p className="px-4 py-3 text-sm text-muted">Ничего не найдено.</p>
            )}
            {searchQuery.length < 3 && !isSearching && (
              <p className="px-4 py-3 text-sm text-muted">Начните вводить адрес — минимум 3 символа.</p>
            )}
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  )
}

interface FieldRowProps {
  dotClass: string
  label: string
  value: string
  placeholder: string
  active: boolean
  onClick: () => void
  onClear?: () => void
  onSearch: () => void
}

function FieldRow({ dotClass, label, value, placeholder, active, onClick, onClear, onSearch }: FieldRowProps) {
  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-2.5 px-2.5 py-2 rounded-xl border transition-colors cursor-pointer ${
        active ? 'border-black bg-white' : 'border-transparent bg-surface/60'
      }`}
    >
      <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${dotClass}`} />
      <div className="flex-1 min-w-0">
        <p className="text-[9px] font-bold uppercase tracking-wider text-muted leading-none">{label}</p>
        <p
          className={`text-xs font-semibold truncate mt-0.5 ${value ? 'text-black' : 'text-muted/80 font-medium'}`}
        >
          {value || placeholder}
        </p>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation()
          onSearch()
        }}
        className="p-1.5 -mr-1 rounded-lg hover:bg-surface transition-colors flex-shrink-0"
        title="Найти адрес"
      >
        <MagnifyingGlass size={14} className="text-muted" />
      </button>
      {onClear && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onClear()
          }}
          className="p-1.5 rounded-lg hover:bg-surface transition-colors flex-shrink-0"
          title="Очистить"
        >
          <X size={14} className="text-muted" />
        </button>
      )}
    </div>
  )
}
