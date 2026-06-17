import { useState } from 'react'
import { X } from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'
import StarRatingInput from './StarRatingInput'
import InlineConfirm from '../pages/admin/components/InlineConfirm'
import { useEscapeClose } from '../lib/useEscapeClose'

export interface RideRatingSheetBlockProps {
  label: string
  confirmLabel: string
  onConfirm: () => void | Promise<void>
  isBlocking?: boolean
  blocked?: boolean
}

interface RideRatingSheetProps {
  open: boolean
  title: string
  subtitle?: string
  isSubmitting?: boolean
  block?: RideRatingSheetBlockProps
  onClose: () => void
  onSubmit: (payload: { score: number; comment?: string }) => void | Promise<void>
  onSkip?: () => void
}

export default function RideRatingSheet({
  open,
  title,
  subtitle,
  isSubmitting = false,
  block,
  onClose,
  onSubmit,
  onSkip,
}: RideRatingSheetProps) {
  const { t } = useTranslation()
  const [score, setScore] = useState(0)
  const [comment, setComment] = useState('')

  useEscapeClose(open && !isSubmitting, onClose)

  if (!open) return null

  const handleSubmit = () => {
    if (score < 1) return
    const trimmed = comment.trim()
    void onSubmit({ score, comment: trimmed || undefined })
  }

  return (
    <>
      <div className="absolute inset-0 z-[25] bg-black/40" onClick={onClose} />
      <div className="absolute left-0 right-0 bottom-0 z-[30] bg-white rounded-t-3xl overflow-hidden animate-slide-up md:max-w-lg md:mx-auto md:rounded-t-2xl">
        <div className="flex justify-center pt-3">
          <div className="w-9 h-1 rounded-full bg-border" />
        </div>
        <div className="px-5 pt-4 pb-3 flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-lg font-extrabold tracking-tight">{title}</p>
            {subtitle && <p className="text-sm text-muted mt-0.5">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-11 h-11 rounded-2xl bg-surface flex items-center justify-center flex-shrink-0"
          >
            <X size={16} weight="bold" className="text-muted" />
          </button>
        </div>
        <div
          className="px-5 pb-6 space-y-4"
          style={{ paddingBottom: 'calc(1.5rem + var(--app-safe-area-bottom-total, 0px))' }}
        >
          <StarRatingInput value={score} onChange={setScore} disabled={isSubmitting} />
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            disabled={isSubmitting}
            placeholder={t('rating.commentOptional', { defaultValue: 'Comment (optional)' })}
            rows={3}
            maxLength={500}
            className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-black/10"
          />
          {block && !block.blocked && (
            <div className="rounded-xl border border-border bg-surface px-4 py-3 flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-muted">{block.label}</p>
              <InlineConfirm
                label={block.label}
                confirmLabel={block.confirmLabel}
                onConfirm={() => void block.onConfirm()}
              />
            </div>
          )}
          {block?.blocked && (
            <p className="text-xs font-medium text-muted text-center">
              {t('block.blockedSuccess', { defaultValue: 'User blocked' })}
            </p>
          )}
          <div className="flex gap-2.5">
            {onSkip && (
              <button
                type="button"
                onClick={onSkip}
                disabled={isSubmitting}
                className="flex-1 h-12 rounded-2xl border border-border text-sm font-bold text-muted active:bg-surface"
              >
                {t('common.skip', { defaultValue: 'Skip' })}
              </button>
            )}
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting || score < 1}
              className="flex-1 h-12 rounded-2xl bg-black text-white text-sm font-extrabold disabled:opacity-40 active:bg-zinc-900"
            >
              {isSubmitting
                ? t('common.sending', { defaultValue: 'Sending...' })
                : t('common.send', { defaultValue: 'Send' })}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
