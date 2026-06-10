import { useState } from 'react'
import { Bell } from '@phosphor-icons/react'

import type { AppNotification, NotificationPool } from '../../types'
import NotificationPanel from './NotificationPanel'
import { useNotifications } from './useNotifications'

interface NotificationBellProps {
  pool: NotificationPool
  enabled?: boolean
  variant?: 'light' | 'dark'
  className?: string
  onNotificationSelect?: (notification: AppNotification) => void | Promise<void>
}

const VARIANT_CLASS: Record<'light' | 'dark', string> = {
  light: 'w-10 h-10 rounded-pill bg-white shadow-card flex items-center justify-center active:scale-95 transition-transform relative',
  dark: 'w-10 h-10 rounded-pill bg-white/10 hover:bg-white/20 text-white flex items-center justify-center active:scale-95 transition-transform relative touch-none',
}

export default function NotificationBell({
  pool,
  enabled = true,
  variant = 'light',
  className,
  onNotificationSelect,
}: NotificationBellProps) {
  const buttonClass = className ?? VARIANT_CLASS[variant]
  const [open, setOpen] = useState(false)
  const { items, unreadCount, isLoading, errorMessage, markRead, markAllRead } = useNotifications({
    pool,
    enabled,
  })

  const handleSelect = async (notification: AppNotification) => {
    if (!notification.readAt) {
      await markRead(notification.id)
    }
    if (onNotificationSelect) {
      await onNotificationSelect(notification)
    }
    setOpen(false)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={buttonClass}
      >
        <Bell size={18} weight={unreadCount > 0 ? 'fill' : 'bold'} className={variant === 'dark' ? 'text-white' : undefined} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>
      {open && (
        <NotificationPanel
          items={items}
          isLoading={isLoading}
          errorMessage={errorMessage}
          onClose={() => setOpen(false)}
          onSelect={(notification) => void handleSelect(notification)}
          onMarkAllRead={() => void markAllRead()}
        />
      )}
    </>
  )
}
