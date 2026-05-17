import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowClockwise, Car, QrCode, SignOut, SteeringWheel, X } from '@phosphor-icons/react'

import {
  getDriverCabinet,
  getDriverSession,
  issueDriverQrSale,
  loginDriverByKey,
  logoutDriverSession,
  sendDriverLocation,
  setDriverOnlineStatus,
  setDriverRideStatus,
  type DriverSessionUser,
} from '../../lib/backend'
import type { DriverCabinetRide } from '../../types'
import ActiveRideCard from './components/ActiveRideCard'
import { ACTIVE_RIDE_STATUSES, DRIVER_STATUS_COLOR, DRIVER_STATUS_LABEL, nextStatus } from './constants'
import { hapticImpact, hapticNotification, hapticSelection } from '../../lib/telegram'
import Skeleton from '../../components/Skeleton'

const DRIVER_ONLINE_POLL_MS = 15_000
const DRIVER_CABINET_POLL_MS = 10_000
const DRIVER_LOCATION_MIN_INTERVAL_MS = 8_000

export default function DriverCabinet() {
  const [session, setSession] = useState<DriverSessionUser | null>(null)
  const [keyInput, setKeyInput] = useState('')
  const [rides, setRides] = useState<DriverCabinetRide[]>([])
  const [driverDebtEur, setDriverDebtEur] = useState(0)
  const [recentQrSales, setRecentQrSales] = useState<Array<{
    saleId: string
    points: number
    eurAmount: number
    redeemedAt: string | null
    settlementStatus: string
  }>>([])
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isLoggingIn, setIsLoggingIn] = useState(false)
  const [advancingRideId, setAdvancingRideId] = useState<string | null>(null)
  const [qrPointsInput, setQrPointsInput] = useState(100)
  const [qrIssue, setQrIssue] = useState<{
    saleId: string
    token: string
    qrUrl: string
    points: number
    eurAmount: number
  } | null>(null)
  const [isIssuingQr, setIsIssuingQr] = useState(false)
  const [hasLoadedCabinetOnce, setHasLoadedCabinetOnce] = useState(false)

  const loadCabinet = useCallback(async () => {
    const data = await getDriverCabinet({ limit: 50, offset: 0 })
    setRides(data.rides)
    setDriverDebtEur(data.driverDebtEur)
    setRecentQrSales(data.recentQrSales)
    setHasLoadedCabinetOnce(true)
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const current = await getDriverSession()
        if (cancelled) return
        setSession(current)
        await loadCabinet()
      } catch {
        if (cancelled) return
        setSession(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [loadCabinet])

  // Heartbeat: keep driver online while in cabinet.
  useEffect(() => {
    if (!session) return
    let isCancelled = false
    const sendHeartbeat = async () => {
      try {
        const updated = await setDriverOnlineStatus(true)
        if (isCancelled) return
        setSession(updated)
      } catch (error) {
        if (isCancelled) return
        setErrorMessage(error instanceof Error ? error.message : 'Не удалось обновить онлайн-статус.')
      }
    }
    void sendHeartbeat()
    const heartbeatTimer = window.setInterval(() => {
      void sendHeartbeat()
    }, DRIVER_ONLINE_POLL_MS)
    return () => {
      isCancelled = true
      window.clearInterval(heartbeatTimer)
      void setDriverOnlineStatus(false).catch(() => undefined)
    }
  }, [session?.driverId])

  // Poll rides while in cabinet.
  useEffect(() => {
    if (!session) return
    const timer = window.setInterval(() => {
      void loadCabinet().catch(() => undefined)
    }, DRIVER_CABINET_POLL_MS)
    return () => window.clearInterval(timer)
  }, [session?.driverId, loadCabinet])

  // Stream geolocation to backend while the driver is in the cabinet.
  useEffect(() => {
    if (!session) return
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setErrorMessage('Геолокация не поддерживается этим браузером.')
      return
    }
    let lastSentAt = 0
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const now = Date.now()
        if (now - lastSentAt < DRIVER_LOCATION_MIN_INTERVAL_MS) return
        lastSentAt = now
        const { latitude, longitude } = position.coords
        void sendDriverLocation(latitude, longitude).catch(() => undefined)
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          setErrorMessage('Нет доступа к геолокации. Включите разрешение для приложения.')
        }
      },
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 30_000 },
    )
    return () => navigator.geolocation.clearWatch(watchId)
  }, [session?.driverId])

  const handleAdvanceStatus = async (ride: DriverCabinetRide) => {
    const target = nextStatus(ride.status)
    if (!target) return
    setAdvancingRideId(ride.id)
    setErrorMessage(null)
    try {
      const updated = await setDriverRideStatus(ride.id, target)
      setRides((prev) => prev.map((r) => (r.id === updated.id ? updated : r)))
      hapticImpact('medium')
    } catch (error) {
      hapticNotification('error')
      setErrorMessage(error instanceof Error ? error.message : 'Не удалось обновить статус.')
    } finally {
      setAdvancingRideId(null)
    }
  }

  const { activeRide, upcomingRides, completedRides } = useMemo(() => {
    const active = rides.find((r) => (ACTIVE_RIDE_STATUSES as string[]).includes(r.status)) ?? null
    const completed = rides.filter((r) => r.status === 'completed')
    const upcoming = rides.filter(
      (r) => r.id !== active?.id && r.status !== 'completed',
    )
    return { activeRide: active, upcomingRides: upcoming, completedRides: completed }
  }, [rides])

  if (!session) {
    return (
      <div className="min-h-[100dvh] bg-surface flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-white rounded-card shadow-card p-6 space-y-5">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-black text-white flex items-center justify-center">
              <SteeringWheel size={20} weight="fill" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold tracking-tight">RIDE</h1>
              <p className="text-xs text-muted">Кабинет водителя</p>
            </div>
          </div>
          <p className="text-sm text-muted">Введите персональный ключ водителя.</p>
          <input
            type="password"
            value={keyInput}
            onChange={(event) => setKeyInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && keyInput.trim() && !isLoggingIn) {
                event.currentTarget.blur()
                void (async () => {
                  setIsLoggingIn(true)
                  setErrorMessage(null)
                  try {
                    const user = await loginDriverByKey(keyInput.trim())
                    setSession(user)
                    setKeyInput('')
                    await loadCabinet()
                  } catch (error) {
                    setErrorMessage(error instanceof Error ? error.message : 'Не удалось войти по ключу.')
                  } finally {
                    setIsLoggingIn(false)
                  }
                })()
              }
            }}
            placeholder="ride_driver_..."
            className="w-full px-4 py-3 rounded-xl border-[1.5px] border-border bg-surface outline-none focus:border-black focus:bg-white transition-colors"
          />
          <button
            onClick={async () => {
              setIsLoggingIn(true)
              setErrorMessage(null)
              try {
                const user = await loginDriverByKey(keyInput.trim())
                setSession(user)
                setKeyInput('')
                await loadCabinet()
              } catch (error) {
                setErrorMessage(error instanceof Error ? error.message : 'Не удалось войти по ключу.')
              } finally {
                setIsLoggingIn(false)
              }
            }}
            disabled={!keyInput.trim() || isLoggingIn}
            className={`w-full py-3 rounded-xl font-bold text-sm transition-all ${
              keyInput.trim() && !isLoggingIn
                ? 'bg-black text-white active:scale-[0.97]'
                : 'bg-surface text-muted'
            }`}
          >
            {isLoggingIn ? 'Проверяем ключ…' : 'Войти'}
          </button>
          {errorMessage && <p className="text-xs font-medium text-red-600">{errorMessage}</p>}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-[100dvh] bg-surface">
      <header
        className="sticky top-0 z-30 bg-black text-white shadow-card"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <div className="h-14 px-5 flex items-center justify-between">
          <div className="min-w-0">
            <h1 className="text-base font-extrabold tracking-tight truncate">{session.name}</h1>
            <p className="text-[11px] text-white/60 truncate">
              водитель · долг пользователей €{driverDebtEur.toFixed(2)}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-pill text-[11px] font-bold bg-accent text-black">
              <span className="w-1.5 h-1.5 rounded-full bg-black animate-pulse" />
              Онлайн
            </span>
            <button
              onClick={async () => {
                try {
                  await setDriverOnlineStatus(false)
                } finally {
                  await logoutDriverSession()
                  setSession(null)
                  setRides([])
                }
              }}
              className="p-2 rounded-pill bg-white/10 hover:bg-white/20 transition-colors"
              title="Выйти"
            >
              <SignOut size={16} weight="bold" />
            </button>
          </div>
        </div>
      </header>

      <main className="px-4 py-4 space-y-4 max-w-2xl mx-auto pb-12">
        {session.canSellPoints && (
          <DriverQrIssueCard
            points={qrPointsInput}
            onPointsChange={setQrPointsInput}
            issue={qrIssue}
            isIssuing={isIssuingQr}
            onReset={() => setQrIssue(null)}
            onIssue={async () => {
              setIsIssuingQr(true)
              setErrorMessage(null)
              try {
                const result = await issueDriverQrSale(qrPointsInput)
                setQrIssue(result)
                hapticNotification('success')
                await loadCabinet()
              } catch (error) {
                hapticNotification('error')
                setErrorMessage(error instanceof Error ? error.message : 'Не удалось создать QR-чек.')
              } finally {
                setIsIssuingQr(false)
              }
            }}
          />
        )}

        {session.canSellPoints && recentQrSales.length > 0 && (
          <section className="bg-white rounded-card p-4 space-y-2">
            <p className="text-sm font-bold">Сколько должны пользователи: €{driverDebtEur.toFixed(2)}</p>
            {recentQrSales.slice(0, 8).map((sale) => (
              <div key={sale.saleId} className="text-xs flex items-center justify-between gap-3 border-t border-border pt-2">
                <span className="truncate">{sale.points} pts</span>
                <span className="truncate">€{sale.eurAmount.toFixed(2)}</span>
                <span className="text-muted truncate">
                  {sale.redeemedAt ? new Date(sale.redeemedAt).toLocaleString('ru-RU') : 'не погашен'}
                </span>
              </div>
            ))}
          </section>
        )}

        {!hasLoadedCabinetOnce ? (
          <div className="bg-white rounded-card p-5 space-y-4">
            <div className="flex items-center gap-3">
              <Skeleton width={48} height={48} rounded="full" />
              <div className="flex-1 space-y-2">
                <Skeleton width="60%" height={14} />
                <Skeleton width="40%" height={12} />
              </div>
            </div>
            <Skeleton width="100%" height={14} />
            <Skeleton width="85%" height={14} />
            <Skeleton width="100%" height={44} rounded="xl" />
          </div>
        ) : activeRide ? (
          <ActiveRideCard
            ride={activeRide}
            isAdvancing={advancingRideId === activeRide.id}
            onAdvance={() => void handleAdvanceStatus(activeRide)}
          />
        ) : (
          <div className="bg-white rounded-card p-8 text-center">
            <div className="w-12 h-12 rounded-full bg-surface flex items-center justify-center mx-auto mb-3">
              <Car size={22} className="text-muted" weight="fill" />
            </div>
            <p className="text-sm font-bold">Активных поездок нет</p>
            <p className="text-xs text-muted mt-1">Как только админ назначит вам заказ — он появится здесь.</p>
          </div>
        )}

        {upcomingRides.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-[10px] font-bold uppercase tracking-wider text-muted px-1">
              Следующие поездки · {upcomingRides.length}
            </h2>
            {upcomingRides.map((ride) => (
              <RideRow key={ride.id} ride={ride} />
            ))}
          </section>
        )}

        {completedRides.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-[10px] font-bold uppercase tracking-wider text-muted px-1">
              История · {completedRides.length}
            </h2>
            {completedRides.slice(0, 10).map((ride) => (
              <RideRow key={ride.id} ride={ride} dim />
            ))}
          </section>
        )}
      </main>

      {errorMessage && (
        <div className="fixed bottom-4 left-4 right-4 max-w-md mx-auto z-[100] bg-white border-[1.5px] border-red-200 rounded-card shadow-card p-4 flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0">
            <X size={16} className="text-red-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-red-900">Ошибка</p>
            <p className="text-xs text-red-700 mt-0.5 break-words">{errorMessage}</p>
          </div>
          <button
            onClick={() => setErrorMessage(null)}
            className="p-1 hover:bg-surface rounded-lg flex-shrink-0 transition-colors"
          >
            <X size={14} className="text-muted" />
          </button>
        </div>
      )}
    </div>
  )
}

const QUICK_POINTS = [50, 100, 200, 500]

function DriverQrIssueCard({
  points,
  onPointsChange,
  issue,
  isIssuing,
  onIssue,
  onReset,
}: {
  points: number
  onPointsChange: (value: number) => void
  issue: {
    saleId: string
    token: string
    qrUrl: string
    points: number
    eurAmount: number
  } | null
  isIssuing: boolean
  onIssue: () => Promise<void>
  onReset: () => void
}) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    if (!issue?.qrUrl) {
      setQrDataUrl(null)
      return
    }
    ;(async () => {
      const module = await import('qrcode')
      const url = await module.toDataURL(issue.qrUrl, {
        width: 320,
        margin: 1,
        errorCorrectionLevel: 'H',
      })
      if (!cancelled) setQrDataUrl(url)
    })().catch(() => {
      if (!cancelled) setQrDataUrl(null)
    })
    return () => {
      cancelled = true
    }
  }, [issue?.qrUrl])

  if (issue) {
    return (
      <section className="bg-white rounded-card p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Покажите пассажиру</p>
            <p className="text-2xl font-extrabold tracking-tight mt-0.5">{issue.points} pts</p>
            <p className="text-xs text-muted mt-0.5">К получению: <span className="font-bold text-black">€{issue.eurAmount.toFixed(2)}</span></p>
          </div>
          <button
            onClick={() => {
              hapticSelection()
              onReset()
            }}
            className="px-3 py-2 rounded-pill bg-surface text-[11px] font-semibold flex items-center gap-1.5 active:scale-[0.97] transition-transform flex-shrink-0"
          >
            <ArrowClockwise size={12} weight="bold" />
            Новый чек
          </button>
        </div>

        <div className="rounded-2xl bg-white border-[1.5px] border-border p-4 flex items-center justify-center">
          {qrDataUrl ? (
            <img src={qrDataUrl} alt="QR-чек поинтов" className="w-full max-w-[240px] aspect-square object-contain" />
          ) : (
            <div className="w-[240px] h-[240px] rounded-xl bg-surface animate-pulse" />
          )}
        </div>

        <p className="text-[11px] text-muted text-center leading-snug">
          Пассажир сканирует QR в приложении — поинты зачисляются мгновенно.
          <br />
          Если выпустите новый чек — этот станет недействителен.
        </p>
      </section>
    )
  }

  return (
    <section className="bg-white rounded-card p-5 space-y-4">
      <div className="flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-xl bg-black text-white flex items-center justify-center flex-shrink-0">
          <QrCode size={18} weight="bold" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold">Продажа поинтов</p>
          <p className="text-[11px] text-muted">Создайте QR для пассажира</p>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-[11px] font-semibold text-muted">Сколько поинтов продаете</label>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              hapticSelection()
              onPointsChange(Math.max(1, points - 10))
            }}
            disabled={isIssuing}
            className="w-11 h-11 rounded-xl bg-surface text-lg font-bold active:scale-[0.95] transition-transform disabled:opacity-40 flex-shrink-0"
          >
            −
          </button>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            value={points || ''}
            onChange={(event) => onPointsChange(Number(event.target.value) || 0)}
            className="flex-1 min-w-0 h-11 px-3 rounded-xl border-[1.5px] border-border bg-surface text-center text-base font-bold outline-none focus:border-black focus:bg-white transition-colors"
          />
          <button
            type="button"
            onClick={() => {
              hapticSelection()
              onPointsChange(points + 10)
            }}
            disabled={isIssuing}
            className="w-11 h-11 rounded-xl bg-surface text-lg font-bold active:scale-[0.95] transition-transform disabled:opacity-40 flex-shrink-0"
          >
            +
          </button>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {QUICK_POINTS.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                hapticSelection()
                onPointsChange(value)
              }}
              disabled={isIssuing}
              className={`px-3 py-1.5 rounded-pill text-xs font-bold transition-all ${
                points === value ? 'bg-black text-white' : 'bg-surface text-black active:scale-[0.95]'
              }`}
            >
              {value}
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={() => {
          hapticSelection()
          void onIssue()
        }}
        disabled={isIssuing || points < 1}
        className={`w-full h-12 rounded-2xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${
          !isIssuing && points >= 1 ? 'bg-black text-white active:scale-[0.98]' : 'bg-surface text-muted cursor-not-allowed'
        }`}
      >
        {isIssuing ? (
          <>
            <div className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
            Создаем QR…
          </>
        ) : (
          <>
            <QrCode size={16} weight="bold" />
            Создать QR-чек
          </>
        )}
      </button>
    </section>
  )
}

function RideRow({ ride, dim }: { ride: DriverCabinetRide; dim?: boolean }) {
  const statusColors = DRIVER_STATUS_COLOR[ride.status]
  const dt = new Date(ride.dateTime)
  return (
    <div
      className={`bg-white rounded-card p-3 flex items-center gap-3 transition-opacity ${
        dim ? 'opacity-70' : ''
      }`}
    >
      <div className="flex flex-col items-center pt-0.5 flex-shrink-0">
        <div className="w-1.5 h-1.5 rounded-full bg-point-a" />
        <div className="w-px flex-1 bg-border my-1 min-h-2" />
        <div className="w-1.5 h-1.5 rounded-full bg-point-b" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold truncate">{ride.fromAddress}</p>
        <p className="text-xs text-muted truncate">{ride.toAddress}</p>
        <p className="text-[10px] text-muted mt-1">
          {dt.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })} ·{' '}
          {dt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
      <span
        className="text-[10px] font-bold px-2 py-0.5 rounded-pill flex-shrink-0"
        style={{ color: statusColors.color, background: statusColors.bg }}
      >
        {DRIVER_STATUS_LABEL[ride.status]}
      </span>
    </div>
  )
}
