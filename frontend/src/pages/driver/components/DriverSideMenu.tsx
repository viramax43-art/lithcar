import { useEffect, useState } from 'react'
import {
  ArrowClockwise,
  Check,
  Clock,
  QrCode,
  SignOut,
  SteeringWheel,
  X,
} from '@phosphor-icons/react'

import type { DriverCabinetData } from '../../../types'
import type { DriverSessionUser } from '../../../infrastructure/api/contracts'
import { issueDriverQrSale, logoutDriverSession, setDriverOnlineStatus } from '../../../lib/backend'
import { hapticImpact, hapticNotification, hapticSelection } from '../../../lib/telegram'
import { DRIVER_STATUS_LABEL } from '../constants'

interface DriverSideMenuProps {
  isOpen: boolean
  session: DriverSessionUser
  cabinetData: DriverCabinetData | null
  onClose: () => void
  onLogout: () => void
}

const QUICK_POINTS = [50, 100, 200, 500]

export default function DriverSideMenu({
  isOpen,
  session,
  cabinetData,
  onClose,
  onLogout,
}: DriverSideMenuProps) {
  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-[40] bg-black/40"
          onClick={onClose}
        />
      )}

      {/* Panel */}
      <div
        className="fixed top-0 left-0 bottom-0 z-[50] w-[300px] bg-white shadow-[4px_0_24px_rgba(0,0,0,0.18)] flex flex-col transition-transform duration-300 will-change-transform"
        style={{
          transform: isOpen ? 'translateX(0)' : 'translateX(-100%)',
          paddingTop: 'var(--app-safe-area-top-total)',
          paddingBottom: 'var(--app-safe-area-bottom-total)',
        }}
      >
        {/* Header */}
        <div className="px-4 py-4 flex items-center justify-between gap-3 border-b border-border">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-black text-white flex items-center justify-center flex-shrink-0">
              <SteeringWheel size={18} weight="fill" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-extrabold truncate">{session.name}</p>
              {cabinetData && cabinetData.driverDebtEur > 0 && (
                <p className="text-[11px] text-amber-600 font-semibold mt-0.5">
                  Долг: €{cabinetData.driverDebtEur.toFixed(2)}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-surface flex items-center justify-center flex-shrink-0 active:scale-95 transition-transform"
          >
            <X size={14} weight="bold" className="text-muted" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          {/* QR section */}
          {session.canSellPoints && <QrSection />}

          {/* Recent QR sales */}
          {cabinetData && cabinetData.recentQrSales.length > 0 && (
            <section className="px-4 py-4 border-t border-border">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted mb-3">
                Продажи поинтов
              </p>
              <div className="space-y-2">
                {cabinetData.recentQrSales.slice(0, 8).map((sale) => (
                  <div
                    key={sale.saleId}
                    className="flex items-center justify-between gap-2 text-xs"
                  >
                    <span className="font-semibold">{sale.points} pts</span>
                    <span className="font-bold">€{sale.eurAmount.toFixed(2)}</span>
                    <span className="text-muted text-[10px] truncate">
                      {sale.redeemedAt
                        ? new Date(sale.redeemedAt).toLocaleDateString('ru-RU', {
                            day: 'numeric',
                            month: 'short',
                          })
                        : 'не погашен'}
                    </span>
                    {sale.settlementStatus === 'paid' ? (
                      <Check size={12} weight="bold" className="text-green-600 flex-shrink-0" />
                    ) : (
                      <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Completed rides history */}
          {cabinetData && cabinetData.rides.filter((r) => r.status === 'completed').length > 0 && (
            <section className="px-4 py-4 border-t border-border">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted mb-3">
                История поездок
              </p>
              <div className="space-y-2">
                {cabinetData.rides
                  .filter((r) => r.status === 'completed')
                  .slice(0, 10)
                  .map((ride) => {
                    const dt = new Date(ride.dateTime)
                    return (
                      <div key={ride.id} className="flex items-start gap-2">
                        <span className="w-4 h-4 rounded-full bg-accent/20 text-accent text-[9px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                          ✓
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold truncate">
                            №{ride.rideNumber} · {ride.passengerName}
                          </p>
                          <p className="text-[10px] text-muted truncate">{ride.fromAddress}</p>
                          <div className="flex items-center gap-1 mt-0.5 text-[10px] text-muted">
                            <Clock size={9} />
                            {dt.toLocaleDateString('ru-RU', {
                              day: 'numeric',
                              month: 'short',
                            })}{' '}
                            ·{' '}
                            {dt.toLocaleTimeString('ru-RU', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </div>
                        </div>
                      </div>
                    )
                  })}
              </div>
            </section>
          )}
        </div>

        {/* Logout */}
        <div className="px-4 py-4 border-t border-border">
          <button
            onClick={onLogout}
            className="w-full flex items-center justify-center gap-2 h-11 rounded-xl bg-surface text-sm font-semibold text-muted active:bg-border transition-colors"
          >
            <SignOut size={16} weight="bold" />
            Выйти из аккаунта
          </button>
        </div>
      </div>
    </>
  )
}

// ─── QR Sale sub-section ──────────────────────────────────────────────────────

function QrSection() {
  const [points, setPoints] = useState(100)
  const [issue, setIssue] = useState<{
    saleId: string
    token: string
    qrUrl: string
    points: number
    eurAmount: number
  } | null>(null)
  const [isIssuing, setIsIssuing] = useState(false)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!issue?.qrUrl) {
      setQrDataUrl(null)
      return
    }
    let cancelled = false
    void (async () => {
      const mod = await import('qrcode')
      const url = await mod.toDataURL(issue.qrUrl, { width: 280, margin: 1, errorCorrectionLevel: 'H' })
      if (!cancelled) setQrDataUrl(url)
    })().catch(() => { if (!cancelled) setQrDataUrl(null) })
    return () => { cancelled = true }
  }, [issue?.qrUrl])

  if (issue) {
    return (
      <section className="px-4 py-4 border-t border-border">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Покажите пассажиру</p>
            <p className="text-2xl font-extrabold tracking-tight mt-0.5">{issue.points} pts</p>
            <p className="text-[11px] text-muted mt-0.5">
              К получению: <span className="font-bold text-black">€{issue.eurAmount.toFixed(2)}</span>
            </p>
          </div>
          <button
            onClick={() => { hapticSelection(); setIssue(null) }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-pill bg-surface text-[11px] font-semibold active:scale-[0.97] transition-transform flex-shrink-0"
          >
            <ArrowClockwise size={12} weight="bold" />
            Новый
          </button>
        </div>
        <div className="rounded-2xl bg-surface p-3 flex items-center justify-center">
          {qrDataUrl ? (
            <img src={qrDataUrl} alt="QR-чек" className="w-full max-w-[220px] aspect-square object-contain" />
          ) : (
            <div className="w-[220px] h-[220px] rounded-xl bg-border animate-pulse" />
          )}
        </div>
        {error && <p className="mt-2 text-xs text-red-600 font-medium">{error}</p>}
      </section>
    )
  }

  return (
    <section className="px-4 py-4 border-t border-border">
      <div className="flex items-center gap-2.5 mb-4">
        <div className="w-8 h-8 rounded-xl bg-black text-white flex items-center justify-center flex-shrink-0">
          <QrCode size={16} weight="bold" />
        </div>
        <div>
          <p className="text-sm font-bold">Продажа поинтов</p>
          <p className="text-[11px] text-muted">Создайте QR для пассажира</p>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-3">
        <button
          type="button"
          onClick={() => { hapticSelection(); setPoints((v) => Math.max(1, v - 10)) }}
          disabled={isIssuing}
          className="w-10 h-10 rounded-xl bg-surface text-lg font-bold active:scale-[0.95] transition-transform disabled:opacity-40 flex-shrink-0"
        >
          −
        </button>
        <input
          type="number"
          inputMode="numeric"
          min={1}
          value={points || ''}
          onChange={(e) => setPoints(Number(e.target.value) || 0)}
          className="flex-1 h-10 px-2 rounded-xl border-[1.5px] border-border bg-surface text-center text-sm font-bold outline-none focus:border-black focus:bg-white transition-colors"
        />
        <button
          type="button"
          onClick={() => { hapticSelection(); setPoints((v) => v + 10) }}
          disabled={isIssuing}
          className="w-10 h-10 rounded-xl bg-surface text-lg font-bold active:scale-[0.95] transition-transform disabled:opacity-40 flex-shrink-0"
        >
          +
        </button>
      </div>

      <div className="flex gap-1.5 mb-3">
        {QUICK_POINTS.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => { hapticSelection(); setPoints(v) }}
            disabled={isIssuing}
            className={`flex-1 py-1.5 rounded-pill text-xs font-bold transition-all ${
              points === v ? 'bg-black text-white' : 'bg-surface text-black active:scale-[0.95]'
            }`}
          >
            {v}
          </button>
        ))}
      </div>

      <button
        onClick={async () => {
          setIsIssuing(true)
          setError(null)
          try {
            const result = await issueDriverQrSale(points)
            setIssue(result)
            hapticNotification('success')
          } catch (err) {
            hapticNotification('error')
            setError(err instanceof Error ? err.message : 'Не удалось создать QR-чек.')
          } finally {
            setIsIssuing(false)
          }
        }}
        disabled={isIssuing || points < 1}
        className={`w-full h-11 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all ${
          !isIssuing && points >= 1
            ? 'bg-black text-white active:scale-[0.98]'
            : 'bg-surface text-muted cursor-not-allowed'
        }`}
      >
        {isIssuing ? (
          <>
            <div className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
            Создаем QR…
          </>
        ) : (
          <>
            <QrCode size={15} weight="bold" />
            Создать QR-чек
          </>
        )}
      </button>
      {error && <p className="mt-2 text-xs text-red-600 font-medium">{error}</p>}
    </section>
  )
}
