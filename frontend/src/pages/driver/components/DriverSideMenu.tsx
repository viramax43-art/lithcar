import { useEffect, useRef, useState } from 'react'
import {
  ClipboardText,
  Megaphone,
  Prohibit,
  QrCode,
  SignOut,
  Star,
  SteeringWheel,
  X,
} from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'

import type { BlockedUser, DriverRideHistoryItem } from '../../../types'
import type { DriverSessionUser } from '../../../infrastructure/api/contracts'
import {
  redeemPassengerQrSale,
  listBlockedUsersAsDriver,
  unblockUserAsDriver,
  getDriverRideHistory,
} from '../../../lib/backend'
import { hapticNotification, hapticSelection } from '../../../lib/telegram'
import QrScanner from '../../../components/QrScanner'
import LanguageSwitcher from '../../../components/LanguageSwitcher'
import RatingBadge from '../../../components/RatingBadge'
import { useEscapeClose } from '../../../lib/useEscapeClose'
import { formatRideDateTime } from '../../../i18n/dateTime'
import { DRIVER_STATUS_COLOR, DRIVER_STATUS_LABEL_KEY } from '../constants'
import DriverOffersList from './DriverOffersList'

const HISTORY_PAGE_SIZE = 15

interface DriverSideMenuProps {
  isOpen: boolean
  session: DriverSessionUser
  onClose: () => void
  onLogout: () => void
}

export default function DriverSideMenu({
  isOpen,
  session,
  onClose,
  onLogout,
}: DriverSideMenuProps) {
  const { t } = useTranslation()
  const [scanMessage, setScanMessage] = useState<string | null>(null)
  const [isRedeeming, setIsRedeeming] = useState(false)
  const [logoutArmed, setLogoutArmed] = useState(false)
  const [showOffers, setShowOffers] = useState(false)
  const [rideHistory, setRideHistory] = useState<DriverRideHistoryItem[]>([])
  const [historyTotal, setHistoryTotal] = useState(0)
  const [isHistoryLoading, setIsHistoryLoading] = useState(false)
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([])
  const [isBlockedLoading, setIsBlockedLoading] = useState(false)
  const [unblockingUserId, setUnblockingUserId] = useState<string | null>(null)
  const logoutArmTimer = useRef<number | null>(null)

  const canLoadMoreHistory = rideHistory.length < historyTotal

  const loadRideHistory = async (offset: number, append: boolean) => {
    setIsHistoryLoading(true)
    try {
      const page = await getDriverRideHistory({ limit: HISTORY_PAGE_SIZE, offset })
      setHistoryTotal(page.total)
      setRideHistory((prev) => (append ? [...prev, ...page.items] : page.items))
    } catch {
      if (!append) {
        setRideHistory([])
        setHistoryTotal(0)
      }
    } finally {
      setIsHistoryLoading(false)
    }
  }

  useEffect(() => {
    if (!isOpen) return
    void loadRideHistory(0, false)
    void (async () => {
      setIsBlockedLoading(true)
      try {
        const page = await listBlockedUsersAsDriver()
        setBlockedUsers(page.items.map((item) => ({
          userId: item.userId,
          username: item.username,
          displayName: item.displayName,
          blockedAt: item.blockedAt,
          blockedAtLocal: item.blockedAtLocal,
        })))
      } catch {
        setBlockedUsers([])
      } finally {
        setIsBlockedLoading(false)
      }
    })()
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) {
      setLogoutArmed(false)
    }
    return () => {
      if (logoutArmTimer.current) window.clearTimeout(logoutArmTimer.current)
    }
  }, [isOpen])

  useEscapeClose(isOpen, onClose)

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-[40] bg-black/40"
          onClick={onClose}
        />
      )}

      <div
        className="fixed top-0 left-0 bottom-0 z-[50] w-[300px] bg-white shadow-[4px_0_24px_rgba(0,0,0,0.18)] flex flex-col transition-transform duration-300 will-change-transform"
        style={{
          transform: isOpen ? 'translateX(0)' : 'translateX(-100%)',
          paddingTop: 'var(--app-safe-area-top-total)',
          paddingBottom: 'var(--app-safe-area-bottom-total)',
        }}
      >
        <div className="px-4 py-4 flex items-center justify-between gap-3 border-b border-border">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-black text-white flex items-center justify-center flex-shrink-0">
              <SteeringWheel size={18} weight="fill" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-extrabold truncate">{session.name}</p>
              <p className="text-[11px] text-muted mt-0.5 flex items-center gap-1">
                <Star size={11} weight="fill" className="text-amber-400" />
                {t('driver.yourRating', { rating: session.rating.toFixed(1), defaultValue: `Your rating ${session.rating.toFixed(1)}` })}
                {session.ratingCount > 0 && <span>({session.ratingCount})</span>}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-surface flex items-center justify-center flex-shrink-0 active:scale-95 transition-transform"
          >
            <X size={16} weight="bold" className="text-muted" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <section className="px-4 py-4">
            <LanguageSwitcher />
          </section>

          <section className="px-4 py-3 border-t border-border">
            <button
              onClick={() => {
                hapticSelection()
                setShowOffers(true)
                onClose()
              }}
              className="w-full flex items-center gap-3 px-3 py-3.5 rounded-xl hover:bg-surface active:bg-surface transition-colors text-left"
            >
              <div className="w-9 h-9 rounded-xl bg-surface flex items-center justify-center flex-shrink-0">
                <Megaphone size={18} weight="duotone" />
              </div>
              <div>
                <p className="text-sm font-bold">{t('driver.offers.myOffers', { defaultValue: 'My offers' })}</p>
                <p className="text-[11px] text-muted">{t('driver.offers.title', { defaultValue: 'Ride offers' })}</p>
              </div>
            </button>
          </section>

          <section className="px-4 py-4 border-t border-border space-y-3">
            <div className="flex items-center gap-2">
              <ClipboardText size={16} weight="duotone" className="text-muted" />
              <p className="text-sm font-bold">{t('driver.history', { defaultValue: 'Ride history' })}</p>
            </div>
            {isHistoryLoading && rideHistory.length === 0 && (
              <p className="text-xs text-muted">{t('common.loading', { defaultValue: 'Loading...' })}</p>
            )}
            {!isHistoryLoading && rideHistory.length === 0 && (
              <p className="text-xs text-muted">{t('profile.noRides', { defaultValue: 'No rides yet.' })}</p>
            )}
            {rideHistory.map((ride) => {
              const statusColors = DRIVER_STATUS_COLOR[ride.status]
              return (
                <div key={ride.id} className="rounded-xl bg-surface/70 p-3 space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold truncate">{ride.passengerName}</p>
                      <RatingBadge
                        rating={ride.passengerRating}
                        ratingCount={ride.passengerRatingCount}
                        size="sm"
                      />
                    </div>
                    <span
                      className="text-[10px] font-bold px-2 py-0.5 rounded-pill flex-shrink-0"
                      style={{ color: statusColors.color, background: statusColors.bg }}
                    >
                      {t(DRIVER_STATUS_LABEL_KEY[ride.status], { defaultValue: ride.status })}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted truncate">{ride.fromAddress}</p>
                  <p className="text-[11px] text-muted truncate">{ride.toAddress}</p>
                  <div className="flex items-center justify-between gap-2 pt-0.5">
                    <p className="text-[10px] text-muted">
                      {formatRideDateTime(ride, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </p>
                    <span className="text-[10px] font-semibold text-muted">№{ride.rideNumber}</span>
                  </div>
                </div>
              )
            })}
            {canLoadMoreHistory && (
              <button
                type="button"
                disabled={isHistoryLoading}
                onClick={() => void loadRideHistory(rideHistory.length, true)}
                className="w-full py-2.5 rounded-xl bg-surface text-xs font-semibold text-muted active:bg-border/40 disabled:opacity-60"
              >
                {isHistoryLoading
                  ? t('common.loading', { defaultValue: 'Loading...' })
                  : t('common.showMoreWithCount', {
                      loaded: rideHistory.length,
                      total: historyTotal,
                      defaultValue: `Show more (${rideHistory.length} of ${historyTotal})`,
                    })}
              </button>
            )}
          </section>

          <section className="px-4 py-4 border-t border-border space-y-3">
            <div className="flex items-center gap-2">
              <Prohibit size={16} weight="duotone" className="text-muted" />
              <p className="text-sm font-bold">{t('block.blockedList', { defaultValue: 'Blocked users' })}</p>
            </div>
            {isBlockedLoading && (
              <p className="text-xs text-muted">{t('common.loading', { defaultValue: 'Loading...' })}</p>
            )}
            {!isBlockedLoading && blockedUsers.length === 0 && (
              <p className="text-xs text-muted">{t('block.blockedListEmpty', { defaultValue: 'No blocked users' })}</p>
            )}
            {blockedUsers.map((user) => (
              <div key={user.userId} className="rounded-xl bg-surface/70 p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{user.displayName}</p>
                  {user.username && <p className="text-[11px] text-muted truncate">@{user.username}</p>}
                </div>
                <button
                  type="button"
                  disabled={unblockingUserId === user.userId}
                  onClick={() => {
                    void (async () => {
                      setUnblockingUserId(user.userId)
                      try {
                        await unblockUserAsDriver(user.userId)
                        setBlockedUsers((prev) => prev.filter((item) => item.userId !== user.userId))
                      } catch {
                        // ignore
                      } finally {
                        setUnblockingUserId(null)
                      }
                    })()
                  }}
                  className="shrink-0 min-h-[36px] px-3 py-1.5 rounded-pill border border-border text-xs font-bold text-muted active:bg-surface"
                >
                  {unblockingUserId === user.userId
                    ? t('common.loading', { defaultValue: 'Loading...' })
                    : t('block.unblock', { defaultValue: 'Unblock' })}
                </button>
              </div>
            ))}
          </section>

          <section className="px-4 py-4 border-t border-border">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-8 h-8 rounded-xl bg-black text-white flex items-center justify-center flex-shrink-0">
                <QrCode size={16} weight="bold" />
              </div>
              <div>
                <p className="text-sm font-bold">{t('driver.scanPassengerQr', { defaultValue: 'Scan passenger QR' })}</p>
                <p className="text-[11px] text-muted">{t('driver.scanPassengerQrHint', { defaultValue: 'After scan, points will be credited to passenger' })}</p>
              </div>
            </div>

            <QrScanner
              autoStart={isOpen}
              onTokenRead={(token) => {
                void (async () => {
                  setIsRedeeming(true)
                  setScanMessage(null)
                  try {
                    const result = await redeemPassengerQrSale(token)
                    hapticNotification('success')
                    setScanMessage(
                      t('driver.qrPointsCredited', {
                        points: result.pointsAdded,
                        passengerId: result.passengerId,
                        defaultValue: `Credited ${result.pointsAdded} pts to passenger (${result.passengerId}).`,
                      }),
                    )
                  } catch (error) {
                    hapticNotification('error')
                    setScanMessage(error instanceof Error ? error.message : t('errors.processQrFailed', { defaultValue: 'Failed to process QR.' }))
                  } finally {
                    setIsRedeeming(false)
                  }
                })()
              }}
            />
            {isRedeeming && (
              <p className="mt-3 text-xs text-muted">{t('driver.confirmingQr', { defaultValue: 'Confirming QR...' })}</p>
            )}
            {scanMessage && (
              <div className="mt-3 rounded-xl bg-surface px-3 py-2.5 text-xs font-medium text-black">
                {scanMessage}
              </div>
            )}
          </section>
        </div>

        <div className="px-4 py-4 border-t border-border">
          <button
            onClick={() => {
              if (!logoutArmed) {
                setLogoutArmed(true)
                if (logoutArmTimer.current) window.clearTimeout(logoutArmTimer.current)
                logoutArmTimer.current = window.setTimeout(() => setLogoutArmed(false), 3500)
                return
              }
              if (logoutArmTimer.current) window.clearTimeout(logoutArmTimer.current)
              setLogoutArmed(false)
              onLogout()
            }}
            className={`w-full flex items-center justify-center gap-2 h-11 rounded-xl text-sm font-semibold transition-colors ${
              logoutArmed
                ? 'bg-red-600 text-white'
                : 'bg-surface text-muted active:bg-border'
            }`}
          >
            <SignOut size={16} weight="bold" />
            {logoutArmed
              ? t('driver.logoutConfirm', { defaultValue: 'Sign out for sure?' })
              : t('driver.logoutAccount', { defaultValue: 'Sign out' })}
          </button>
        </div>
      </div>

      {showOffers && <DriverOffersList onClose={() => setShowOffers(false)} />}
    </>
  )
}
