import type { CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'

import { formatDate, formatTime } from '../../i18n/dateTime'
import type { AppNotification } from '../../types'

interface NotificationPanelProps {
  items: AppNotification[]
  unreadCount: number
  isLoading: boolean
  errorMessage: string | null
  onSelect: (notification: AppNotification) => void
  onMarkAllRead: () => void
  style?: CSSProperties
}

export default function NotificationPanel({
  items,
  unreadCount,
  isLoading,
  errorMessage,
  onSelect,
  onMarkAllRead,
  style,
}: NotificationPanelProps) {
  const { t } = useTranslation()

  return (
    <div
      className="rounded-2xl bg-white shadow-card border border-border/60 overflow-hidden animate-slide-up"
      style={style}
      role="dialog"
      aria-label={t('notifications.title')}
    >
      <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-3 border-b border-border/40">
        <div className="min-w-0">
          <p className="text-sm font-extrabold text-black">{t('notifications.title')}</p>
          <p className="text-xs text-muted mt-0.5">
            {t('notifications.unreadCount', { count: unreadCount })}
          </p>
        </div>
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={() => void onMarkAllRead()}
            className="min-h-[36px] px-2 -mr-2 -mt-1 rounded-lg text-xs font-bold text-green-600 hover:text-green-700 active:bg-surface transition-colors flex-shrink-0"
          >
            {t('notifications.markAllRead')}
          </button>
        )}
      </div>

      <div className="max-h-[min(280px,36dvh)] overflow-y-auto scroll-smooth-y">
        {isLoading && items.length === 0 && (
          <p className="px-4 py-8 text-sm text-muted text-center">{t('common.loading')}</p>
        )}
        {errorMessage && (
          <p className="px-4 py-6 text-sm text-red-600 text-center">{errorMessage}</p>
        )}
        {!isLoading && !errorMessage && items.length === 0 && (
          <p className="px-4 py-10 text-sm text-muted text-center">{t('notifications.emptyQuiet')}</p>
        )}
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item)}
            className={`w-full text-left px-4 py-3 border-b border-border/30 last:border-b-0 transition-colors hover:bg-surface ${
              item.readAt ? 'bg-white' : 'bg-amber-50/50'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-bold text-black leading-snug">{item.title}</p>
              {!item.readAt && (
                <span className="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0 mt-1.5" />
              )}
            </div>
            <p className="text-xs text-muted mt-1 line-clamp-3 whitespace-pre-wrap">{item.body}</p>
            <p className="text-[10px] text-muted/80 mt-1.5">
              {formatDate(new Date(item.createdAt))} · {formatTime(new Date(item.createdAt))}
            </p>
          </button>
        ))}
      </div>
    </div>
  )
}
