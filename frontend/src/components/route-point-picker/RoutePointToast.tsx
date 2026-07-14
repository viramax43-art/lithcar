import { Info, X } from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'

interface RoutePointToastProps {
  message: string | null
  onDismiss?: () => void
  bottomOffset?: string
}

export default function RoutePointToast({
  message,
  onDismiss,
  bottomOffset = 'calc(var(--app-user-safe-bottom) + 96px)',
}: RoutePointToastProps) {
  const { t } = useTranslation()
  if (!message) return null

  return (
    <div
      className="absolute left-4 right-4 z-30 flex items-start gap-3 px-3.5 py-3 bg-white border border-border rounded-card shadow-card animate-slide-up md:max-w-md md:mx-auto"
      style={{ bottom: bottomOffset }}
    >
      <div className="w-8 h-8 rounded-full bg-surface flex items-center justify-center flex-shrink-0">
        <Info size={16} weight="fill" className="text-black" />
      </div>
      <span className="text-xs font-semibold text-black flex-1 leading-snug pt-1.5">{message}</span>
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
