/**
 * Driver cabinet — full-screen map-first UX.
 *
 * Layout:
 *   [full-screen map]
 *   [floating header: hamburger | status pill]
 *   [next-stop bar: address + one-tap action button]   ← always visible
 *   [point sheet: slides up on marker / bar tap]
 *   [side menu: QR, history, logout]
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Car, CaretRight, Clock, Crosshair, List, MapPin, SteeringWheel, X } from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'

import RideRatingSheet from '../../components/RideRatingSheet'
import {
  applyDriverPointAction,
  claimDriverRide,
  getDriverCabinet,
  getDriverMapData,
  bootstrapDriverAccess,
  getDriverSession,
  loginDriverByKey,
  logoutDriverSession,
  rateRideAsDriver,
  resetDriverRidePickup,
  sendDriverLocation,
  setDriverOnlineStatus,
  updateDriverRideRoute,
  type DriverSessionUser,
} from '../../lib/backend'
import { reverseGeocode } from '../../lib/geocode'
import { formatRideTime } from '../../i18n/dateTime'
import { ApiError } from '../../infrastructure/http/httpClient'
import { getDefaultPeriodFilter, matchesPeriodFilter } from '../../lib/periodFilter'
import { hapticImpact, hapticNotification } from '../../lib/telegram'
import { useEscapeClose } from '../../lib/useEscapeClose'
import type { DriverCabinetData, DriverMapData, DriverMapPoint, LatLng } from '../../types'

import DriverAvailableRideSheet from './components/DriverAvailableRideSheet'
import DriverCabinetModeSwitch, { type DriverCabinetMode } from './components/DriverCabinetModeSwitch'
import DriverMap from './components/DriverMap'
import DriverMapPeriodFilter from './components/DriverMapPeriodFilter'
import DriverPointSheet from './components/DriverPointSheet'
import DriverSideMenu from './components/DriverSideMenu'
import NotificationBell from '../../components/notifications/NotificationBell'

const MAP_POLL_MS = 8_000
const CABINET_POLL_MS = 30_000
const HEARTBEAT_MS = 15_000
const LOCATION_INTERVAL_MS = 6_000

// ─── Action label helpers (same mapping as sheet) ────────────────────────────

function getQuickActionLabelKey(pt: DriverMapPoint): string | null {
  const { pointType, rideStatus } = pt
  if (pointType === 'pickup') {
    if (rideStatus === 'assigned') return 'driver.actionGoToPoint'
    if (rideStatus === 'en_route_to_pickup') return 'driver.actionArrived'
    if (rideStatus === 'awaiting_passenger') return 'driver.actionPassengerOnBoard'
  }
  if (pointType === 'dropoff') {
    if (rideStatus === 'awaiting_passenger') return 'driver.actionDrivingPassenger'
    if (rideStatus === 'in_progress') return 'driver.actionArrivedFinish'
  }
  return null
}

function getQuickAction(pt: DriverMapPoint): string | null {
  const { pointType, rideStatus } = pt
  if (pointType === 'pickup') {
    if (rideStatus === 'assigned') return 'start'
    if (rideStatus === 'en_route_to_pickup') return 'arrived'
    if (rideStatus === 'awaiting_passenger') return 'complete'
  }
  if (pointType === 'dropoff') {
    if (rideStatus === 'awaiting_passenger') return 'start'
    if (rideStatus === 'in_progress') return 'arrived'
  }
  return null
}

// ─── Login ────────────────────────────────────────────────────────────────────

function LoginScreen({
  onLogin,
  magicLinkHint,
}: {
  onLogin: (s: DriverSessionUser) => void
  magicLinkHint?: string | null
}) {
  const { t } = useTranslation()
  const [key, setKey] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = useCallback(async () => {
    if (!key.trim() || loading) return
    setLoading(true)
    setError(null)
    try {
      const session = await loginDriverByKey(key.trim())
      onLogin(session)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.loginFailed', { defaultValue: 'Login failed.' }))
    } finally {
      setLoading(false)
    }
  }, [key, loading, onLogin])

  return (
    <div
      className="min-h-[100dvh] bg-surface flex flex-col items-center justify-center px-6"
      style={{
        paddingTop: 'var(--app-user-safe-top)',
        paddingBottom: 'var(--app-user-safe-bottom)',
      }}
    >
      <div className="w-full max-w-sm bg-white rounded-card shadow-card p-7 space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-black text-white flex items-center justify-center">
            <SteeringWheel size={22} weight="fill" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold tracking-tight">RIDE</h1>
            <p className="text-xs text-muted">{t('driver.cabinet', { defaultValue: 'Driver cabinet' })}</p>
          </div>
        </div>
        {magicLinkHint && (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 leading-relaxed">
            {magicLinkHint}
          </p>
        )}
        <p className="text-sm text-muted">{t('driver.loginByKey', { defaultValue: 'Enter driver key.' })}</p>
        <input
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.currentTarget.blur(); void submit() } }}
          placeholder="ride_driver_..."
          autoComplete="current-password"
          className="w-full h-12 px-4 rounded-2xl border-[1.5px] border-border bg-surface outline-none focus:border-black focus:bg-white transition-colors text-sm"
        />
        <button
          onClick={() => void submit()}
          disabled={!key.trim() || loading}
          className={`w-full h-13 rounded-2xl font-bold text-sm transition-all ${
            key.trim() && !loading
              ? 'bg-black text-white active:scale-[0.97]'
              : 'bg-surface text-muted cursor-not-allowed'
          }`}
          style={{ height: 52 }}
        >
          {loading
            ? t('driver.verifyingKey', { defaultValue: 'Verifying key...' })
            : t('driver.login', { defaultValue: 'Sign in' })}
        </button>
        {error && <p className="text-xs font-semibold text-red-600">{error}</p>}
      </div>
    </div>
  )
}

// ─── Next-stop bottom bar ─────────────────────────────────────────────────────

function NextStopBar({
  point,
  isActioning,
  isResetting,
  onOpenSheet,
  onQuickAction,
  onResetPickup,
  onHeightChange,
}: {
  point: DriverMapPoint
  isActioning: boolean
  isResetting: boolean
  onOpenSheet: () => void
  onQuickAction: () => void
  onHeightChange?: (height: number) => void
  onResetPickup: () => void
}) {
  const { t } = useTranslation()
  const [resetArmed, setResetArmed] = useState(false)
  const resetArmTimer = useRef<number | null>(null)
  useEffect(() => {
    return () => {
      if (resetArmTimer.current) window.clearTimeout(resetArmTimer.current)
    }
  }, [])
  // Real bar height varies (e.g. reset row) — report it so the map reserves the right space.
  const barRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const el = barRef.current
    if (!el || !onHeightChange) return
    onHeightChange(el.offsetHeight)
    const observer = new ResizeObserver(() => onHeightChange(el.offsetHeight))
    observer.observe(el)
    return () => observer.disconnect()
  }, [onHeightChange])
  const actionLabelKey = getQuickActionLabelKey(point)
  const action = getQuickAction(point)
  const arrivalTime = formatRideTime(point)
  const isPickup = point.pointType === 'pickup'
  const pointColor = point.pointStatus === 'done' ? '#16A34A' : isPickup ? '#EF4444' : '#3B82F6'
  const showPickupQuickActions = isPickup && point.pickupChangedByDriver

  const isGreen = ['awaiting_passenger', 'in_progress'].some((s) =>
    (isPickup && s === 'awaiting_passenger' && point.rideStatus === 'awaiting_passenger') ||
    (!isPickup && s === point.rideStatus),
  )
  const isPickupEnRoute = isPickup && point.rideStatus === 'en_route_to_pickup'

  const btnCls = isGreen
    ? 'bg-accent text-black active:bg-accent/90'
    : isPickupEnRoute
    ? 'bg-red-600 text-white active:bg-red-700'
    : 'bg-black text-white active:bg-zinc-900'

  return (
    <div
      ref={barRef}
      className="absolute left-0 right-0 bottom-0 z-[15] bg-white border-t border-border/50 md:max-w-lg md:mx-auto md:rounded-t-2xl md:border md:border-border/60"
      style={{
        paddingBottom: 'var(--app-safe-area-bottom-total)',
        boxShadow: '0 -4px 20px rgba(0,0,0,0.08)',
      }}
    >
      <div className="flex items-center gap-3 px-4 pt-4 pb-3">
        {/* Tap address area → open full sheet */}
        <button
          onClick={onOpenSheet}
          className="flex-1 flex items-start gap-3 text-left min-w-0"
        >
          <div
            className="w-10 h-10 rounded-2xl flex-shrink-0 flex items-center justify-center text-white text-sm font-extrabold"
            style={{ background: pointColor }}
          >
            {point.recommendedOrder ?? (isPickup ? 'A' : 'B')}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted">
              {isPickup
                ? t('driver.pickupPoint', { defaultValue: 'Pickup point' })
                : t('driver.destinationPoint', { defaultValue: 'Destination point' })}
            </p>
            <p className="text-sm font-bold truncate">{point.address}</p>
            <p className="text-[11px] font-semibold text-foreground flex items-center gap-1 mt-0.5">
              <Clock size={11} weight="fill" className="text-muted flex-shrink-0" />
              {arrivalTime}
            </p>
            <p className="text-[11px] text-muted truncate">{point.passengerName}</p>
          </div>
          <MapPin size={16} className="text-muted flex-shrink-0 mt-1" />
        </button>

        {/* One-tap action button */}
        {action && actionLabelKey && (
          <button
            onClick={onQuickAction}
            disabled={isActioning}
            className={`flex-shrink-0 h-14 px-5 rounded-2xl font-extrabold text-[13px] flex flex-col items-center justify-center gap-0.5 transition-all active:scale-[0.97] disabled:opacity-60 touch-none ${btnCls}`}
            style={{ minWidth: 116 }}
          >
            {isActioning ? (
              <div className="w-5 h-5 rounded-full border-2 border-current/30 border-t-current animate-spin" />
            ) : (
              <>
                <span>{t(actionLabelKey, { defaultValue: actionLabelKey })}</span>
                <CaretRight size={12} weight="bold" className="opacity-70" />
              </>
            )}
          </button>
        )}
      </div>
      {showPickupQuickActions && (
        <div className="px-4 pb-3">
          <button
            onClick={() => {
              if (!resetArmed) {
                setResetArmed(true)
                if (resetArmTimer.current) window.clearTimeout(resetArmTimer.current)
                resetArmTimer.current = window.setTimeout(() => setResetArmed(false), 3500)
                return
              }
              if (resetArmTimer.current) window.clearTimeout(resetArmTimer.current)
              setResetArmed(false)
              onResetPickup()
            }}
            disabled={isResetting}
            className={`w-full h-11 rounded-xl text-sm font-bold active:scale-[0.98] transition-all disabled:opacity-60 ${
              resetArmed
                ? 'bg-red-600 text-white'
                : 'border border-border bg-surface'
            }`}
          >
            {isResetting
              ? t('common.resetting', { defaultValue: 'Resetting...' })
              : resetArmed
                ? t('driver.confirmResetPickup', { defaultValue: 'Confirm reset?' })
                : t('common.reset', { defaultValue: 'Reset' })}
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function DriverCabinet() {
  const { t } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  const [session, setSession] = useState<DriverSessionUser | null>(null)
  const [magicLinkHint, setMagicLinkHint] = useState<string | null>(null)
  const [mapData, setMapData] = useState<DriverMapData | null>(null)
  const [cabinetData, setCabinetData] = useState<DriverCabinetData | null>(null)
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null)
  const [sideMenuOpen, setSideMenuOpen] = useState(false)
  const [isActioning, setIsActioning] = useState(false)
  const [isResettingPickup, setIsResettingPickup] = useState(false)
  const [pendingCritical, setPendingCritical] = useState<{ point: DriverMapPoint; action: string; labelKey: string } | null>(null)
  useEscapeClose(Boolean(pendingCritical) && !isActioning, () => setPendingCritical(null))
  useEscapeClose(sideMenuOpen && !pendingCritical, () => setSideMenuOpen(false))
  const [nextBarHeight, setNextBarHeight] = useState(108)
  const [geoBlocked, setGeoBlocked] = useState(false)
  const [geoBannerDismissed, setGeoBannerDismissed] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [driverLocation, setDriverLocation] = useState<LatLng | null>(null)
  const [pendingRating, setPendingRating] = useState<{ rideId: string; passengerName: string } | null>(null)
  const [isRatingSubmitting, setIsRatingSubmitting] = useState(false)
  const [isMapMarkViewMode, setIsMapMarkViewMode] = useState(false)
  const [filterExpanded, setFilterExpanded] = useState(false)
  const defaultPeriod = getDefaultPeriodFilter()
  const [filterDate, setFilterDate] = useState(defaultPeriod.filterDate)
  const [filterDateEnd, setFilterDateEnd] = useState(defaultPeriod.filterDateEnd)
  const [filterTime, setFilterTime] = useState(defaultPeriod.filterTime)
  const [filterTimeEnd, setFilterTimeEnd] = useState(defaultPeriod.filterTimeEnd)
  const [cabinetMode, setCabinetMode] = useState<DriverCabinetMode>('my')
  const [isClaiming, setIsClaiming] = useState(false)

  const canSelfAssign = Boolean(session?.canSelfAssign ?? mapData?.session.canSelfAssign)

  // ── Loaders ───────────────────────────────────────────────────────────────

  const loadMapData = useCallback(async () => {
    const data = await getDriverMapData()
    setMapData(data)
    if (!session) setSession(data.session)
  }, [session])

  const loadCabinetData = useCallback(async () => {
    const data = await getDriverCabinet({ limit: 100, offset: 0 })
    setCabinetData(data)
  }, [])

  // Restore session on mount; retry via Telegram bootstrap after failed magic link
  useEffect(() => {
    let cancelled = false
    const loginParam = searchParams.get('login')
    void (async () => {
      try {
        await getDriverSession()
        if (cancelled) return
        if (loginParam) {
          searchParams.delete('login')
          setSearchParams(searchParams, { replace: true })
        }
        setMagicLinkHint(null)
        await Promise.all([loadMapData(), loadCabinetData()])
      } catch {
        if (cancelled) return
        if (loginParam === 'invalid') {
          try {
            const bootstrapped = await bootstrapDriverAccess()
            if (cancelled) return
            setSession(bootstrapped)
            setMagicLinkHint(null)
            searchParams.delete('login')
            setSearchParams(searchParams, { replace: true })
            await Promise.all([loadMapData(), loadCabinetData()])
            return
          } catch {
            setMagicLinkHint(
              t('driver.magicLogin.invalid', {
                defaultValue:
                  'Login link did not work. Open the Ride app in Telegram and use Profile → Driver cabinet, or enter your driver key below.',
              }),
            )
          }
        }
        setSession(null)
      }
    })()
    return () => { cancelled = true }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Poll map data
  useEffect(() => {
    if (!session) return
    const t = setInterval(() => void loadMapData().catch(() => undefined), MAP_POLL_MS)
    return () => clearInterval(t)
  }, [session?.driverId, loadMapData])

  // Poll cabinet data (slower)
  useEffect(() => {
    if (!session) return
    const t = setInterval(() => void loadCabinetData().catch(() => undefined), CABINET_POLL_MS)
    return () => clearInterval(t)
  }, [session?.driverId, loadCabinetData])

  // ── Heartbeat ─────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!session) return
    let cancelled = false
    const ping = async () => {
      try {
        const updated = await setDriverOnlineStatus(true)
        if (!cancelled) setSession(updated)
      } catch { /* silent */ }
    }
    void ping()
    const t = setInterval(() => void ping(), HEARTBEAT_MS)
    return () => {
      cancelled = true
      clearInterval(t)
      void setDriverOnlineStatus(false).catch(() => undefined)
    }
  }, [session?.driverId])

  // ── Geolocation ───────────────────────────────────────────────────────────

  const lastSentRef = useRef(0)
  useEffect(() => {
    if (!session) return
    if (!navigator.geolocation) {
      setGeoBlocked(true)
      return
    }
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords
        setGeoBlocked(false)
        setDriverLocation({ lat, lng })
        const now = Date.now()
        if (now - lastSentRef.current >= LOCATION_INTERVAL_MS) {
          lastSentRef.current = now
          void sendDriverLocation(lat, lng).catch(() => undefined)
        }
      },
      (err) => {
        // Surface permission problems instead of failing silently.
        if (err.code === err.PERMISSION_DENIED || err.code === err.POSITION_UNAVAILABLE) {
          setGeoBlocked(true)
        }
      },
      { enableHighAccuracy: true, maximumAge: 3_000, timeout: 15_000 },
    )
    return () => navigator.geolocation.clearWatch(watchId)
  }, [session?.driverId])

  // ── Derived state ─────────────────────────────────────────────────────────

  const points = mapData?.points ?? []
  const availablePoints = mapData?.availablePoints ?? []

  const visiblePoints = useMemo(
    () => points.filter((p) => matchesPeriodFilter(
      { dateTime: p.dateTime, dateTimeLocal: p.dateTimeLocal },
      { filterDate, filterDateEnd, filterTime, filterTimeEnd },
    )),
    [points, filterDate, filterDateEnd, filterTime, filterTimeEnd],
  )

  const visibleAvailablePoints = useMemo(
    () => availablePoints.filter((p) => matchesPeriodFilter(
      { dateTime: p.dateTime, dateTimeLocal: p.dateTimeLocal },
      { filterDate, filterDateEnd, filterTime, filterTimeEnd },
    )),
    [availablePoints, filterDate, filterDateEnd, filterTime, filterTimeEnd],
  )

  const mapDisplayPoints = cabinetMode === 'available' ? visibleAvailablePoints : visiblePoints

  const availableRideCount = useMemo(() => {
    return new Set(visibleAvailablePoints.map((p) => p.rideId)).size
  }, [visibleAvailablePoints])

  const activePoints = useMemo(
    () => visiblePoints.filter((p) => p.pointStatus !== 'done'),
    [visiblePoints],
  )

  /** The next actionable point (en_route first, then pending in recommendedOrder) */
  const nextPoint = useMemo<DriverMapPoint | null>(() => {
    const enRoute = activePoints.find((p) => p.pointStatus === 'en_route')
    if (enRoute) return enRoute
    const pending = [...activePoints].sort(
      (a, b) => (a.recommendedOrder ?? 999) - (b.recommendedOrder ?? 999),
    )
    return pending.find((p) => getQuickAction(p) !== null) ?? null
  }, [activePoints])

  const selectedPoint = cabinetMode === 'my'
    ? visiblePoints.find((p) => p.id === selectedPointId) ?? null
    : null

  const selectedAvailablePoint = cabinetMode === 'available'
    ? visibleAvailablePoints.find((p) => p.id === selectedPointId) ?? null
    : null

  const selectedAvailableRideId = selectedAvailablePoint?.rideId ?? null
  const selectedAvailablePickup = selectedAvailableRideId
    ? visibleAvailablePoints.find((p) => p.rideId === selectedAvailableRideId && p.pointType === 'pickup') ?? null
    : null
  const selectedAvailableDropoff = selectedAvailableRideId
    ? visibleAvailablePoints.find((p) => p.rideId === selectedAvailableRideId && p.pointType === 'dropoff') ?? null
    : null

  const filterTopOffset = canSelfAssign
    ? 'calc(var(--app-safe-area-top-total) + 112px)'
    : 'calc(var(--app-safe-area-top-total) + 64px)'

  const mapInsetTop = (canSelfAssign ? 48 : 0) + (filterExpanded ? 188 : 116)

  useEffect(() => {
    if (!selectedPointId) return
    const pool = cabinetMode === 'available' ? visibleAvailablePoints : visiblePoints
    if (!pool.some((p) => p.id === selectedPointId)) {
      setSelectedPointId(null)
    }
  }, [visiblePoints, visibleAvailablePoints, selectedPointId, cabinetMode])

  useEffect(() => {
    if (!canSelfAssign && cabinetMode === 'available') {
      setCabinetMode('my')
    }
  }, [canSelfAssign, cabinetMode])

  useEffect(() => {
    if (!isMapMarkViewMode) return
    setSideMenuOpen(false)
    setSelectedPointId(null)
  }, [isMapMarkViewMode])

  // ── Actions ───────────────────────────────────────────────────────────────

  const performAction = async (point: DriverMapPoint, action: string) => {
    setIsActioning(true)
    setErrorMessage(null)
    const completesRide = point.pointType === 'dropoff' && point.rideStatus === 'in_progress' && action === 'arrived'
    try {
      await applyDriverPointAction(point.rideId, point.pointType, action)
      hapticImpact('medium')
      setSelectedPointId(null)
      await loadMapData()
      if (completesRide) {
        setPendingRating({ rideId: point.rideId, passengerName: point.passengerName })
      }
    } catch (err) {
      hapticNotification('error')
      setErrorMessage(err instanceof Error ? err.message : t('errors.driverActionFailed', { defaultValue: 'Failed to perform action.' }))
    } finally {
      setIsActioning(false)
    }
  }

  // Irreversible ride-state transitions get an explicit confirmation step.
  const requestAction = (point: DriverMapPoint, action: string) => {
    const isCritical =
      (point.pointType === 'pickup' && action === 'complete') ||
      (point.pointType === 'dropoff' && action === 'arrived' && point.rideStatus === 'in_progress')
    if (isCritical) {
      const labelKey =
        point.pointType === 'pickup' ? 'driver.actionPassengerOnBoard' : 'driver.actionArrivedFinish'
      setPendingCritical({ point, action, labelKey })
      return
    }
    void performAction(point, action)
  }

  const handleAction = (action: string) => {
    if (!selectedPoint) return
    requestAction(selectedPoint, action)
  }

  const handleNextStopQuickAction = () => {
    if (!nextPoint) return
    const action = getQuickAction(nextPoint)
    if (!action) return
    requestAction(nextPoint, action)
  }

  const handleClaimRide = async () => {
    if (!selectedAvailableRideId) return
    setIsClaiming(true)
    setErrorMessage(null)
    try {
      await claimDriverRide(selectedAvailableRideId)
      hapticNotification('success')
      setCabinetMode('my')
      setSelectedPointId(`${selectedAvailableRideId}:pickup`)
      await loadMapData()
    } catch (err) {
      hapticNotification('error')
      if (err instanceof ApiError && err.status === 409) {
        setErrorMessage(t('driver.claimRideTaken', { defaultValue: 'This ride was already taken.' }))
      } else {
        setErrorMessage(
          err instanceof Error
            ? err.message
            : t('errors.claimRideFailed', { defaultValue: 'Failed to take ride.' }),
        )
      }
      await loadMapData()
    } finally {
      setIsClaiming(false)
    }
  }

  const handleResetPickup = async () => {
    const point = selectedPoint ?? nextPoint
    if (!point) return
    setIsResettingPickup(true)
    setErrorMessage(null)
    try {
      await resetDriverRidePickup(point.rideId)
      hapticImpact('light')
      await loadMapData()
    } catch (err) {
      hapticNotification('error')
      setErrorMessage(err instanceof Error ? err.message : t('errors.resetPickupFailed', { defaultValue: 'Failed to reset pickup point.' }))
    } finally {
      setIsResettingPickup(false)
    }
  }

  const handlePointDragEnd = async (rideId: string, pointType: 'pickup' | 'dropoff', latlng: LatLng) => {
    setErrorMessage(null)
    let address = `${latlng.lat.toFixed(5)}, ${latlng.lng.toFixed(5)}`
    try {
      const resolved = await reverseGeocode(latlng)
      if (resolved) address = resolved
    } catch { /* fallback */ }
    try {
      const point = { address, lat: latlng.lat, lng: latlng.lng }
      await updateDriverRideRoute(
        rideId,
        pointType === 'pickup' ? { fromPoint: point } : { toPoint: point },
      )
      hapticImpact('light')
      await loadMapData()
    } catch (err) {
      hapticNotification('error')
      setErrorMessage(
        err instanceof Error
          ? err.message
          : t('errors.updateRouteFailed', { defaultValue: 'Failed to update route point.' }),
      )
    }
  }

  const handleLogout = async () => {
    setSideMenuOpen(false)
    try { await setDriverOnlineStatus(false) } catch { /* ignore */ }
    try { await logoutDriverSession() } catch { /* ignore */ }
    setSession(null)
    setMapData(null)
    setCabinetData(null)
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (!session) {
    return (
      <LoginScreen
        magicLinkHint={magicLinkHint}
        onLogin={async (s) => {
          setSession(s)
          setMagicLinkHint(null)
          await Promise.all([loadMapData(), loadCabinetData()])
        }}
      />
    )
  }

  // Height of the bottom next-stop bar — measured live (reset row makes it taller).
  const NEXT_BAR_H = cabinetMode === 'my' && nextPoint ? nextBarHeight : 0

  return (
    <div
      className="relative overflow-hidden bg-black"
      style={{ width: '100dvw', height: '100dvh' }}
    >
      {/* ── Full-screen map ─────────────────────────────────────────────── */}
      <div
        className="absolute inset-x-0 top-0"
        style={{ bottom: NEXT_BAR_H }}
      >
        <DriverMap
          points={mapDisplayPoints}
          selectedPointId={selectedPointId}
          nextPointId={cabinetMode === 'my' ? (nextPoint?.id ?? null) : null}
          driverLocation={driverLocation}
          mapInsetTop={mapInsetTop}
          onSelectPoint={(pt) => setSelectedPointId(pt.id)}
          onPointDragEnd={(rideId, pointType, latlng) => void handlePointDragEnd(rideId, pointType, latlng)}
          onMapMarkViewModeChange={setIsMapMarkViewMode}
        />
      </div>

      {/* ── Floating header ─────────────────────────────────────────────── */}
      {!isMapMarkViewMode && (
      <div
        className="absolute left-0 right-0 top-0 z-[10] flex items-center justify-between gap-3 px-4 pointer-events-none"
        style={{ paddingTop: 'calc(var(--app-safe-area-top-total) + 12px)' }}
      >
        <button
          onClick={() => setSideMenuOpen(true)}
          className="pointer-events-auto w-12 h-12 bg-white rounded-2xl shadow-card flex items-center justify-center active:scale-95 transition-transform touch-none"
        >
          <List size={22} weight="bold" />
        </button>

        {mapData && (
          <div className="bg-white/90 backdrop-blur-sm rounded-pill px-4 py-2.5 shadow-card flex items-center gap-2 pointer-events-none">
            <span className="w-2 h-2 rounded-full bg-accent animate-pulse flex-shrink-0" />
            <span className="text-xs font-bold truncate max-w-[130px]">{session.name}</span>
            {mapData.activeRides > 0 && (
              <>
                <span className="w-px h-3 bg-border flex-shrink-0" />
                <span className="text-xs font-semibold text-muted flex-shrink-0">
                  {mapData.activeRides}{' '}
                  {mapData.activeRides === 1
                    ? t('driver.rideSingular', { defaultValue: 'ride' })
                    : mapData.activeRides < 5
                      ? t('driver.rideFew', { defaultValue: 'rides' })
                      : t('driver.rideMany', { defaultValue: 'rides' })}
                </span>
              </>
            )}
          </div>
        )}

        <NotificationBell
          pool="driver"
          enabled={!!session}
          className="pointer-events-auto w-12 h-12 bg-white rounded-2xl shadow-card flex items-center justify-center active:scale-95 transition-transform relative touch-none"
          onNotificationSelect={(notification) => {
            // Deep link: focus the related ride on the map when the payload references one.
            const rideId = (notification.payload as Record<string, unknown> | null)?.rideId
            if (typeof rideId !== 'string') return
            const target =
              points.find((p) => p.rideId === rideId && p.pointStatus !== 'done')
              ?? points.find((p) => p.rideId === rideId)
            if (target) {
              setCabinetMode('my')
              setSelectedPointId(target.id)
            }
          }}
        />
      </div>
      )}

      {!isMapMarkViewMode && canSelfAssign && (
        <DriverCabinetModeSwitch
          mode={cabinetMode}
          availableRideCount={availableRideCount}
          onChange={(mode) => {
            setCabinetMode(mode)
            setSelectedPointId(null)
          }}
        />
      )}

      {!isMapMarkViewMode && (
        <DriverMapPeriodFilter
          pointCount={mapDisplayPoints.length}
          hiddenCount={
            (cabinetMode === 'available' ? availablePoints.length : points.length) - mapDisplayPoints.length
          }
          topOffset={filterTopOffset}
          showAvailableLegend={cabinetMode === 'available'}
          filterDate={filterDate}
          filterDateEnd={filterDateEnd}
          filterTime={filterTime}
          filterTimeEnd={filterTimeEnd}
          onFilterDateChange={setFilterDate}
          onFilterDateEndChange={setFilterDateEnd}
          onFilterTimeChange={setFilterTime}
          onFilterTimeEndChange={setFilterTimeEnd}
          onExpandedChange={setFilterExpanded}
        />
      )}

      {/* ── Geolocation disabled banner ─────────────────────────────────── */}
      {!isMapMarkViewMode && geoBlocked && !geoBannerDismissed && (
        <div
          className="absolute left-4 right-4 z-[12] bg-amber-50 border-[1.5px] border-amber-200 rounded-card shadow-card p-3.5 flex items-start gap-2.5 md:max-w-md md:mx-auto"
          style={{ top: mapInsetTop }}
        >
          <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
            <Crosshair size={15} className="text-amber-700" weight="bold" />
          </div>
          <p className="flex-1 min-w-0 text-xs text-amber-900 font-semibold leading-snug pt-1">
            {t('driver.geoDisabledBanner', { defaultValue: 'Enable geolocation so passengers can see you on the map' })}
          </p>
          <button
            type="button"
            onClick={() => setGeoBannerDismissed(true)}
            className="w-9 h-9 -mt-0.5 -mr-1 rounded-full flex items-center justify-center flex-shrink-0 text-amber-700 active:bg-amber-100 transition-colors"
            aria-label={t('common.close', { defaultValue: 'Close' })}
          >
            <X size={15} weight="bold" />
          </button>
        </div>
      )}

      {/* ── Empty state ─────────────────────────────────────────────────── */}
      {!isMapMarkViewMode && mapData && mapDisplayPoints.length === 0 && (
        <div
          className="absolute inset-x-0 top-0 z-[10] flex items-center justify-center pointer-events-none"
          style={{ bottom: NEXT_BAR_H, paddingTop: mapInsetTop }}
        >
          <div className="bg-white/92 backdrop-blur-sm rounded-card shadow-card px-6 py-5 text-center max-w-[260px]">
            <div className="w-12 h-12 rounded-full bg-surface flex items-center justify-center mx-auto mb-3">
              <Car size={22} className="text-muted" weight="fill" />
            </div>
            <p className="text-sm font-bold">
              {cabinetMode === 'available'
                ? t('driver.noAvailableInPeriod', { defaultValue: 'No available rides in this period' })
                : t('driver.noPointsInPeriod', { defaultValue: 'No rides in this period' })}
            </p>
            <p className="text-xs text-muted mt-1 leading-snug">
              {cabinetMode === 'available'
                ? t('driver.noAvailableInPeriodHint', { defaultValue: 'Try another day or wait for new requests.' })
                : t('driver.noPointsInPeriodHint', { defaultValue: 'Change the day or time filter to see other trips.' })}
            </p>
          </div>
        </div>
      )}

      {!isMapMarkViewMode && cabinetMode === 'my' && mapData && visiblePoints.length > 0 && activePoints.length === 0 && (
        <div
          className="absolute inset-x-0 top-0 z-[10] flex items-center justify-center pointer-events-none"
          style={{ bottom: NEXT_BAR_H, paddingTop: mapInsetTop }}
        >
          <div className="bg-white/92 backdrop-blur-sm rounded-card shadow-card px-6 py-5 text-center max-w-[230px]">
            <div className="w-12 h-12 rounded-full bg-surface flex items-center justify-center mx-auto mb-3">
              <Car size={22} className="text-muted" weight="fill" />
            </div>
            <p className="text-sm font-bold">{t('driver.noActiveRides', { defaultValue: 'No active rides' })}</p>
            <p className="text-xs text-muted mt-1 leading-snug">
              {t('driver.noActiveRidesHint', { defaultValue: 'As soon as a ride is assigned, points will appear here' })}
            </p>
          </div>
        </div>
      )}

      {/* ── Next-stop persistent bar ─────────────────────────────────────── */}
      {!isMapMarkViewMode && cabinetMode === 'my' && (
        <DriverPointSheet
          point={selectedPoint}
          isActioning={isActioning}
          onClose={() => setSelectedPointId(null)}
          onAction={handleAction}
        />
      )}

      {!isMapMarkViewMode && cabinetMode === 'available' && (
        <DriverAvailableRideSheet
          pickup={selectedAvailablePickup}
          dropoff={selectedAvailableDropoff}
          isClaiming={isClaiming}
          onClose={() => setSelectedPointId(null)}
          onClaim={() => void handleClaimRide()}
        />
      )}

      {!isMapMarkViewMode && cabinetMode === 'my' && nextPoint && !selectedPointId && (
        <NextStopBar
          point={nextPoint}
          isActioning={isActioning}
          isResetting={isResettingPickup}
          onOpenSheet={() => setSelectedPointId(nextPoint.id)}
          onQuickAction={handleNextStopQuickAction}
          onResetPickup={() => void handleResetPickup()}
          onHeightChange={setNextBarHeight}
        />
      )}

      {/* ── Critical action confirm ─────────────────────────────────────── */}
      {pendingCritical && (
        <div className="absolute inset-0 z-[70] bg-black/60 backdrop-blur-sm flex items-end justify-center">
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label={t('common.cancel', { defaultValue: 'Cancel' })}
            onClick={() => !isActioning && setPendingCritical(null)}
          />
          <div
            className="relative w-full bg-white rounded-t-3xl shadow-card p-5 space-y-4 md:max-w-md md:rounded-t-2xl"
            style={{ paddingBottom: 'calc(1.25rem + var(--app-safe-area-bottom-total, 0px))' }}
          >
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted">
                {t('driver.confirmActionTitle', { defaultValue: 'Confirm action' })}
              </p>
              <p className="text-lg font-extrabold tracking-tight mt-0.5">
                {t(pendingCritical.labelKey, { defaultValue: pendingCritical.labelKey })}
              </p>
              <p className="text-xs text-muted mt-1 truncate">
                №{pendingCritical.point.rideNumber} · {pendingCritical.point.passengerName}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPendingCritical(null)}
                disabled={isActioning}
                className="flex-1 h-12 rounded-2xl bg-surface text-sm font-bold disabled:opacity-60"
              >
                {t('common.cancel', { defaultValue: 'Cancel' })}
              </button>
              <button
                type="button"
                onClick={() => {
                  const { point, action } = pendingCritical
                  setPendingCritical(null)
                  void performAction(point, action)
                }}
                disabled={isActioning}
                className="flex-1 h-12 rounded-2xl bg-black text-white text-sm font-bold disabled:opacity-60 active:scale-[0.98] transition-transform"
              >
                {t('common.confirm', { defaultValue: 'Confirm' })}
              </button>
            </div>
          </div>
        </div>
      )}

      <RideRatingSheet
        key={pendingRating?.rideId ?? 'closed'}
        open={pendingRating !== null}
        title={t('driver.ratePassenger', { defaultValue: 'Rate passenger' })}
        subtitle={pendingRating ? pendingRating.passengerName : undefined}
        isSubmitting={isRatingSubmitting}
        onClose={() => setPendingRating(null)}
        onSkip={() => setPendingRating(null)}
        onSubmit={async ({ score, comment }) => {
          if (!pendingRating) return
          setIsRatingSubmitting(true)
          setErrorMessage(null)
          try {
            await rateRideAsDriver(pendingRating.rideId, { score, comment })
            hapticNotification('success')
            setPendingRating(null)
            await loadMapData()
          } catch (err) {
            hapticNotification('error')
            setErrorMessage(err instanceof Error ? err.message : t('errors.submitRatingFailed', { defaultValue: 'Failed to submit rating.' }))
          } finally {
            setIsRatingSubmitting(false)
          }
        }}
      />

      {/* ── Side menu ────────────────────────────────────────────────────── */}
      <DriverSideMenu
        isOpen={sideMenuOpen}
        session={session}
        cabinetData={cabinetData}
        onClose={() => setSideMenuOpen(false)}
        onLogout={() => void handleLogout()}
      />

      {/* ── Error toast ──────────────────────────────────────────────────── */}
      {!isMapMarkViewMode && errorMessage && (
        <div
          className="absolute left-4 right-4 z-[60] bg-white border-[1.5px] border-red-200 rounded-card shadow-card p-4 flex items-start gap-3 md:max-w-md md:mx-auto"
          style={{ bottom: `calc(${NEXT_BAR_H}px + 12px)` }}
        >
          <div className="w-8 h-8 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0">
            <X size={15} className="text-red-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-red-900">{t('common.error', { defaultValue: 'Error' })}</p>
            <p className="text-xs text-red-700 mt-0.5 break-words">{errorMessage}</p>
          </div>
          <button
            onClick={() => setErrorMessage(null)}
            className="w-10 h-10 -m-2 hover:bg-surface rounded-lg flex items-center justify-center flex-shrink-0"
            aria-label={t('common.close', { defaultValue: 'Close' })}
          >
            <X size={15} className="text-muted" />
          </button>
        </div>
      )}
    </div>
  )
}
