import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Bell } from '@phosphor-icons/react'

import type { AppNotification, NotificationPool } from '../../types'
import NotificationPanel from './NotificationPanel'
import { useNotifications } from './useNotifications'
import { hapticSelection } from '../../lib/telegram'

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

const PANEL_MAX_WIDTH = 340
const VIEWPORT_MARGIN = 12
const PANEL_OFFSET_Y = 8
// Header (~70px) + scrollable list max(280px / 36dvh) — used to decide whether to flip upward.
const PANEL_ESTIMATED_HEIGHT = 360

interface PanelPosition {
  top?: number
  bottom?: number
  left: number
  width: number
}

function computePanelPosition(anchor: DOMRect): PanelPosition {
  const width = Math.min(PANEL_MAX_WIDTH, window.innerWidth - VIEWPORT_MARGIN * 2)
  const maxLeft = window.innerWidth - width - VIEWPORT_MARGIN
  const preferredLeft = anchor.right - width
  const left = Math.max(VIEWPORT_MARGIN, Math.min(preferredLeft, maxLeft))
  const spaceBelow = window.innerHeight - anchor.bottom - PANEL_OFFSET_Y - VIEWPORT_MARGIN
  const spaceAbove = anchor.top - PANEL_OFFSET_Y - VIEWPORT_MARGIN
  // Flip upward when there is not enough room below but more above.
  if (spaceBelow < PANEL_ESTIMATED_HEIGHT && spaceAbove > spaceBelow) {
    return {
      bottom: window.innerHeight - anchor.top + PANEL_OFFSET_Y,
      left,
      width,
    }
  }
  return {
    top: anchor.bottom + PANEL_OFFSET_Y,
    left,
    width,
  }
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
  const [panelPosition, setPanelPosition] = useState<PanelPosition | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const { items, unreadCount, isLoading, errorMessage, markRead, markAllRead, refresh } = useNotifications({
    pool,
    enabled,
  })

  const updatePanelPosition = () => {
    if (!buttonRef.current) return
    setPanelPosition(computePanelPosition(buttonRef.current.getBoundingClientRect()))
  }

  useLayoutEffect(() => {
    if (!open) {
      setPanelPosition(null)
      return undefined
    }
    updatePanelPosition()
    window.addEventListener('resize', updatePanelPosition)
    window.addEventListener('scroll', updatePanelPosition, true)
    return () => {
      window.removeEventListener('resize', updatePanelPosition)
      window.removeEventListener('scroll', updatePanelPosition, true)
    }
  }, [open])

  useEffect(() => {
    if (!open) return undefined

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const handleToggle = () => {
    hapticSelection()
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

  const panelPortal = open && panelPosition && typeof document !== 'undefined'
    ? createPortal(
        <>
          <div className="fixed inset-0 z-[5100]" aria-hidden onClick={() => setOpen(false)} />
          <NotificationPanel
            items={items}
            unreadCount={unreadCount}
            isLoading={isLoading}
            errorMessage={errorMessage}
            onSelect={(notification) => void handleSelect(notification)}
            onMarkAllRead={async () => {
              await markAllRead()
            }}
            style={{
              position: 'fixed',
              top: panelPosition.top,
              bottom: panelPosition.bottom,
              left: panelPosition.left,
              width: panelPosition.width,
              zIndex: 5101,
            }}
          />
        </>,
        document.body,
      )
    : null

  return (
    <div ref={rootRef} className="relative flex-shrink-0 pointer-events-auto">
      <button
        ref={buttonRef}
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
      {panelPortal}
    </div>
  )
}
