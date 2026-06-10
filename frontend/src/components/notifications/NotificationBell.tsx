import { useEffect, useRef, useState } from 'react'
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
  const rootRef = useRef<HTMLDivElement>(null)
  const { items, unreadCount, isLoading, errorMessage, markRead, markAllRead, refresh } = useNotifications({
    pool,
    enabled,
  })

  useEffect(() => {
    if (!open) return undefined

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (rootRef.current?.contains(target)) return
      setOpen(false)
    }

    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('touchstart', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('touchstart', onPointerDown)
    }
  }, [open])

  const handleToggle = () => {
    setOpen((prev) => {
      const next = !prev
      if (next) void refresh()
      return next
    })
  }

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
    <div ref={rootRef} className="relative flex-shrink-0 pointer-events-auto">
      <button
        type="button"
        onClick={handleToggle}
        aria-expanded={open}
        aria-haspopup="dialog"
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
          unreadCount={unreadCount}
          isLoading={isLoading}
          errorMessage={errorMessage}
          onSelect={(notification) => void handleSelect(notification)}
          onMarkAllRead={async () => {
            await markAllRead()
          }}
          className="absolute right-0 top-[calc(100%+8px)] z-[320]"
        />
      )}
    </div>
  )
}
