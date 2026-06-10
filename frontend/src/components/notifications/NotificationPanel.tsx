import { ArrowLeft, Bell } from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'

import { formatDate, formatTime } from '../../i18n/dateTime'
import type { AppNotification } from '../../types'

interface NotificationPanelProps {
  items: AppNotification[]
  isLoading: boolean
  errorMessage: string | null
  onClose: () => void
  onSelect: (notification: AppNotification) => void
  onMarkAllRead: () => void
}

export default function NotificationPanel({
  items,
  isLoading,
  errorMessage,
  onClose,
  onSelect,
  onMarkAllRead,
}: NotificationPanelProps) {
  const { t } = useTranslation()
  const hasUnread = items.some((item) => !item.readAt)

  return (
    <div className="fixed inset-0 z-[250] bg-white flex flex-col animate-slide-in-right">
      <header
        className="flex-shrink-0 bg-white border-b border-border/50"
        style={{ paddingTop: 'var(--app-user-safe-top)' }}
      >
        <div className="flex items-center gap-3 px-3 h-14">
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-surface transition-colors"
          >
            <ArrowLeft size={18} weight="bold" />
          </button>
          <h1 className="text-base font-extrabold flex-1">{t('notifications.title')}</h1>
          {hasUnread && (
            <button
              type="button"
              onClick={() => void onMarkAllRead()}
              className="text-xs font-bold text-muted hover:text-black transition-colors"
            >
              {t('notifications.markAllRead')}
            </button>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto scroll-smooth-y px-4 py-4 space-y-3">
        {isLoading && items.length === 0 && (
          <p className="text-sm text-muted">{t('common.loading')}</p>
        )}
        {errorMessage && (
          <p className="text-sm text-red-600">{errorMessage}</p>
        )}
        {!isLoading && !errorMessage && items.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-14 h-14 rounded-2xl bg-surface flex items-center justify-center mb-3">
              <Bell size={24} className="text-muted" />
            </div>
            <p className="text-sm text-muted">{t('notifications.empty')}</p>
          </div>
        )}
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item)}
            className={`w-full text-left rounded-card border p-4 transition-colors ${
              item.readAt
                ? 'border-border bg-white'
                : 'border-amber-200 bg-amber-50/60'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-bold text-black">{item.title}</p>
              {!item.readAt && (
                <span className="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0 mt-1.5" />
              )}
            </div>
            <p className="text-sm text-muted mt-1 whitespace-pre-wrap">{item.body}</p>
            <p className="text-[10px] text-muted mt-2">
              {formatDate(new Date(item.createdAt))} · {formatTime(new Date(item.createdAt))}
            </p>
          </button>
        ))}
      </div>
    </div>
  )
}
