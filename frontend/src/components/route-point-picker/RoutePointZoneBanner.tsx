import { Warning, X } from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'

interface RoutePointZoneBannerProps {
  message: string | null
  onDismiss?: () => void
  topOffset?: string
}

export default function RoutePointZoneBanner({
  message,
  onDismiss,
  topOffset = 'calc(var(--app-user-safe-top) + 48px)',
}: RoutePointZoneBannerProps) {
  const { t } = useTranslation()
  if (!message) return null

  return (
    <div
      className="absolute left-3 right-3 z-30 flex items-center gap-2 px-3 py-2.5 bg-red-50 border border-red-200 rounded-pill shadow-card animate-fade-in"
      style={{ top: topOffset }}
    >
      <Warning size={16} weight="fill" className="text-red-500 flex-shrink-0" />
      <span className="text-xs font-semibold text-red-700 flex-1 truncate">{message}</span>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="flex-shrink-0 w-8 h-8 -my-1 flex items-center justify-center rounded-full touch-compact"
          aria-label={t('common.close', { defaultValue: 'Close' })}
        >
          <X size={14} className="text-red-400" />
        </button>
      )}
    </div>
  )
}
