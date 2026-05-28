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
import { Car, CaretRight, List, MapPin, SteeringWheel, X } from '@phosphor-icons/react'

import {
  applyDriverPointAction,
  getDriverCabinet,
  getDriverMapData,
  getDriverSession,
  loginDriverByKey,
  logoutDriverSession,
  notifyPickupChange,
  resetDriverRidePickup,
  sendDriverLocation,
  setDriverOnlineStatus,
  updateDriverRidePickup,
  type DriverSessionUser,
} from '../../lib/backend'
import { reverseGeocode } from '../../lib/geocode'
import { getRoadRoutePolyline } from '../../lib/osrm'
import { hapticImpact, hapticNotification } from '../../lib/telegram'
import type { DriverCabinetData, DriverMapData, DriverMapPoint, LatLng } from '../../types'

import DriverMap from './components/DriverMap'
import DriverPointSheet from './components/DriverPointSheet'
import DriverSideMenu from './components/DriverSideMenu'

const MAP_POLL_MS = 8_000
const CABINET_POLL_MS = 30_000
const HEARTBEAT_MS = 15_000
const LOCATION_INTERVAL_MS = 6_000

// ─── Action label helpers (same mapping as sheet) ────────────────────────────

function getQuickActionLabel(pt: DriverMapPoint): string | null {
  const { pointType, rideStatus } = pt
  if (pointType === 'pickup') {
    if (rideStatus === 'assigned') return 'Еду на точку'
    if (rideStatus === 'en_route_to_pickup') return 'Прибыл'
    if (rideStatus === 'awaiting_passenger') return 'Пассажир сел — едем!'
  }
  if (pointType === 'dropoff') {
    if (rideStatus === 'awaiting_passenger') return 'Везу пассажира'
    if (rideStatus === 'in_progress') return 'Прибыл — завершить'
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

function LoginScreen({ onLogin }: { onLogin: (s: DriverSessionUser) => void }) {
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
      setError(err instanceof Error ? err.message : 'Не удалось войти.')
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
            <p className="text-xs text-muted">Кабинет водителя</p>
          </div>
        </div>
        <p className="text-sm text-muted">Введите персональный ключ водителя.</p>
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
          {loading ? 'Проверяем ключ…' : 'Войти'}
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
  isNotifying,
  isResetting,
  onOpenSheet,
  onQuickAction,
  onNotifyPickup,
  onResetPickup,
}: {
  point: DriverMapPoint
  isActioning: boolean
  isNotifying: boolean
  isResetting: boolean
  onOpenSheet: () => void
  onQuickAction: () => void
  onNotifyPickup: () => void
  onResetPickup: () => void
}) {
  const actionLabel = getQuickActionLabel(point)
  const action = getQuickAction(point)
  const isPickup = point.pointType === 'pickup'
  const pointColor = point.pointStatus === 'done' ? '#16A34A' : isPickup ? '#2563EB' : '#DC2626'
  const showPickupQuickActions = isPickup && point.pickupChangedByDriver
  const canNotifyPickup = showPickupQuickActions && !point.pickupNotifiedAt

  const isGreen = ['awaiting_passenger', 'in_progress'].some((s) =>
    (isPickup && s === 'awaiting_passenger' && point.rideStatus === 'awaiting_passenger') ||
    (!isPickup && s === point.rideStatus),
  )
  const isBlue = isPickup && point.rideStatus === 'en_route_to_pickup'

  const btnCls = isGreen
    ? 'bg-accent text-black active:bg-accent/90'
    : isBlue
    ? 'bg-blue-600 text-white active:bg-blue-700'
    : 'bg-black text-white active:bg-zinc-900'

  return (
    <div
      className="absolute left-0 right-0 bottom-0 z-[15] bg-white border-t border-border/50"
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
              {isPickup ? 'Точка подачи' : 'Точка назначения'}
            </p>
            <p className="text-sm font-bold truncate">{point.address}</p>
            <p className="text-[11px] text-muted truncate mt-0.5">{point.passengerName}</p>
          </div>
          <MapPin size={16} className="text-muted flex-shrink-0 mt-1" />
        </button>

        {/* One-tap action button */}
        {action && actionLabel && (
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
                <span>{actionLabel}</span>
                <CaretRight size={12} weight="bold" className="opacity-70" />
              </>
            )}
          </button>
        )}
      </div>
      {showPickupQuickActions && (
        <div className="px-4 pb-3 flex items-center gap-2.5">
          <button
            onClick={onResetPickup}
            disabled={isResetting}
            className="flex-1 h-11 rounded-xl border border-border bg-surface text-sm font-bold active:scale-[0.98] transition-transform disabled:opacity-60"
          >
            {isResetting ? 'Сбрасываем…' : 'Сбросить'}
          </button>
          <button
            onClick={onNotifyPickup}
            disabled={isNotifying || !canNotifyPickup}
            className="flex-1 h-11 rounded-xl bg-amber-500 text-white text-sm font-bold active:scale-[0.98] transition-transform disabled:opacity-60"
          >
            {isNotifying ? 'Отправляем…' : canNotifyPickup ? 'Уведомить пассажира' : 'Уже уведомлен'}
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function DriverCabinet() {
  const [session, setSession] = useState<DriverSessionUser | null>(null)
  const [mapData, setMapData] = useState<DriverMapData | null>(null)
  const [cabinetData, setCabinetData] = useState<DriverCabinetData | null>(null)
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null)
  const [sideMenuOpen, setSideMenuOpen] = useState(false)
  const [isActioning, setIsActioning] = useState(false)
  const [isNotifying, setIsNotifying] = useState(false)
  const [isResettingPickup, setIsResettingPickup] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [driverLocation, setDriverLocation] = useState<LatLng | null>(null)
  const [roadPolyline, setRoadPolyline] = useState<LatLng[]>([])

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

  // Restore session on mount
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        await getDriverSession()
        if (cancelled) return
        await Promise.all([loadMapData(), loadCabinetData()])
      } catch {
        if (!cancelled) setSession(null)
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
    if (!session || !navigator.geolocation) return
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords
        setDriverLocation({ lat, lng })
        const now = Date.now()
        if (now - lastSentRef.current >= LOCATION_INTERVAL_MS) {
          lastSentRef.current = now
          void sendDriverLocation(lat, lng).catch(() => undefined)
        }
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 3_000, timeout: 15_000 },
    )
    return () => navigator.geolocation.clearWatch(watchId)
  }, [session?.driverId])

  // ── Derived state ─────────────────────────────────────────────────────────

  const points = mapData?.points ?? []
  const activePoints = useMemo(
    () => points.filter((p) => p.pointStatus !== 'done'),
    [points],
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

  const selectedPoint = points.find((p) => p.id === selectedPointId) ?? null

  const routeWaypoints = useMemo<LatLng[]>(() => {
    const ordered = [...activePoints].sort(
      (a, b) => (a.recommendedOrder ?? 999) - (b.recommendedOrder ?? 999),
    )
    const waypoints = ordered.map((p) => p.latLng)
    if (driverLocation && waypoints.length > 0) {
      return [driverLocation, ...waypoints]
    }
    return waypoints
  }, [activePoints, driverLocation])

  useEffect(() => {
    if (routeWaypoints.length < 2) {
      setRoadPolyline([])
      return
    }
    let cancelled = false
    void getRoadRoutePolyline(routeWaypoints)
      .then((polyline) => {
        if (!cancelled) setRoadPolyline(polyline)
      })
      .catch((error) => {
        if (cancelled) return
        setRoadPolyline([])
        setErrorMessage(error instanceof Error ? error.message : 'Не удалось построить маршрут по дороге.')
      })
    return () => { cancelled = true }
  }, [routeWaypoints])

  // ── Actions ───────────────────────────────────────────────────────────────

  const performAction = async (point: DriverMapPoint, action: string) => {
    setIsActioning(true)
    setErrorMessage(null)
    try {
      await applyDriverPointAction(point.rideId, point.pointType, action)
      hapticImpact('medium')
      setSelectedPointId(null)
      await loadMapData()
    } catch (err) {
      hapticNotification('error')
      setErrorMessage(err instanceof Error ? err.message : 'Не удалось выполнить действие.')
    } finally {
      setIsActioning(false)
    }
  }

  const handleAction = (action: string) => {
    if (!selectedPoint) return
    void performAction(selectedPoint, action)
  }

  const handleNextStopQuickAction = () => {
    if (!nextPoint) return
    const action = getQuickAction(nextPoint)
    if (!action) return
    void performAction(nextPoint, action)
  }

  const handleNotifyPickup = async () => {
    const point = selectedPoint ?? nextPoint
    if (!point) return
    setIsNotifying(true)
    setErrorMessage(null)
    try {
      await notifyPickupChange(point.rideId)
      hapticImpact('medium')
      await loadMapData()
    } catch (err) {
      hapticNotification('error')
      setErrorMessage(err instanceof Error ? err.message : 'Не удалось уведомить пассажира.')
    } finally {
      setIsNotifying(false)
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
      setErrorMessage(err instanceof Error ? err.message : 'Не удалось сбросить точку подачи.')
    } finally {
      setIsResettingPickup(false)
    }
  }

  const handlePickupDragEnd = async (rideId: string, latlng: LatLng) => {
    setErrorMessage(null)
    let address = `${latlng.lat.toFixed(5)}, ${latlng.lng.toFixed(5)}`
    try {
      const resolved = await reverseGeocode(latlng)
      if (resolved) address = resolved
    } catch { /* fallback */ }
    try {
      await updateDriverRidePickup(rideId, address, latlng.lat, latlng.lng)
      hapticImpact('light')
      await loadMapData()
    } catch (err) {
      hapticNotification('error')
      setErrorMessage(err instanceof Error ? err.message : 'Не удалось обновить точку подачи.')
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
        onLogin={async (s) => {
          setSession(s)
          await Promise.all([loadMapData(), loadCabinetData()])
        }}
      />
    )
  }

  // Height of the bottom next-stop bar (approx), so map knows not to cover it.
  // We reserve space via CSS variables or a placeholder — map fits within the remaining area.
  const NEXT_BAR_H = nextPoint ? 108 : 0 // px (rough height incl. safe area)

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
          points={points}
          selectedPointId={selectedPointId}
          nextPointId={nextPoint?.id ?? null}
          driverLocation={driverLocation}
          roadPolyline={roadPolyline}
          onSelectPoint={(pt) => setSelectedPointId(pt.id)}
          onPickupDragEnd={(rideId, latlng) => void handlePickupDragEnd(rideId, latlng)}
        />
      </div>

      {/* ── Floating header ─────────────────────────────────────────────── */}
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
                    ? 'поездка'
                    : mapData.activeRides < 5
                    ? 'поездки'
                    : 'поездок'}
                </span>
              </>
            )}
          </div>
        )}

        <div className="w-12 flex-shrink-0" />
      </div>

      {/* ── Empty state ─────────────────────────────────────────────────── */}
      {mapData && activePoints.length === 0 && (
        <div
          className="absolute inset-x-0 top-0 z-[10] flex items-center justify-center pointer-events-none"
          style={{ bottom: NEXT_BAR_H }}
        >
          <div className="bg-white/92 backdrop-blur-sm rounded-card shadow-card px-6 py-5 text-center max-w-[230px]">
            <div className="w-12 h-12 rounded-full bg-surface flex items-center justify-center mx-auto mb-3">
              <Car size={22} className="text-muted" weight="fill" />
            </div>
            <p className="text-sm font-bold">Нет активных поездок</p>
            <p className="text-xs text-muted mt-1 leading-snug">
              Как только вам назначат заказ — точки появятся здесь
            </p>
          </div>
        </div>
      )}

      {/* ── Next-stop persistent bar ─────────────────────────────────────── */}
      {nextPoint && !selectedPointId && (
        <NextStopBar
          point={nextPoint}
          isActioning={isActioning}
          isNotifying={isNotifying}
          isResetting={isResettingPickup}
          onOpenSheet={() => setSelectedPointId(nextPoint.id)}
          onQuickAction={handleNextStopQuickAction}
          onNotifyPickup={() => void handleNotifyPickup()}
          onResetPickup={() => void handleResetPickup()}
        />
      )}

      {/* ── Point detail sheet (slides up) ──────────────────────────────── */}
      <DriverPointSheet
        point={selectedPoint}
        isActioning={isActioning}
        isNotifying={isNotifying}
        onClose={() => setSelectedPointId(null)}
        onAction={handleAction}
        onNotifyPickup={() => void handleNotifyPickup()}
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
      {errorMessage && (
        <div
          className="absolute left-4 right-4 z-[60] bg-white border-[1.5px] border-red-200 rounded-card shadow-card p-4 flex items-start gap-3"
          style={{ bottom: `calc(${NEXT_BAR_H}px + 12px)` }}
        >
          <div className="w-8 h-8 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0">
            <X size={15} className="text-red-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-red-900">Ошибка</p>
            <p className="text-xs text-red-700 mt-0.5 break-words">{errorMessage}</p>
          </div>
          <button
            onClick={() => setErrorMessage(null)}
            className="p-1 hover:bg-surface rounded-lg flex-shrink-0"
          >
            <X size={13} className="text-muted" />
          </button>
        </div>
      )}
    </div>
  )
}
