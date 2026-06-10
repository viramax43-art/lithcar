import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

interface InlineConfirmProps {
  label: string
  confirmLabel?: string
  onConfirm: () => void
  className?: string
}

/**
 * Two-step confirmation button. First click reveals a confirmation state with
 * an auto-cancel after 3.5s; second click confirms. Avoids window.confirm.
 */
export default function InlineConfirm({
  label,
  confirmLabel = undefined,
  onConfirm,
  className = '',
}: InlineConfirmProps) {
  const { t } = useTranslation()
  const resolvedConfirmLabel = confirmLabel ?? t('common.confirm')
  const [armed, setArmed] = useState(false)
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current)
    }
  }, [])

  const handleClick = () => {
    if (!armed) {
      setArmed(true)
      timerRef.current = window.setTimeout(() => setArmed(false), 3500)
      return
    }
    if (timerRef.current) window.clearTimeout(timerRef.current)
    setArmed(false)
    onConfirm()
  }

  if (armed) {
    return (
      <button
        onClick={handleClick}
        className={`min-h-[36px] text-[11px] font-bold px-3 py-1.5 rounded-pill bg-red-600 text-white transition-all active:scale-[0.97] ${className}`}
      >
        {resolvedConfirmLabel}
      </button>
    )
  }
  return (
    <button
      onClick={handleClick}
      className={`min-h-[36px] text-[11px] font-semibold px-3 py-1.5 rounded-pill border border-red-200 text-red-600 hover:bg-red-50 transition-colors ${className}`}
    >
      {label}
    </button>
  )
}
