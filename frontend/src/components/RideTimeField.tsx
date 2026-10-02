import { CaretDown, Clock } from '@phosphor-icons/react'
import { useEffect, useId, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { hapticSelection } from '../lib/telegram'

type RideTimeFieldProps = {
  value: string
  slots: string[]
  onChange: (time: string) => void
  className?: string
}

/**
 * Custom time picker — native &lt;select&gt; is unreliable in Telegram WebView
 * when ancestors use CSS transform / overflow (bottom sheets).
 */
export default function RideTimeField({ value, slots, onChange, className = '' }: RideTimeFieldProps) {
  const { t } = useTranslation()
  const titleId = useId()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [open])

  const label =
    value ||
    t('passenger.selectTime', {
      defaultValue: 'Выберите время',
    })

  return (
    <>
      <button
        type="button"
        onClick={() => {
          hapticSelection()
          setOpen(true)
        }}
        className={`flex items-center gap-1.5 w-full px-2 py-2 rounded-lg bg-surface border-t border-surface pt-2.5 text-left touch-manipulation ${className}`}
      >
        <Clock size={14} className="text-muted flex-shrink-0" />
        <span
          className={`flex-1 text-xs font-semibold min-w-0 truncate ${
            value ? 'text-black' : 'text-muted'
          }`}
        >
          {label}
        </span>
        <CaretDown size={12} weight="bold" className="text-muted flex-shrink-0" />
      </button>

      {open &&
        createPortal(
          <div className="fixed inset-0 z-[800] flex flex-col justify-end">
            <button
              type="button"
              aria-label={t('common.close', { defaultValue: 'Close' })}
              className="absolute inset-0 bg-black/40"
              onClick={() => setOpen(false)}
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              className="relative z-10 w-full max-h-[55dvh] bg-white rounded-t-2xl shadow-[0_-8px_32px_rgba(0,0,0,0.18)] flex flex-col animate-slide-up md:max-w-xl md:mx-auto"
              style={{ paddingBottom: 'calc(var(--app-user-safe-bottom, 0px) + 12px)' }}
            >
              <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-border/60">
                <p id={titleId} className="text-sm font-extrabold tracking-tight">
                  {t('passenger.selectTime', { defaultValue: 'Выберите время' })}
                </p>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="text-xs font-bold text-muted px-2 py-1 rounded-lg active:bg-surface"
                >
                  {t('common.close', { defaultValue: 'Close' })}
                </button>
              </div>
              <div className="overflow-y-auto overscroll-contain px-2 py-1">
                {slots.length === 0 ? (
                  <p className="px-3 py-6 text-xs text-muted text-center leading-snug">
                    {t('passenger.noTimeSlotsToday', {
                      defaultValue:
                        'На выбранный день слотов нет. Выберите другой день.',
                    })}
                  </p>
                ) : (
                  slots.map((slot) => {
                    const selected = slot === value
                    return (
                      <button
                        key={slot}
                        type="button"
                        onClick={() => {
                          hapticSelection()
                          onChange(slot)
                          setOpen(false)
                        }}
                        className={`w-full text-left px-3 py-3 rounded-xl text-sm font-semibold transition-colors touch-manipulation ${
                          selected
                            ? 'bg-black text-white'
                            : 'text-black active:bg-surface'
                        }`}
                      >
                        {slot}
                      </button>
                    )
                  })
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
