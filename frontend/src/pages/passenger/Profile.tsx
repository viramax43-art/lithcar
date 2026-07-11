import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  CaretRight,
  Car,
  Check,
  CheckCircle,
  Clock,
  Coins,
  Copy,
  CreditCard,
  Info,
  PaperPlaneTilt,
  Star,
  LockKey,
  QrCode,
  SealWarning,
  UserCircle,
  X,
} from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'
import Skeleton from '../../components/Skeleton'
import LanguageSwitcher from '../../components/LanguageSwitcher'
import NotificationBell from '../../components/notifications/NotificationBell'
import { ApiError, getMyDriverApplication, getPricing, getUserCabinet, issuePassengerQrSale, listBlockedUsers, parseApiErrorCode, purchasePointsByCard, transferPoints, unblockUser, updateCurrentUserLanguage } from '../../lib/backend'
import { formatRideDateTime } from '../../i18n/dateTime'
import { enterDriverCabinet } from '../../lib/driverPortal'
import { DEFAULT_PRICING_SETTINGS } from '../../lib/pricingDefaults'
import { resolveUserInfoText, hasUserInfoText } from '../../lib/userInfoText'
import { hapticNotification, hapticSelection } from '../../lib/telegram'
import { useEscapeClose } from '../../lib/useEscapeClose'
import type { AppLanguage } from '../../i18n/languages'
import type { BlockedUser, DriverApplication, PricingSettings, UserCabinetData, UserCabinetRideHistoryItem } from '../../types'

type RedeemReceipt = {
  pointsRequested: number
  eurAmount: number
}

type CardReceipt = {
  pointsAdded: number
  eurAmount: number
}

type TransferReceipt = {
  points: number
  recipientName: string
}

export default function Profile() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const [cabinet, setCabinet] = useState<UserCabinetData | null>(null)
  const [pricing, setPricing] = useState<PricingSettings>(DEFAULT_PRICING_SETTINGS)
  const userInfoMessage = resolveUserInfoText(pricing.userInfoTextProfile, i18n.language)
  const [historyItems, setHistoryItems] = useState<UserCabinetRideHistoryItem[]>([])
  const [historyTotal, setHistoryTotal] = useState(0)
  const [isHistoryLoading, setIsHistoryLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [isQrSheetOpen, setIsQrSheetOpen] = useState(false)
  const [isBuySheetOpen, setIsBuySheetOpen] = useState(false)
  const [isTransferSheetOpen, setIsTransferSheetOpen] = useState(false)
  const [lastReceipt, setLastReceipt] = useState<RedeemReceipt | null>(null)
  const [lastCardReceipt, setLastCardReceipt] = useState<CardReceipt | null>(null)
  const [lastTransferReceipt, setLastTransferReceipt] = useState<TransferReceipt | null>(null)
  const [driverApplication, setDriverApplication] = useState<DriverApplication | null | undefined>(undefined)
  const [isEnteringDriverCabinet, setIsEnteringDriverCabinet] = useState(false)
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([])
  const [isBlockedLoading, setIsBlockedLoading] = useState(false)
  const [unblockingUserId, setUnblockingUserId] = useState<string | null>(null)

  const historyPageSize = 20

  const handleOpenDriverCabinet = async () => {
    setIsEnteringDriverCabinet(true)
    setErrorMessage(null)
    try {
      await enterDriverCabinet()
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : t('profile.becomeDriver.openCabinetFailed', { defaultValue: 'Failed to open driver cabinet.' }),
      )
    } finally {
      setIsEnteringDriverCabinet(false)
    }
  }

  const loadCabinet = async (offset: number, append: boolean) => {
    if (append) setIsHistoryLoading(true)
    if (!append) setLoadFailed(false)
    try {
      const response = await getUserCabinet({ limit: historyPageSize, offset })
      setCabinet(response)
      setHistoryTotal(response.rideHistoryTotal)
      setHistoryItems((prev) => (append ? [...prev, ...response.rideHistory] : response.rideHistory))
      setErrorMessage(null)
    } catch (error) {
      if (!append) setLoadFailed(true)
      setErrorMessage(error instanceof Error ? error.message : t('errors.loadProfileFailed', { defaultValue: 'Failed to load profile.' }))
    } finally {
      setIsHistoryLoading(false)
    }
  }

  useEffect(() => {
    void loadCabinet(0, false)
    void getPricing()
      .then((value) => setPricing(value))
      .catch(() => undefined)
    void getMyDriverApplication()
      .then((value) => setDriverApplication(value))
      .catch(() => setDriverApplication(null))
    void (async () => {
      setIsBlockedLoading(true)
      try {
        const page = await listBlockedUsers()
        setBlockedUsers(page.items.map((item) => ({
          userId: item.userId,
          username: item.username,
          displayName: item.displayName,
          blockedAt: item.blockedAt,
          blockedAtLocal: item.blockedAtLocal,
        })))
      } catch {
        // non-critical
      } finally {
        setIsBlockedLoading(false)
      }
    })()
  }, []) // single initial load

  const sortedHistory = useMemo(() => {
    return [...historyItems].sort(
      (a: UserCabinetRideHistoryItem, b: UserCabinetRideHistoryItem) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
  }, [historyItems])

  const canLoadMoreHistory = historyItems.length < historyTotal

  const openQrSheet = () => {
    hapticSelection()
    setErrorMessage(null)
    setIsQrSheetOpen(true)
  }

  const openBuySheet = () => {
    hapticSelection()
    setErrorMessage(null)
    setIsBuySheetOpen(true)
  }

  const openTransferSheet = () => {
    hapticSelection()
    setErrorMessage(null)
    setIsTransferSheetOpen(true)
  }

  const handleIssued = (receipt: RedeemReceipt) => {
    setLastReceipt(receipt)
    setLastCardReceipt(null)
    setLastTransferReceipt(null)
  }

  const handleCardPurchased = (points: number, newBalance: number, eurAmount: number) => {
    setCabinet((prev) => (prev ? { ...prev, pointsBalance: newBalance } : prev))
    setLastCardReceipt({ pointsAdded: points, eurAmount })
    setLastReceipt(null)
    setLastTransferReceipt(null)
  }

  const handlePointsTransferred = (points: number, newBalance: number, recipientName: string) => {
    setCabinet((prev) => (prev ? { ...prev, pointsBalance: newBalance } : prev))
    setLastTransferReceipt({ points, recipientName })
    setLastReceipt(null)
    setLastCardReceipt(null)
  }

  return (
    <div className="fixed inset-0 z-[200] bg-white flex flex-col overflow-x-hidden animate-slide-in-right">
      <header
        className="flex-shrink-0 bg-white border-b border-border/50"
        style={{ paddingTop: 'var(--app-user-safe-top)' }}
      >
        <div className="flex items-center gap-3 px-3 h-14 w-full max-w-2xl mx-auto">
          <button
            onClick={() => navigate(-1)}
            className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-surface transition-colors flex-shrink-0"
          >
            <ArrowLeft size={20} weight="bold" />
          </button>
          <h1 className="text-base font-extrabold tracking-tight flex-1">{t('profile.title', { defaultValue: 'Profile' })}</h1>
          <NotificationBell pool="passenger" />
        </div>
      </header>

      <div className="flex-1 overflow-y-auto" style={{ paddingBottom: 'var(--app-user-safe-bottom)' }}>
      <div className="p-4 space-y-4 w-full max-w-2xl mx-auto">
        {loadFailed && !cabinet ? (
          <section className="bg-white border border-border rounded-card p-6 flex flex-col items-center text-center gap-3">
            <SealWarning size={32} className="text-red-500" weight="duotone" />
            <p className="text-sm font-bold">{t('errors.loadProfileFailed', { defaultValue: 'Failed to load profile.' })}</p>
            {errorMessage && <p className="text-xs text-muted break-words max-w-full">{errorMessage}</p>}
            <button
              type="button"
              onClick={() => void loadCabinet(0, false)}
              className="mt-1 px-6 py-2.5 bg-black text-white text-sm font-bold rounded-pill active:scale-[0.97] transition-transform"
            >
              {t('common.retry', { defaultValue: 'Retry' })}
            </button>
          </section>
        ) : (
          errorMessage && <p className="text-xs font-medium text-red-600">{errorMessage}</p>
        )}

        {!(loadFailed && !cabinet) && (
        <section className="bg-black text-white rounded-card p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <UserCircle size={22} weight="fill" />
              {cabinet ? (
                <p className="text-sm font-semibold truncate">{cabinet.username || t('profile.defaultUser', { defaultValue: 'User' })}</p>
              ) : (
                <Skeleton width={120} height={14} className="!bg-white/15" rounded="sm" />
              )}
            </div>
            {cabinet && cabinet.ratingCount > 0 ? (
              <span className="inline-flex items-center gap-0.5 text-xs font-bold text-amber-400 shrink-0">
                <Star size={12} weight="fill" />
                {cabinet.rating.toFixed(1)}
                <span className="text-white/50 font-semibold">({cabinet.ratingCount})</span>
              </span>
            ) : cabinet ? (
              <span className="inline-flex items-center gap-0.5 text-xs font-bold text-amber-400 shrink-0">
                <Star size={12} weight="fill" />
                {cabinet.rating.toFixed(1)}
              </span>
            ) : null}
          </div>

          {cabinet ? (
            <UserIdCopyRow userId={cabinet.userId} />
          ) : (
            <Skeleton width="100%" height={36} className="!bg-white/15" rounded="lg" />
          )}

          <div className="space-y-1">
            <p className="text-xs text-white/70">{t('profile.balance', { defaultValue: 'Balance' })}</p>
            <div className="flex items-center gap-2">
              <Coins size={22} weight="fill" className="text-accent" />
              {cabinet ? (
                <p className="text-2xl font-extrabold break-all">{cabinet.pointsBalance ?? 0} pts</p>
              ) : (
                <Skeleton width={110} height={28} className="!bg-white/15" rounded="md" />
              )}
            </div>
          </div>

          <button
            onClick={openBuySheet}
            className="mt-2 w-full flex items-center gap-3 rounded-2xl bg-white text-black px-4 py-3 active:scale-[0.98] transition-transform"
          >
            <span className="w-10 h-10 rounded-xl bg-accent/15 text-accent-dark flex items-center justify-center flex-shrink-0">
              <CreditCard size={22} weight="bold" />
            </span>
            <span className="flex-1 text-left min-w-0">
              <span className="block text-sm font-bold">{t('profile.buyPoints', { defaultValue: 'Buy points' })}</span>
              <span className="block text-[11px] text-muted truncate">{t('profile.buyPointsCardDesc', { defaultValue: 'Card payment · instant' })}</span>
            </span>
            <CaretRight size={16} weight="bold" className="text-muted flex-shrink-0" />
          </button>

          <button
            onClick={openTransferSheet}
            className="w-full flex items-center gap-3 rounded-2xl bg-white/10 border border-white/15 text-white px-4 py-2.5 active:scale-[0.98] transition-transform"
          >
            <span className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0">
              <PaperPlaneTilt size={18} weight="bold" />
            </span>
            <span className="flex-1 text-left min-w-0">
              <span className="block text-[13px] font-semibold">{t('profile.transferPoints', { defaultValue: 'Send points' })}</span>
              <span className="block text-[11px] text-white/60 truncate">{t('profile.transferPointsDesc', { defaultValue: 'Transfer to another user by ID' })}</span>
            </span>
            <CaretRight size={14} weight="bold" className="text-white/50 flex-shrink-0" />
          </button>

          <button
            onClick={openQrSheet}
            className="w-full flex items-center gap-3 rounded-2xl bg-white/10 border border-white/15 text-white px-4 py-2.5 active:scale-[0.98] transition-transform"
          >
            <span className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0">
              <QrCode size={18} weight="bold" />
            </span>
            <span className="flex-1 text-left min-w-0">
              <span className="block text-[13px] font-semibold">{t('profile.createQrForDriver', { defaultValue: 'Create QR for driver' })}</span>
              <span className="block text-[11px] text-white/60 truncate">{t('profile.qrScanDesc', { defaultValue: 'Driver scans and credits points' })}</span>
            </span>
            <CaretRight size={14} weight="bold" className="text-white/50 flex-shrink-0" />
          </button>

          {lastTransferReceipt && (
            <div className="mt-1 rounded-2xl bg-white/10 border border-white/15 px-3 py-2.5 flex items-center gap-2.5">
              <CheckCircle size={18} weight="fill" className="text-accent flex-shrink-0" />
              <p className="text-[11px] leading-snug text-white/90 min-w-0">
                <span className="font-bold">−{lastTransferReceipt.points} pts</span>
                {' · '}
                <span className="text-white/70">
                  {t('profile.transferSent', {
                    name: lastTransferReceipt.recipientName,
                    defaultValue: `Sent to ${lastTransferReceipt.recipientName}`,
                  })}
                </span>
              </p>
            </div>
          )}

          {lastCardReceipt && (
            <div className="mt-1 rounded-2xl bg-white/10 border border-white/15 px-3 py-2.5 flex items-center gap-2.5">
              <CheckCircle size={18} weight="fill" className="text-accent flex-shrink-0" />
              <p className="text-[11px] leading-snug text-white/90 min-w-0">
                <span className="font-bold">+{lastCardReceipt.pointsAdded} pts</span>
                {' · '}
                <span className="text-white/70">{t('profile.paidByCard', { amount: lastCardReceipt.eurAmount.toFixed(2), defaultValue: `paid by card €${lastCardReceipt.eurAmount.toFixed(2)}` })}</span>
              </p>
            </div>
          )}

          {lastReceipt && (
            <div className="mt-1 rounded-2xl bg-white/10 border border-white/15 px-3 py-2.5 flex items-center gap-2.5">
              <CheckCircle size={18} weight="fill" className="text-accent flex-shrink-0" />
              <p className="text-[11px] leading-snug text-white/90 min-w-0">
                <span className="font-bold">{t('profile.qrRequested', { points: lastReceipt.pointsRequested, defaultValue: `Requested ${lastReceipt.pointsRequested} pts` })}</span>
                {' · '}
                <span className="text-white/70">{t('profile.driverWillCreditByQr', { amount: lastReceipt.eurAmount.toFixed(2), defaultValue: `driver will credit via QR · €${lastReceipt.eurAmount.toFixed(2)}` })}</span>
              </p>
            </div>
          )}
        </section>
        )}

        <section className="bg-white border border-border rounded-card p-4 space-y-3">
          <p className="text-sm font-bold">{t('profile.becomeDriver.title')}</p>
          {driverApplication === undefined ? (
            <p className="text-xs text-muted">{t('common.loading')}</p>
          ) : driverApplication === null ? (
            <button
              type="button"
              onClick={() => navigate('/driver/register')}
              className="w-full flex items-center gap-3 rounded-xl bg-surface px-3 py-3 text-left hover:bg-border/30 active:bg-border/40 transition-colors"
            >
              <span className="w-9 h-9 rounded-xl bg-white border border-border flex items-center justify-center flex-shrink-0">
                <Car size={18} weight="duotone" />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-[13px] font-semibold">{t('profile.becomeDriver.apply')}</span>
                <span className="block text-[11px] text-muted">{t('profile.becomeDriver.applyHint')}</span>
              </span>
              <CaretRight size={14} weight="bold" className="text-muted flex-shrink-0" />
            </button>
          ) : driverApplication.status === 'pending' ? (
            <div className="rounded-xl bg-surface px-3 py-3 flex items-start gap-3">
              <Clock size={18} weight="duotone" className="text-black flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-[13px] font-semibold">{t('profile.becomeDriver.pending')}</p>
                <p className="text-[11px] text-muted mt-1">{t('profile.becomeDriver.pendingHint')}</p>
              </div>
            </div>
          ) : driverApplication.status === 'rejected' ? (
            <div className="space-y-2">
              <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-3 flex items-start gap-3">
                <SealWarning size={18} className="text-red-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-[13px] font-semibold text-red-700">{t('profile.becomeDriver.rejected')}</p>
                  {driverApplication.rejectionReason && (
                    <p className="text-[11px] text-red-600 mt-1">{driverApplication.rejectionReason}</p>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => navigate('/driver/register')}
                className="w-full h-10 rounded-pill bg-black text-white text-xs font-bold"
              >
                {t('profile.becomeDriver.resubmit')}
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="rounded-xl bg-surface px-3 py-3 flex items-start gap-3">
                <CheckCircle size={18} weight="duotone" className="text-emerald-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-[13px] font-semibold">{t('profile.becomeDriver.approved')}</p>
                  <p className="text-[11px] text-muted mt-1">{t('profile.becomeDriver.approvedHint')}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void handleOpenDriverCabinet()}
                disabled={isEnteringDriverCabinet}
                className="w-full h-10 rounded-pill bg-black text-white text-xs font-bold disabled:opacity-60"
              >
                {isEnteringDriverCabinet
                  ? t('profile.becomeDriver.openingCabinet', { defaultValue: 'Opening...' })
                  : t('profile.becomeDriver.openCabinet')}
              </button>
            </div>
          )}
        </section>

        <section className="bg-white border border-border rounded-card p-4 space-y-3">
          <p className="text-sm font-bold">{t('profile.rideHistory', { defaultValue: 'Ride history' })}</p>
          {hasUserInfoText(pricing.userInfoTextProfile) && userInfoMessage && (
            <div className="flex items-center gap-2.5 rounded-xl border border-border bg-surface px-3 py-2.5">
              <Info size={14} weight="fill" className="text-muted flex-shrink-0 self-center" />
              <p className="text-xs text-black leading-snug">{userInfoMessage}</p>
            </div>
          )}
          {!cabinet && !loadFailed && (
            <div className="space-y-2">
              {[0, 1, 2].map((index) => (
                <div key={index} className="rounded-xl bg-surface p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <Skeleton width="60%" height={12} />
                    <Skeleton width={56} height={10} />
                  </div>
                  <Skeleton width="75%" height={12} />
                  <Skeleton width={120} height={10} />
                </div>
              ))}
            </div>
          )}
          {cabinet && sortedHistory.length === 0 && <p className="text-xs text-muted">{t('profile.noRides', { defaultValue: 'No rides yet.' })}</p>}
          {sortedHistory.map((ride) => (
            <button
              key={ride.id}
              type="button"
              onClick={() => navigate(`/requests/${ride.id}`)}
              className="w-full text-left rounded-xl bg-surface p-3 space-y-1 hover:bg-border/30 active:bg-border/40 transition-colors"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold truncate min-w-0">{ride.from.address}</p>
                <div className="flex items-center gap-2 shrink-0">
                  {ride.canRateDriver && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-pill bg-amber-100 text-amber-800">
                      {t('rating.rate', { defaultValue: 'Rate' })}
                    </span>
                  )}
                  <span className="text-[10px] font-semibold text-muted">№{ride.rideNumber}</span>
                  <span className="text-[10px] text-muted">{t(`status.${ride.status}`, { defaultValue: ride.status })}</span>
                </div>
              </div>
              <p className="text-xs text-muted truncate">{ride.to.address}</p>
              <p className="text-[10px] text-muted">
                {formatRideDateTime(ride, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </p>
            </button>
          ))}
          {canLoadMoreHistory && (
            <button
              onClick={() => void loadCabinet(historyItems.length, true)}
              disabled={isHistoryLoading}
              className={`w-full py-2.5 rounded-xl text-xs font-semibold ${
                !isHistoryLoading ? 'bg-surface text-black' : 'bg-surface text-muted'
              }`}
            >
              {isHistoryLoading ? t('common.loading', { defaultValue: 'Loading...' }) : t('profile.showMore', { defaultValue: 'Show more' })}
            </button>
          )}
        </section>
        <section className="bg-white border border-border rounded-card p-4 space-y-3">
          <p className="text-sm font-bold">{t('block.blockedList', { defaultValue: 'Blocked users' })}</p>
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
                      await unblockUser(user.userId)
                      setBlockedUsers((prev) => prev.filter((item) => item.userId !== user.userId))
                    } catch (error) {
                      setErrorMessage(
                        error instanceof Error
                          ? error.message
                          : t('errors.blockFailed', { defaultValue: 'Failed to update block list' }),
                      )
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
        <section className="bg-white border border-border rounded-card p-4">
          <LanguageSwitcher
            onChangeLanguage={async (language: AppLanguage) => {
              try {
                await updateCurrentUserLanguage(language)
              } catch {
                // keep local value even if backend update fails
              }
            }}
          />
        </section>
      </div>
      </div>

      {isQrSheetOpen && (
        <QrIssueSheet
          onClose={() => setIsQrSheetOpen(false)}
          onIssued={handleIssued}
        />
      )}

      {isBuySheetOpen && (
        <BuyPointsSheet
          pricing={pricing}
          onClose={() => setIsBuySheetOpen(false)}
          onPurchased={(pts, newBal, eur) => handleCardPurchased(pts, newBal, eur)}
        />
      )}

      {isTransferSheetOpen && cabinet && (
        <TransferPointsSheet
          currentBalance={cabinet.pointsBalance}
          currentUserId={cabinet.userId}
          onClose={() => setIsTransferSheetOpen(false)}
          onTransferred={(pts, newBal, recipientName) => handlePointsTransferred(pts, newBal, recipientName)}
        />
      )}
    </div>
  )
}

function UserIdCopyRow({ userId }: { userId: string }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const copyResetRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (copyResetRef.current) clearTimeout(copyResetRef.current)
    }
  }, [])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(userId)
      hapticSelection()
      setCopied(true)
      if (copyResetRef.current) clearTimeout(copyResetRef.current)
      copyResetRef.current = setTimeout(() => setCopied(false), 1800)
    } catch {
      // clipboard unavailable
    }
  }

  return (
    <button
      type="button"
      onClick={() => void handleCopy()}
      className="w-full rounded-xl bg-white/10 border border-white/15 px-3 py-2.5 flex items-center gap-3 text-left active:scale-[0.98] transition-transform min-w-0"
    >
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-semibold text-white/60 uppercase tracking-wide">
          {t('profile.userId', { defaultValue: 'Your ID' })}
        </p>
        <p className="text-sm font-bold font-mono tracking-wide truncate">{userId}</p>
        <p className="text-[10px] text-white/50 mt-0.5 truncate">
          {t('profile.userIdHint', { defaultValue: 'Share this ID to receive points' })}
        </p>
      </div>
      <span
        className={`flex items-center gap-1 text-[11px] font-bold flex-shrink-0 ${
          copied ? 'text-accent' : 'text-white/70'
        }`}
      >
        {copied ? <Check size={14} weight="bold" /> : <Copy size={14} weight="bold" />}
        {copied
          ? t('profile.copiedId', { defaultValue: 'Copied' })
          : t('profile.copyId', { defaultValue: 'Copy' })}
      </span>
    </button>
  )
}

function QrIssueSheet({
  onClose,
  onIssued,
}: {
  onClose: () => void
  onIssued: (receipt: RedeemReceipt) => void
}) {
  const { t } = useTranslation()
  const [points, setPoints] = useState<number>(100)
  const [isCreating, setIsCreating] = useState(false)
  useEscapeClose(!isCreating, onClose)
  const [error, setError] = useState<string | null>(null)
  const [issue, setIssue] = useState<{
    token: string
    qrUrl: string
    points: number
    eurAmount: number
  } | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)

  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [])

  useEffect(() => {
    if (!issue?.qrUrl) {
      setQrDataUrl(null)
      return
    }
    let cancelled = false
    void (async () => {
      const qrcode = await import('qrcode')
      const url = await qrcode.toDataURL(issue.qrUrl, {
        width: 300,
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

  const createQr = async () => {
    if (!points || points < 1 || isCreating) return
    setIsCreating(true)
    setError(null)
    try {
      const response = await issuePassengerQrSale(points)
      hapticNotification('success')
      setIssue({
        token: response.token,
        qrUrl: response.qrUrl,
        points: response.points,
        eurAmount: response.eurAmount,
      })
      onIssued({
        pointsRequested: response.points,
        eurAmount: response.eurAmount,
      })
    } catch (err) {
      hapticNotification('error')
      setError(err instanceof Error ? err.message : t('profile.qrCreateFailed', { defaultValue: 'Failed to create QR.' }))
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center"
      onClick={() => !isCreating && onClose()}
    >
      <div
        className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-card shadow-card flex flex-col max-h-[92dvh]"
        style={{ paddingBottom: 'var(--app-user-safe-bottom)' }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <div className="min-w-0">
            <p className="text-base font-extrabold tracking-tight">{t('profile.qrPointsTitle', { defaultValue: 'QR to receive points' })}</p>
            <p className="text-[11px] text-muted">{t('profile.qrShowToDriver', { defaultValue: 'Show QR to driver for scanning' })}</p>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-pill bg-surface flex items-center justify-center active:scale-[0.95] transition-transform"
            aria-label={t('common.close', { defaultValue: 'Close' })}
          >
            <X size={16} weight="bold" />
          </button>
        </div>

        <div className="px-5 pb-5 pt-2 overflow-y-auto space-y-4">
          {!issue ? (
            <>
              <div className="space-y-2">
                <label className="text-[11px] font-semibold text-muted">{t('profile.qrPointsNeeded', { defaultValue: 'How many points do you need' })}</label>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={points || ''}
                  onChange={(event) => setPoints(Number(event.target.value) || 0)}
                  className="w-full h-12 px-4 rounded-2xl border-[1.5px] border-border bg-surface text-base font-bold outline-none focus:border-black focus:bg-white transition-colors"
                />
              </div>
              <button
                onClick={() => void createQr()}
                disabled={isCreating || points < 1}
                className={`w-full h-12 rounded-2xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${
                  !isCreating && points >= 1 ? 'bg-black text-white active:scale-[0.98]' : 'bg-surface text-muted'
                }`}
              >
                {isCreating ? t('profile.creatingQr', { defaultValue: 'Creating QR…' }) : t('profile.createQr', { defaultValue: 'Create QR' })}
              </button>
              {error && <p className="text-xs text-red-600">{error}</p>}
            </>
          ) : (
            <div className="space-y-3">
              <div className="rounded-2xl bg-surface p-3 flex items-center justify-center">
                {qrDataUrl ? (
                  <img src={qrDataUrl} alt={t('profile.qrImageAlt', { defaultValue: 'QR to receive points' })} className="w-full max-w-[240px] aspect-square object-contain" />
                ) : (
                  <div className="w-[240px] h-[240px] rounded-xl bg-border animate-pulse" />
                )}
              </div>
              <p className="text-center text-sm font-bold">{issue.points} pts</p>
              <p className="text-center text-xs text-muted">{t('profile.cashDue', { amount: issue.eurAmount.toFixed(2), defaultValue: `Cash due: €${issue.eurAmount.toFixed(2)}` })}</p>
              <button
                onClick={() => setIssue(null)}
                className="w-full h-11 rounded-2xl bg-surface text-sm font-semibold"
              >
                {t('profile.createAnotherQr', { defaultValue: 'Create another QR' })}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const BUY_PRESETS = [50, 100, 200, 500]

function BuyPointsSheet({
  pricing,
  onClose,
  onPurchased,
}: {
  pricing: PricingSettings
  onClose: () => void
  onPurchased: (points: number, newBalance: number, eurAmount: number) => void
}) {
  const { t } = useTranslation()
  const [points, setPoints] = useState<number>(100)
  const [stage, setStage] = useState<'form' | 'processing' | 'success'>('form')
  const [payError, setPayError] = useState<string | null>(null)
  useEscapeClose(stage !== 'processing', onClose)

  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [])

  const eurAmount = useMemo(
    () => Math.max(0, points) * (pricing.pointPriceCents / 100),
    [points, pricing.pointPriceCents],
  )

  const canPay = stage === 'form' && points >= 1

  const handlePay = async () => {
    if (!canPay) return
    hapticSelection()
    setStage('processing')
    setPayError(null)
    try {
      const result = await purchasePointsByCard(points)
      hapticNotification('success')
      setStage('success')
      onPurchased(result.pointsAdded, result.pointsBalance, result.eurAmountCents / 100)
    } catch (error) {
      hapticNotification('error')
      setPayError(
        error instanceof Error
          ? error.message
          : t('profile.paymentFailed', { defaultValue: 'Payment failed. Please try again.' }),
      )
      setStage('form')
    }
  }

  const headerTitle =
    stage === 'success'
      ? t('profile.paymentSuccess', { defaultValue: 'Payment successful' })
      : stage === 'processing'
        ? t('profile.cardPayment', { defaultValue: 'Card payment' })
        : t('profile.buyPoints', { defaultValue: 'Buy points' })

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center"
      onClick={() => stage !== 'processing' && onClose()}
    >
      <div
        className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-card shadow-card flex flex-col max-h-[92dvh]"
        style={{ paddingBottom: 'var(--app-user-safe-bottom)' }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <div className="min-w-0">
            <p className="text-base font-extrabold tracking-tight">{headerTitle}</p>
            {stage === 'form' && (
              <p className="text-[11px] text-muted">{t('profile.pointsCreditedAfterPay', { defaultValue: 'Points will be credited right after payment' })}</p>
            )}
          </div>
          <button
            onClick={onClose}
            disabled={stage === 'processing'}
            className="w-9 h-9 rounded-pill bg-surface flex items-center justify-center active:scale-[0.95] transition-transform disabled:opacity-40"
            aria-label={t('common.close', { defaultValue: 'Close' })}
          >
            <X size={16} weight="bold" />
          </button>
        </div>

        <div className="px-5 pb-5 pt-2 overflow-y-auto">
          {stage === 'success' ? (
            <CardSuccessView points={points} eurAmount={eurAmount} onClose={onClose} />
          ) : stage === 'processing' ? (
            <CardProcessingView points={points} eurAmount={eurAmount} />
          ) : (
            <div className="space-y-4">
              <div className="rounded-2xl bg-black text-white p-5 space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-wider text-white/60">{t('profile.amountDue', { defaultValue: 'Amount due' })}</p>
                <p className="text-3xl font-extrabold tracking-tight">€{eurAmount.toFixed(2)}</p>
                <p className="text-xs text-white/70">
                  {t('profile.pricePerPoint', {
                    points,
                    price: (pricing.pointPriceCents / 100).toFixed(2),
                    defaultValue: `${points} pts · ${(pricing.pointPriceCents / 100).toFixed(2)} € per pt`,
                  })}
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-[11px] font-semibold text-muted">{t('profile.howManyPoints', { defaultValue: 'How many points' })}</label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      hapticSelection()
                      setPoints((value) => Math.max(1, value - 10))
                    }}
                    className="w-11 h-11 rounded-xl bg-surface text-lg font-bold active:scale-[0.95] transition-transform flex-shrink-0"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    value={points || ''}
                    onChange={(event) => setPoints(Number(event.target.value) || 0)}
                    className="flex-1 min-w-0 h-11 px-3 rounded-xl border-[1.5px] border-border bg-surface text-center text-base font-bold outline-none focus:border-black focus:bg-white transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      hapticSelection()
                      setPoints((value) => value + 10)
                    }}
                    className="w-11 h-11 rounded-xl bg-surface text-lg font-bold active:scale-[0.95] transition-transform flex-shrink-0"
                  >
                    +
                  </button>
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  {BUY_PRESETS.map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => {
                        hapticSelection()
                        setPoints(value)
                      }}
                      className={`px-3 py-1.5 rounded-pill text-xs font-bold transition-all ${
                        points === value ? 'bg-black text-white' : 'bg-surface text-black active:scale-[0.95]'
                      }`}
                    >
                      {value}
                    </button>
                  ))}
                </div>
              </div>

              {payError && (
                <p className="text-xs font-medium text-red-600 break-words">{payError}</p>
              )}

              <button
                onClick={() => void handlePay()}
                disabled={!canPay}
                className={`w-full h-12 rounded-2xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${
                  canPay ? 'bg-black text-white active:scale-[0.98]' : 'bg-surface text-muted cursor-not-allowed'
                }`}
              >
                <CreditCard size={16} weight="bold" />
                {t('profile.payByCard', { amount: eurAmount.toFixed(2), defaultValue: `Pay by card · €${eurAmount.toFixed(2)}` })}
              </button>

              <div className="flex items-center justify-center gap-1.5 text-[10px] text-muted">
                <LockKey size={11} weight="bold" />
                {t('profile.securePayment', { defaultValue: 'Secure payment · Visa · Mastercard · Apple Pay' })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function CardProcessingView({
  points,
  eurAmount,
}: {
  points: number
  eurAmount: number
}) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col items-center text-center gap-4 py-6">
      <div className="relative w-16 h-16 flex items-center justify-center">
        <div className="absolute inset-0 rounded-full border-2 border-border border-t-black animate-spin" />
        <CreditCard size={26} weight="bold" className="text-black" />
      </div>
      <div>
        <p className="text-base font-bold">{t('profile.confirmingPayment', { defaultValue: 'Confirming payment…' })}</p>
        <p className="text-xs text-muted mt-1">
          {t('profile.paymentForPoints', {
            amount: eurAmount.toFixed(2),
            points,
            defaultValue: `€${eurAmount.toFixed(2)} for ${points} pts`,
          })}
        </p>
      </div>
      <p className="text-[11px] text-muted leading-snug max-w-xs">
        {t('profile.dontCloseWindow', { defaultValue: 'Do not close this window — it will take a few seconds.' })}
      </p>
    </div>
  )
}

function CardSuccessView({
  points,
  eurAmount,
  onClose,
}: {
  points: number
  eurAmount: number
  onClose: () => void
}) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col items-center text-center gap-3 py-2">
      <div className="w-16 h-16 rounded-full bg-accent/15 flex items-center justify-center">
        <CheckCircle size={40} weight="fill" className="text-accent-dark" />
      </div>
      <div>
        <p className="text-3xl font-extrabold tracking-tight">+{points} pts</p>
        <p className="text-xs text-muted mt-1">{t('profile.creditedToBalance', { defaultValue: 'Credited to your balance' })}</p>
      </div>
      <div className="w-full rounded-2xl bg-surface px-4 py-3 mt-1">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] text-muted">{t('profile.charged', { defaultValue: 'Charged' })}</span>
          <span className="text-xs font-bold">€{eurAmount.toFixed(2)}</span>
        </div>
      </div>
      <button
        onClick={onClose}
        className="w-full mt-2 py-3 rounded-2xl bg-black text-white text-sm font-bold active:scale-[0.98] transition-transform"
      >
        {t('common.done', { defaultValue: 'Done' })}
      </button>
    </div>
  )
}

const TRANSFER_PRESETS = [10, 25, 50, 100]

function TransferPointsSheet({
  currentBalance,
  currentUserId,
  onClose,
  onTransferred,
}: {
  currentBalance: number
  currentUserId: string
  onClose: () => void
  onTransferred: (points: number, newBalance: number, recipientName: string) => void
}) {
  const { t } = useTranslation()
  const [recipientUserId, setRecipientUserId] = useState('')
  const [points, setPoints] = useState<number>(25)
  const [stage, setStage] = useState<'form' | 'processing' | 'success'>('form')
  const [transferError, setTransferError] = useState<string | null>(null)
  const [successRecipientName, setSuccessRecipientName] = useState('')
  useEscapeClose(stage !== 'processing', onClose)

  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [])

  const trimmedRecipientId = recipientUserId.trim()
  const canSubmit =
    stage === 'form' &&
    points >= 1 &&
    trimmedRecipientId.length > 0 &&
    trimmedRecipientId !== currentUserId &&
    points <= currentBalance

  const resolveTransferError = (error: unknown): string => {
    const code = parseApiErrorCode(error)
    if (code === 'self_transfer') {
      return t('profile.transferSelfError', { defaultValue: 'You cannot send points to yourself.' })
    }
    if (code === 'recipient_not_found') {
      return t('profile.transferNotFound', { defaultValue: 'User with this ID was not found.' })
    }
    if (code === 'insufficient_points') {
      return t('profile.transferInsufficient', { defaultValue: 'Not enough points on balance.' })
    }
    if (error instanceof ApiError) {
      return error.message
    }
    if (error instanceof Error) {
      return error.message
    }
    return t('profile.transferFailed', { defaultValue: 'Transfer failed.' })
  }

  const handleTransfer = async () => {
    if (!canSubmit) return
    hapticSelection()
    setStage('processing')
    setTransferError(null)
    try {
      const result = await transferPoints({
        recipientUserId: trimmedRecipientId,
        points,
      })
      hapticNotification('success')
      const recipientName = result.recipientUsername
        ? `@${result.recipientUsername}`
        : result.recipientUserId
      setSuccessRecipientName(recipientName)
      setStage('success')
      onTransferred(result.points, result.pointsBalance, recipientName)
    } catch (error) {
      hapticNotification('error')
      setTransferError(resolveTransferError(error))
      setStage('form')
    }
  }

  const headerTitle =
    stage === 'success'
      ? t('profile.transferSuccess', { defaultValue: 'Transfer complete' })
      : t('profile.transferTitle', { defaultValue: 'Send points' })

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center"
      onClick={() => stage !== 'processing' && onClose()}
    >
      <div
        className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-card shadow-card flex flex-col max-h-[92dvh]"
        style={{ paddingBottom: 'var(--app-user-safe-bottom)' }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <div className="min-w-0">
            <p className="text-base font-extrabold tracking-tight">{headerTitle}</p>
            {stage === 'form' && (
              <p className="text-[11px] text-muted">
                {t('profile.transferPointsDesc', { defaultValue: 'Transfer to another user by ID' })}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            disabled={stage === 'processing'}
            className="w-9 h-9 rounded-pill bg-surface flex items-center justify-center active:scale-[0.95] transition-transform disabled:opacity-40"
            aria-label={t('common.close', { defaultValue: 'Close' })}
          >
            <X size={16} weight="bold" />
          </button>
        </div>

        <div className="px-5 pb-5 pt-2 overflow-y-auto">
          {stage === 'success' ? (
            <div className="flex flex-col items-center text-center gap-3 py-2">
              <div className="w-16 h-16 rounded-full bg-accent/15 flex items-center justify-center">
                <CheckCircle size={40} weight="fill" className="text-accent-dark" />
              </div>
              <div>
                <p className="text-3xl font-extrabold tracking-tight">−{points} pts</p>
                <p className="text-xs text-muted mt-1">
                  {t('profile.transferSent', {
                    name: successRecipientName,
                    defaultValue: `Sent to ${successRecipientName}`,
                  })}
                </p>
              </div>
              <button
                onClick={onClose}
                className="w-full mt-2 py-3 rounded-2xl bg-black text-white text-sm font-bold active:scale-[0.98] transition-transform"
              >
                {t('common.done', { defaultValue: 'Done' })}
              </button>
            </div>
          ) : stage === 'processing' ? (
            <div className="flex flex-col items-center text-center gap-4 py-6">
              <div className="relative w-16 h-16 flex items-center justify-center">
                <div className="absolute inset-0 rounded-full border-2 border-border border-t-black animate-spin" />
                <PaperPlaneTilt size={26} weight="bold" className="text-black" />
              </div>
              <p className="text-base font-bold">{t('common.loading', { defaultValue: 'Loading...' })}</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-2xl bg-black text-white p-4 space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-wider text-white/60">
                  {t('profile.balance', { defaultValue: 'Balance' })}
                </p>
                <p className="text-2xl font-extrabold">{currentBalance} pts</p>
              </div>

              <div className="space-y-2">
                <label className="text-[11px] font-semibold text-muted">
                  {t('profile.transferRecipientId', { defaultValue: 'Recipient ID' })}
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  value={recipientUserId}
                  onChange={(event) => setRecipientUserId(event.target.value)}
                  placeholder={t('profile.transferRecipientId', { defaultValue: 'Recipient ID' })}
                  className="w-full h-12 px-4 rounded-2xl border-[1.5px] border-border bg-surface text-base font-bold font-mono outline-none focus:border-black focus:bg-white transition-colors"
                />
                <p className="text-[10px] text-muted">
                  {t('profile.transferRecipientHint', { defaultValue: 'Telegram user ID from their profile' })}
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-[11px] font-semibold text-muted">
                  {t('profile.transferAmount', { defaultValue: 'How many points' })}
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      hapticSelection()
                      setPoints((value) => Math.max(1, value - 10))
                    }}
                    className="w-11 h-11 rounded-xl bg-surface text-lg font-bold active:scale-[0.95] transition-transform flex-shrink-0"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={currentBalance}
                    value={points || ''}
                    onChange={(event) => setPoints(Number(event.target.value) || 0)}
                    className="flex-1 min-w-0 h-11 px-3 rounded-xl border-[1.5px] border-border bg-surface text-center text-base font-bold outline-none focus:border-black focus:bg-white transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      hapticSelection()
                      setPoints((value) => Math.min(currentBalance, value + 10))
                    }}
                    className="w-11 h-11 rounded-xl bg-surface text-lg font-bold active:scale-[0.95] transition-transform flex-shrink-0"
                  >
                    +
                  </button>
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  {TRANSFER_PRESETS.map((value) => (
                    <button
                      key={value}
                      type="button"
                      disabled={value > currentBalance}
                      onClick={() => {
                        hapticSelection()
                        setPoints(value)
                      }}
                      className={`px-3 py-1.5 rounded-pill text-xs font-bold transition-all disabled:opacity-40 ${
                        points === value ? 'bg-black text-white' : 'bg-surface text-black active:scale-[0.95]'
                      }`}
                    >
                      {value}
                    </button>
                  ))}
                </div>
              </div>

              {transferError && (
                <p className="text-xs font-medium text-red-600 break-words">{transferError}</p>
              )}

              <button
                onClick={() => void handleTransfer()}
                disabled={!canSubmit}
                className={`w-full h-12 rounded-2xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${
                  canSubmit ? 'bg-black text-white active:scale-[0.98]' : 'bg-surface text-muted cursor-not-allowed'
                }`}
              >
                <PaperPlaneTilt size={16} weight="bold" />
                {t('profile.transferSubmit', { points, defaultValue: `Send ${points} pts` })}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
