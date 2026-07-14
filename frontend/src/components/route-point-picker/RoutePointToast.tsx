import { Info, X } from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'

interface RoutePointToastProps {
  message: string | null
  onDismiss?: () => void
  topOffset?: string
}

export default function RoutePointToast({
  message,
  onDismiss,
  topOffset = 'var(--app-user-safe-top)',
}: RoutePointToastProps) {
  const { t } = useTranslation()
  if (!message) return null

  return (
    <div
      className="absolute left-3 right-3 z-40 flex items-start gap-3 px-3.5 py-3 bg-white border border-border/60 rounded-2xl shadow-card animate-fade-in md:max-w-md md:mx-auto"
      style={{ top: topOffset }}
      role="status"
    >
      <div className="w-8 h-8 rounded-full bg-surface flex items-center justify-center flex-shrink-0">
        <Info size={16} weight="fill" className="text-black" />
      </div>
      <p className="text-xs font-semibold text-black flex-1 leading-snug pt-1.5 min-w-0">{message}</p>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="flex-shrink-0 w-8 h-8 -my-0.5 flex items-center justify-center rounded-full touch-compact"
          aria-label={t('common.close', { defaultValue: 'Close' })}
        >
          <X size={14} className="text-muted" />
        </button>
      )}
    </div>
  )
}
