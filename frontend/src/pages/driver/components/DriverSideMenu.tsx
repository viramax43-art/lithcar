import { useState } from 'react'
import {
  Check,
  QrCode,
  SignOut,
  Star,
  SteeringWheel,
  X,
} from '@phosphor-icons/react'

import type { DriverCabinetData } from '../../../types'
import type { DriverSessionUser } from '../../../infrastructure/api/contracts'
import { redeemPassengerQrSale } from '../../../lib/backend'
import { hapticNotification } from '../../../lib/telegram'
import QrScanner from '../../../components/QrScanner'
import LanguageSwitcher from '../../../components/LanguageSwitcher'

interface DriverSideMenuProps {
  isOpen: boolean
  session: DriverSessionUser
  cabinetData: DriverCabinetData | null
  onClose: () => void
  onLogout: () => void
}

export default function DriverSideMenu({
  isOpen,
  session,
  cabinetData,
  onClose,
  onLogout,
}: DriverSideMenuProps) {
  const [scanMessage, setScanMessage] = useState<string | null>(null)
  const [isRedeeming, setIsRedeeming] = useState(false)

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
              <p className="text-[11px] text-muted mt-0.5 flex items-center gap-1">
                <Star size={11} weight="fill" className="text-amber-400" />
                Ваш рейтинг {session.rating.toFixed(1)}
                {session.ratingCount > 0 && <span>({session.ratingCount})</span>}
              </p>
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
          <section className="px-4 py-4 border-t border-border">
            <LanguageSwitcher />
          </section>
          <section className="px-4 py-4 border-t border-border">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-8 h-8 rounded-xl bg-black text-white flex items-center justify-center flex-shrink-0">
                <QrCode size={16} weight="bold" />
              </div>
              <div>
                <p className="text-sm font-bold">Сканировать QR пассажира</p>
                <p className="text-[11px] text-muted">После скана пассажиру начислятся поинты</p>
              </div>
            </div>

            <QrScanner
              onTokenRead={(token) => {
                void (async () => {
                  setIsRedeeming(true)
                  setScanMessage(null)
                  try {
                    const result = await redeemPassengerQrSale(token)
                    hapticNotification('success')
                    setScanMessage(
                      `Начислено ${result.pointsAdded} pts пассажиру (${result.passengerId}).`,
                    )
                  } catch (error) {
                    hapticNotification('error')
                    setScanMessage(error instanceof Error ? error.message : 'Не удалось обработать QR.')
                  } finally {
                    setIsRedeeming(false)
                  }
                })()
              }}
            />
            {isRedeeming && (
              <p className="mt-3 text-xs text-muted">Подтверждаем QR…</p>
            )}
            {scanMessage && (
              <div className="mt-3 rounded-xl bg-surface px-3 py-2.5 text-xs font-medium text-black">
                {scanMessage}
              </div>
            )}
          </section>
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
