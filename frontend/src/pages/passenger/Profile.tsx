import { useEffect, useMemo, useState } from 'react'
import { CaretRight, CheckCircle, Coins, Keyboard, QrCode, UserCircle, X } from '@phosphor-icons/react'

import BottomNav from '../../components/BottomNav'
import QrScanner from '../../components/QrScanner'
import { getUserCabinet, redeemDriverQrSale } from '../../lib/backend'
import { hapticNotification, hapticSelection } from '../../lib/telegram'
import type { UserCabinetData, UserCabinetRideHistoryItem } from '../../types'

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

export default function Profile() {
  const [cabinet, setCabinet] = useState<UserCabinetData | null>(null)
  const [historyItems, setHistoryItems] = useState<UserCabinetRideHistoryItem[]>([])
  const [historyTotal, setHistoryTotal] = useState(0)
  const [isHistoryLoading, setIsHistoryLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isQrSheetOpen, setIsQrSheetOpen] = useState(false)
  const [lastReceipt, setLastReceipt] = useState<RedeemReceipt | null>(null)

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

  const handleRedeemed = (receipt: RedeemReceipt, newBalance: number) => {
    setCabinet((prev) => (prev ? { ...prev, pointsBalance: newBalance } : prev))
    setLastReceipt(receipt)
  }

  return (
    <div className="min-h-[100dvh] bg-white pb-20 overflow-x-hidden">
      <header className="sticky top-0 z-20 flex items-center justify-between px-5 h-14 bg-white/90 backdrop-blur-md border-b border-border/50">
        <h1 className="text-xl font-extrabold tracking-tight">RIDE</h1>
        <span className="text-sm font-semibold text-muted">Личный кабинет</span>
      </header>

      <div className="p-4 space-y-4">
        {errorMessage && <p className="text-xs font-medium text-red-600">{errorMessage}</p>}

        <section className="bg-black text-white rounded-card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <UserCircle size={22} weight="fill" />
              <p className="text-sm font-semibold truncate">{cabinet?.username || cabinet?.userId || 'Пользователь'}</p>
            </div>
            <p className="text-xs text-white/70 shrink-0">Баланс</p>
          </div>
          <div className="flex items-center gap-2">
            <Coins size={22} weight="fill" className="text-accent" />
            <p className="text-2xl font-extrabold break-all">{cabinet?.pointsBalance ?? 0} pts</p>
          </div>

          <button
            onClick={openQrSheet}
            className="mt-2 w-full flex items-center gap-3 rounded-2xl bg-white text-black px-4 py-3 active:scale-[0.98] transition-transform"
          >
            <span className="w-10 h-10 rounded-xl bg-accent/15 text-accent-dark flex items-center justify-center flex-shrink-0">
              <QrCode size={22} weight="bold" />
            </span>
            <span className="flex-1 text-left min-w-0">
              <span className="block text-sm font-bold">Пополнить поинты</span>
              <span className="block text-[11px] text-muted truncate">Отсканируйте QR водителя</span>
            </span>
            <CaretRight size={16} weight="bold" className="text-muted flex-shrink-0" />
          </button>

          {lastReceipt && (
            <div className="mt-2 rounded-2xl bg-white/10 border border-white/15 px-3 py-2.5 flex items-center gap-2.5">
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
          {sortedHistory.length === 0 && <p className="text-xs text-muted">Поездок пока нет.</p>}
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
    </div>
  )
}

function QrRedeemSheet({
  onClose,
  onRedeemed,
}: {
  onClose: () => void
  onRedeemed: (receipt: RedeemReceipt, newBalance: number) => void
}) {
  const [isRedeeming, setIsRedeeming] = useState(false)
  const [errorText, setErrorText] = useState<string | null>(null)
  const [receipt, setReceipt] = useState<RedeemReceipt | null>(null)
  const [showManual, setShowManual] = useState(false)
  const [manualInput, setManualInput] = useState('')

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
    setErrorText(null)
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
      setErrorText(error instanceof Error ? error.message : 'Не удалось погасить QR-чек.')
    } finally {
      setIsRedeeming(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center">
      <div
        className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-card shadow-card flex flex-col max-h-[92dvh]"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <div className="min-w-0">
            <p className="text-base font-extrabold tracking-tight">
              {receipt ? 'Поинты начислены' : 'Сканирование QR'}
            </p>
            {!receipt && (
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
          ) : (
            <div className="space-y-4">
              <QrScanner onTokenRead={(token) => void handleRedeem(token)} />

              {isRedeeming && (
                <div className="flex items-center justify-center gap-2 text-xs text-muted">
                  <div className="w-3.5 h-3.5 rounded-full border-2 border-border border-t-black animate-spin" />
                  Подтверждаем чек…
                </div>
              )}

              {errorText && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5">
                  <p className="text-xs font-semibold text-red-900">Не удалось зачислить</p>
                  <p className="text-[11px] text-red-700 mt-0.5 break-words">{errorText}</p>
                </div>
              )}

              <div className="pt-1">
                {!showManual ? (
                  <button
                    onClick={() => setShowManual(true)}
                    className="w-full flex items-center justify-center gap-2 text-xs font-semibold text-muted py-2"
                  >
                    <Keyboard size={14} weight="bold" />
                    Ввести код вручную
                  </button>
                ) : (
                  <div className="space-y-2">
                    <p className="text-[11px] font-semibold text-muted">Код QR</p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={manualInput}
                        onChange={(event) => setManualInput(event.target.value)}
                        placeholder="Вставьте код или ссылку"
                        autoFocus
                        className="flex-1 min-w-0 px-3 py-2.5 rounded-xl border-[1.5px] border-border bg-surface text-sm outline-none focus:border-black focus:bg-white transition-colors"
                      />
                      <button
                        onClick={() => {
                          hapticSelection()
                          void handleRedeem(manualInput)
                        }}
                        disabled={isRedeeming || !manualInput.trim()}
                        className={`px-4 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                          !isRedeeming && manualInput.trim()
                            ? 'bg-black text-white active:scale-[0.97]'
                            : 'bg-surface text-muted cursor-not-allowed'
                        }`}
                      >
                        Зачислить
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
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
