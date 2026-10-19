import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChatCircleDots } from '@phosphor-icons/react'

import { hapticSelection } from '../../lib/telegram'
import RideChatSheet from './RideChatSheet'
import { useRideChatUnread, type RideChatRole } from './useRideChat'

interface RideChatButtonProps {
  rideId: string | null
  role: RideChatRole
  variant?: 'light' | 'dark' | 'wide'
  className?: string
  disabled?: boolean
  /** Увеличивается при переходе из уведомления о сообщении — сразу открываем чат. */
  openSignal?: number
}

const VARIANT_CLASS: Record<'light' | 'dark' | 'wide', string> = {
  light: 'w-10 h-10 rounded-pill bg-white shadow-card flex items-center justify-center active:scale-95 transition-transform relative',
  dark: 'w-10 h-10 rounded-pill bg-white/10 hover:bg-white/20 text-white flex items-center justify-center active:scale-95 transition-transform relative',
  wide: 'w-full py-3 rounded-card bg-white text-black text-sm font-extrabold inline-flex items-center justify-center gap-2 relative active:scale-[0.98] transition-transform shadow-card',
}

/**
 * Кнопка «Чат поездки» с бейджем непрочитанных.
 *
 * Одна и та же кнопка используется и пассажиром, и водителем: роль определяет,
 * к какому API обращаться (у водителя — сессионная авторизация).
 */
export default function RideChatButton({
  rideId,
  role,
  variant = 'light',
  className,
  disabled = false,
  openSignal = 0,
}: RideChatButtonProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const { unreadCount, refresh } = useRideChatUnread({ rideId, role, enabled: !open })

  useEffect(() => {
    if (!openSignal || !rideId) return
    setOpen(true)
  }, [openSignal, rideId])

  const label = t('rideChat.open', { defaultValue: 'Чат поездки' })
  const classes = className ?? VARIANT_CLASS[variant]

  return (
    <>
      <button
        type="button"
        disabled={disabled || !rideId}
        aria-label={label}
        onClick={() => {
          hapticSelection()
          setOpen(true)
          void refresh()
        }}
        className={`${classes} disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        <ChatCircleDots size={variant === 'wide' ? 18 : 18} weight={unreadCount > 0 ? 'fill' : 'bold'} />
        {variant === 'wide' && <span>{label}</span>}
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>
      <RideChatSheet
        rideId={rideId}
        role={role}
        open={open}
        onClose={() => {
          setOpen(false)
          void refresh()
        }}
      />
    </>
  )
}