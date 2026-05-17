import { useEffect, useMemo, useState } from 'react'
import {
  CaretRight,
  CheckCircle,
  Coins,
  CreditCard,
  LockKey,
  QrCode,
  SealWarning,
  UserCircle,
  X,
} from '@phosphor-icons/react'

import BottomNav from '../../components/BottomNav'
import QrScanner from '../../components/QrScanner'
import Skeleton from '../../components/Skeleton'
import { ApiError, getPricing, getUserCabinet, redeemDriverQrSale } from '../../lib/backend'
import { hapticNotification, hapticSelection } from '../../lib/telegram'
import type { PricingSettings, UserCabinetData, UserCabinetRideHistoryItem } from '../../types'

const STATUS_MAP: Record<string, string> = {
  pending: 'Ожидает',
  grouped: 'В группе',
  assigned: 'Назначена',
  in_progress: 'В пути',
  completed: 'Завершена',
}

type RedeemReceipt = {
  pointsAdded: number
  eurAmount: number
  driverName: string
}

type CardReceipt = {
  pointsAdded: number
  eurAmount: number
}

const DEFAULT_PRICING: PricingSettings = { pointsPerRide: 10, pointPriceCents: 50 }

export default function Profile() {
  const [cabinet, setCabinet] = useState<UserCabinetData | null>(null)
  const [pricing, setPricing] = useState<PricingSettings>(DEFAULT_PRICING)
  const [historyItems, setHistoryItems] = useState<UserCabinetRideHistoryItem[]>([])
  const [historyTotal, setHistoryTotal] = useState(0)
  const [isHistoryLoading, setIsHistoryLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isQrSheetOpen, setIsQrSheetOpen] = useState(false)
  const [isBuySheetOpen, setIsBuySheetOpen] = useState(false)
  const [lastReceipt, setLastReceipt] = useState<RedeemReceipt | null>(null)
  const [lastCardReceipt, setLastCardReceipt] = useState<CardReceipt | null>(null)

  const historyPageSize = 20

  const loadCabinet = async (offset: number, append: boolean) => {
    if (append) setIsHistoryLoading(true)
    try {
      const response = await getUserCabinet({ limit: historyPageSize, offset })
      setCabinet(response)
      setHistoryTotal(response.rideHistoryTotal)
      setHistoryItems((prev) => (append ? [...prev, ...response.rideHistory] : response.rideHistory))
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Не удалось загрузить личный кабинет.')
    } finally {
      setIsHistoryLoading(false)
    }
  }

  useEffect(() => {
    void loadCabinet(0, false)
    void getPricing()
      .then((value) => setPricing(value))
      .catch(() => undefined)
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

  const handleRedeemed = (receipt: RedeemReceipt, newBalance: number) => {
    setCabinet((prev) => (prev ? { ...prev, pointsBalance: newBalance } : prev))
    setLastReceipt(receipt)
    setLastCardReceipt(null)
  }

  const handleCardPurchased = (points: number, eurAmount: number) => {
    // Demo mode: optimistically update local balance. Real acquiring will be wired later.
    setCabinet((prev) => (prev ? { ...prev, pointsBalance: (prev.pointsBalance ?? 0) + points } : prev))
    setLastCardReceipt({ pointsAdded: points, eurAmount })
    setLastReceipt(null)
  }

  return (
    <div className="min-h-[100dvh] bg-white pb-20 overflow-x-hidden">
      <header
        className="sticky top-0 z-20 bg-white/90 backdrop-blur-md border-b border-border/50"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <div className="flex items-center justify-between px-5 h-14">
          <h1 className="text-xl font-extrabold tracking-tight">RIDE</h1>
          <span className="text-sm font-semibold text-muted">Личный кабинет</span>
        </div>
      </header>

      <div className="p-4 space-y-4">
        {errorMessage && <p className="text-xs font-medium text-red-600">{errorMessage}</p>}

        <section className="bg-black text-white rounded-card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <UserCircle size={22} weight="fill" />
              {cabinet ? (
                <p className="text-sm font-semibold truncate">{cabinet.username || cabinet.userId || 'Пользователь'}</p>
              ) : (
                <Skeleton width={120} height={14} className="!bg-white/15" rounded="sm" />
              )}
            </div>
            <p className="text-xs text-white/70 shrink-0">Баланс</p>
          </div>
          <div className="flex items-center gap-2">
            <Coins size={22} weight="fill" className="text-accent" />
            {cabinet ? (
              <p className="text-2xl font-extrabold break-all">{cabinet.pointsBalance ?? 0} pts</p>
            ) : (
              <Skeleton width={110} height={28} className="!bg-white/15" rounded="md" />
            )}
          </div>

          <button
            onClick={openBuySheet}
            className="mt-2 w-full flex items-center gap-3 rounded-2xl bg-white text-black px-4 py-3 active:scale-[0.98] transition-transform"
          >
            <span className="w-10 h-10 rounded-xl bg-accent/15 text-accent-dark flex items-center justify-center flex-shrink-0">
              <CreditCard size={22} weight="bold" />
            </span>
            <span className="flex-1 text-left min-w-0">
              <span className="block text-sm font-bold">Купить поинты</span>
              <span className="block text-[11px] text-muted truncate">Оплата картой · мгновенно</span>
            </span>
            <CaretRight size={16} weight="bold" className="text-muted flex-shrink-0" />
          </button>

          <button
            onClick={openQrSheet}
            className="w-full flex items-center gap-3 rounded-2xl bg-white/10 border border-white/15 text-white px-4 py-2.5 active:scale-[0.98] transition-transform"
          >
            <span className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0">
              <QrCode size={18} weight="bold" />
            </span>
            <span className="flex-1 text-left min-w-0">
              <span className="block text-[13px] font-semibold">QR от водителя</span>
              <span className="block text-[11px] text-white/60 truncate">Оплата наличными при поездке</span>
            </span>
            <CaretRight size={14} weight="bold" className="text-white/50 flex-shrink-0" />
          </button>

          {lastCardReceipt && (
            <div className="mt-1 rounded-2xl bg-white/10 border border-white/15 px-3 py-2.5 flex items-center gap-2.5">
              <CheckCircle size={18} weight="fill" className="text-accent flex-shrink-0" />
              <p className="text-[11px] leading-snug text-white/90 min-w-0">
                <span className="font-bold">+{lastCardReceipt.pointsAdded} pts</span>
                {' · '}
                <span className="text-white/70">оплачено картой €{lastCardReceipt.eurAmount.toFixed(2)}</span>
              </p>
            </div>
          )}

          {lastReceipt && (
            <div className="mt-1 rounded-2xl bg-white/10 border border-white/15 px-3 py-2.5 flex items-center gap-2.5">
              <CheckCircle size={18} weight="fill" className="text-accent flex-shrink-0" />
              <p className="text-[11px] leading-snug text-white/90 min-w-0">
                <span className="font-bold">+{lastReceipt.pointsAdded} pts</span>
                {' · '}
                <span className="text-white/70">долг {lastReceipt.driverName}: €{lastReceipt.eurAmount.toFixed(2)}</span>
              </p>
            </div>
          )}
        </section>

        <section className="bg-white border border-border rounded-card p-4 space-y-3">
          <p className="text-sm font-bold">История поездок</p>
          {!cabinet && (
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
          {cabinet && sortedHistory.length === 0 && <p className="text-xs text-muted">Поездок пока нет.</p>}
          {sortedHistory.map((ride) => (
            <div key={ride.id} className="rounded-xl bg-surface p-3 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold truncate min-w-0">{ride.from.address}</p>
                <span className="text-[10px] text-muted shrink-0">{STATUS_MAP[ride.status] || ride.status}</span>
              </div>
              <p className="text-xs text-muted truncate">{ride.to.address}</p>
              <p className="text-[10px] text-muted">
                {new Date(ride.dateTime).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          ))}
          {canLoadMoreHistory && (
            <button
              onClick={() => void loadCabinet(historyItems.length, true)}
              disabled={isHistoryLoading}
              className={`w-full py-2.5 rounded-xl text-xs font-semibold ${
                !isHistoryLoading ? 'bg-surface text-black' : 'bg-surface text-muted'
              }`}
            >
              {isHistoryLoading ? 'Загрузка...' : 'Показать еще'}
            </button>
          )}
        </section>
      </div>

      <BottomNav />

      {isQrSheetOpen && (
        <QrRedeemSheet
          onClose={() => setIsQrSheetOpen(false)}
          onRedeemed={handleRedeemed}
        />
      )}

      {isBuySheetOpen && (
        <BuyPointsSheet
          pricing={pricing}
          onClose={() => setIsBuySheetOpen(false)}
          onPurchased={handleCardPurchased}
        />
      )}
    </div>
  )
}

type RedeemFailure =
  | { kind: 'already_redeemed'; message: string }
  | { kind: 'invalid'; message: string }
  | { kind: 'generic'; message: string }

function QrRedeemSheet({
  onClose,
  onRedeemed,
}: {
  onClose: () => void
  onRedeemed: (receipt: RedeemReceipt, newBalance: number) => void
}) {
  const [isRedeeming, setIsRedeeming] = useState(false)
  const [failure, setFailure] = useState<RedeemFailure | null>(null)
  const [receipt, setReceipt] = useState<RedeemReceipt | null>(null)

  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [])

  const handleRedeem = async (token: string) => {
    const trimmed = token.trim()
    if (!trimmed || isRedeeming) return
    setIsRedeeming(true)
    setFailure(null)
    try {
      const response = await redeemDriverQrSale(trimmed)
      hapticNotification('success')
      const r: RedeemReceipt = {
        pointsAdded: response.pointsAdded,
        eurAmount: response.eurAmount,
        driverName: response.driverName,
      }
      setReceipt(r)
      onRedeemed(r, response.pointsBalance)
    } catch (error) {
      hapticNotification('error')
      if (error instanceof ApiError) {
        if (error.status === 410) {
          setFailure({ kind: 'already_redeemed', message: error.message })
        } else if (error.status === 404) {
          setFailure({ kind: 'invalid', message: error.message })
        } else {
          setFailure({ kind: 'generic', message: error.message })
        }
      } else {
        setFailure({
          kind: 'generic',
          message: error instanceof Error ? error.message : 'Не удалось погасить QR-чек.',
        })
      }
    } finally {
      setIsRedeeming(false)
    }
  }

  const tryAgain = () => {
    setFailure(null)
  }

  const showScanner = !receipt && !failure
  const showFailure = !receipt && !!failure

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center">
      <div
        className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-card shadow-card flex flex-col max-h-[92dvh]"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <div className="min-w-0">
            <p className="text-base font-extrabold tracking-tight">
              {receipt ? 'Поинты начислены' : showFailure ? 'Чек недоступен' : 'Сканирование QR'}
            </p>
            {showScanner && (
              <p className="text-[11px] text-muted">Покажите QR водителя в кадре</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-pill bg-surface flex items-center justify-center active:scale-[0.95] transition-transform"
            aria-label="Закрыть"
          >
            <X size={16} weight="bold" />
          </button>
        </div>

        <div className="px-5 pb-5 pt-2 overflow-y-auto">
          {receipt ? (
            <SuccessView receipt={receipt} onClose={onClose} />
          ) : showFailure && failure ? (
            <RedeemFailureView failure={failure} onTryAgain={tryAgain} onClose={onClose} />
          ) : (
            <div className="space-y-4">
              <QrScanner onTokenRead={(token) => void handleRedeem(token)} />

              {isRedeeming && (
                <div className="flex items-center justify-center gap-2 text-xs text-muted">
                  <div className="w-3.5 h-3.5 rounded-full border-2 border-border border-t-black animate-spin" />
                  Подтверждаем чек…
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function RedeemFailureView({
  failure,
  onTryAgain,
  onClose,
}: {
  failure: RedeemFailure
  onTryAgain: () => void
  onClose: () => void
}) {
  const isAlreadyRedeemed = failure.kind === 'already_redeemed'
  const isInvalid = failure.kind === 'invalid'

  const title = isAlreadyRedeemed
    ? 'Этот QR уже погашен'
    : isInvalid
      ? 'QR недействителен'
      : 'Не удалось зачислить'

  const subtitle = isAlreadyRedeemed
    ? 'Чек одноразовый — поинты по нему уже зачислены.'
    : isInvalid
      ? 'Похоже, это не наш QR-чек или он был отменён.'
      : failure.message

  const hint = isAlreadyRedeemed
    ? 'Попросите водителя выпустить новый QR — старый чек становится неактивным после первого сканирования.'
    : isInvalid
      ? 'Проверьте, что вы сканируете актуальный QR водителя в этом приложении.'
      : null

  return (
    <div className="flex flex-col items-center text-center gap-3 py-2">
      <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center">
        <SealWarning size={36} weight="fill" className="text-amber-600" />
      </div>
      <div>
        <p className="text-lg font-extrabold tracking-tight">{title}</p>
        <p className="text-xs text-muted mt-1 max-w-xs">{subtitle}</p>
      </div>
      {hint && (
        <p className="text-[11px] text-muted leading-snug max-w-xs">{hint}</p>
      )}
      <div className="w-full grid grid-cols-2 gap-2 mt-2">
        <button
          onClick={onClose}
          className="py-3 rounded-2xl bg-surface text-sm font-bold active:scale-[0.98] transition-transform"
        >
          Закрыть
        </button>
        <button
          onClick={onTryAgain}
          className="py-3 rounded-2xl bg-black text-white text-sm font-bold active:scale-[0.98] transition-transform"
        >
          Сканировать ещё
        </button>
      </div>
    </div>
  )
}

function SuccessView({
  receipt,
  onClose,
}: {
  receipt: RedeemReceipt
  onClose: () => void
}) {
  return (
    <div className="flex flex-col items-center text-center gap-3 py-2">
      <div className="w-16 h-16 rounded-full bg-accent/15 flex items-center justify-center">
        <CheckCircle size={40} weight="fill" className="text-accent-dark" />
      </div>
      <div>
        <p className="text-3xl font-extrabold tracking-tight">+{receipt.pointsAdded} pts</p>
        <p className="text-xs text-muted mt-1">Зачислено на ваш баланс</p>
      </div>
      <div className="w-full rounded-2xl bg-surface px-4 py-3 mt-1 space-y-1.5">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] text-muted">Водитель</span>
          <span className="text-xs font-semibold truncate">{receipt.driverName}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] text-muted">К оплате наличными</span>
          <span className="text-xs font-bold">€{receipt.eurAmount.toFixed(2)}</span>
        </div>
      </div>
      <p className="text-[11px] text-muted leading-snug max-w-xs">
        Передайте водителю €{receipt.eurAmount.toFixed(2)} наличными за пополнение.
      </p>
      <button
        onClick={onClose}
        className="w-full mt-2 py-3 rounded-2xl bg-black text-white text-sm font-bold active:scale-[0.98] transition-transform"
      >
        Готово
      </button>
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
  onPurchased: (points: number, eurAmount: number) => void
}) {
  const [points, setPoints] = useState<number>(100)
  const [stage, setStage] = useState<'form' | 'processing' | 'success'>('form')

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

  const handlePay = () => {
    if (!canPay) return
    hapticSelection()
    setStage('processing')
    // Demo acquiring: simulate processing latency before showing success.
    window.setTimeout(() => {
      hapticNotification('success')
      setStage('success')
      onPurchased(points, eurAmount)
    }, 1400)
  }

  const headerTitle =
    stage === 'success' ? 'Оплата прошла' : stage === 'processing' ? 'Оплата картой' : 'Купить поинты'

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center">
      <div
        className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-card shadow-card flex flex-col max-h-[92dvh]"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <div className="min-w-0">
            <p className="text-base font-extrabold tracking-tight">{headerTitle}</p>
            {stage === 'form' && (
              <p className="text-[11px] text-muted">Поинты зачислятся сразу после оплаты</p>
            )}
          </div>
          <button
            onClick={onClose}
            disabled={stage === 'processing'}
            className="w-9 h-9 rounded-pill bg-surface flex items-center justify-center active:scale-[0.95] transition-transform disabled:opacity-40"
            aria-label="Закрыть"
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
                <p className="text-[10px] font-bold uppercase tracking-wider text-white/60">К оплате</p>
                <p className="text-3xl font-extrabold tracking-tight">€{eurAmount.toFixed(2)}</p>
                <p className="text-xs text-white/70">{points} pts · {(pricing.pointPriceCents / 100).toFixed(2)} € за pt</p>
              </div>

              <div className="space-y-2">
                <label className="text-[11px] font-semibold text-muted">Сколько поинтов</label>
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

              <button
                onClick={handlePay}
                disabled={!canPay}
                className={`w-full h-12 rounded-2xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${
                  canPay ? 'bg-black text-white active:scale-[0.98]' : 'bg-surface text-muted cursor-not-allowed'
                }`}
              >
                <CreditCard size={16} weight="bold" />
                Оплатить картой · €{eurAmount.toFixed(2)}
              </button>

              <div className="flex items-center justify-center gap-1.5 text-[10px] text-muted">
                <LockKey size={11} weight="bold" />
                Безопасная оплата · Visa · Mastercard · Apple Pay
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
  return (
    <div className="flex flex-col items-center text-center gap-4 py-6">
      <div className="relative w-16 h-16 flex items-center justify-center">
        <div className="absolute inset-0 rounded-full border-2 border-border border-t-black animate-spin" />
        <CreditCard size={26} weight="bold" className="text-black" />
      </div>
      <div>
        <p className="text-base font-bold">Подтверждаем оплату…</p>
        <p className="text-xs text-muted mt-1">€{eurAmount.toFixed(2)} за {points} pts</p>
      </div>
      <p className="text-[11px] text-muted leading-snug max-w-xs">
        Не закрывайте окно — это займёт пару секунд.
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
  return (
    <div className="flex flex-col items-center text-center gap-3 py-2">
      <div className="w-16 h-16 rounded-full bg-accent/15 flex items-center justify-center">
        <CheckCircle size={40} weight="fill" className="text-accent-dark" />
      </div>
      <div>
        <p className="text-3xl font-extrabold tracking-tight">+{points} pts</p>
        <p className="text-xs text-muted mt-1">Зачислено на ваш баланс</p>
      </div>
      <div className="w-full rounded-2xl bg-surface px-4 py-3 mt-1 space-y-1.5">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] text-muted">Способ оплаты</span>
          <span className="text-xs font-semibold">Карта · •••• 4242</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] text-muted">Списано</span>
          <span className="text-xs font-bold">€{eurAmount.toFixed(2)}</span>
        </div>
      </div>
      <button
        onClick={onClose}
        className="w-full mt-2 py-3 rounded-2xl bg-black text-white text-sm font-bold active:scale-[0.98] transition-transform"
      >
        Готово
      </button>
    </div>
  )
}
