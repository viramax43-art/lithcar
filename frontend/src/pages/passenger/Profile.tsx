import { useEffect, useMemo, useState } from 'react'
import { Coins, UserCircle } from '@phosphor-icons/react'

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

export default function Profile() {
  const [cabinet, setCabinet] = useState<UserCabinetData | null>(null)
  const [historyItems, setHistoryItems] = useState<UserCabinetRideHistoryItem[]>([])
  const [historyTotal, setHistoryTotal] = useState(0)
  const [tokenInput, setTokenInput] = useState('')
  const [isRedeeming, setIsRedeeming] = useState(false)
  const [lastReceipt, setLastReceipt] = useState<{
    pointsAdded: number
    eurAmount: number
    driverName: string
  } | null>(null)
  const [isHistoryLoading, setIsHistoryLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

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

  const handleRedeem = async (token: string) => {
    if (!cabinet || !token.trim()) return
    setIsRedeeming(true)
    setErrorMessage(null)
    try {
      const response = await redeemDriverQrSale(token.trim())
      hapticNotification('success')
      setCabinet({ ...cabinet, pointsBalance: response.pointsBalance })
      setLastReceipt({
        pointsAdded: response.pointsAdded,
        eurAmount: response.eurAmount,
        driverName: response.driverName,
      })
      setTokenInput('')
    } catch (error) {
      hapticNotification('error')
      setErrorMessage(error instanceof Error ? error.message : 'Не удалось погасить QR-чек.')
    } finally {
      setIsRedeeming(false)
    }
  }

  const canLoadMoreHistory = historyItems.length < historyTotal

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
        </section>

        <section className="bg-white border border-border rounded-card p-4 space-y-3">
          <p className="text-sm font-bold">Пополнение поинтов от водителя (QR)</p>
          <QrScanner onTokenRead={(token) => void handleRedeem(token)} />
          <div className="flex flex-col gap-2 min-[380px]:flex-row pt-1">
            <input
              type="text"
              value={tokenInput}
              onChange={(event) => setTokenInput(event.target.value)}
              placeholder="Вставьте token или ссылку QR"
              className="flex-1 px-3 py-2 rounded-xl border-[1.5px] border-border bg-surface text-sm outline-none focus:border-black focus:bg-white transition-colors"
            />
            <button
              onClick={() => {
                hapticSelection()
                void handleRedeem(tokenInput)
              }}
              disabled={isRedeeming || !tokenInput.trim()}
              className={`px-4 py-2 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 whitespace-nowrap min-[380px]:shrink-0 transition-all ${
                !isRedeeming && tokenInput.trim() ? 'bg-black text-white active:scale-[0.97]' : 'bg-black text-white opacity-35 cursor-not-allowed'
              }`}
            >
              {isRedeeming ? 'Обработка...' : 'Погасить QR'}
            </button>
          </div>
          {lastReceipt && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs space-y-1">
              <p className="font-semibold text-emerald-900">Поинты начислены</p>
              <p className="text-emerald-800">+{lastReceipt.pointsAdded} pts</p>
              <p className="text-emerald-800">
                Долг водителю {lastReceipt.driverName}: €{lastReceipt.eurAmount.toFixed(2)}
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
    </div>
  )
}
