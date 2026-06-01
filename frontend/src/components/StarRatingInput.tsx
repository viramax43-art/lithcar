import { Star } from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'

interface StarRatingInputProps {
  value: number
  onChange: (score: number) => void
  disabled?: boolean
  size?: 'sm' | 'md'
}

export default function StarRatingInput({
  value,
  onChange,
  disabled = false,
  size = 'md',
}: StarRatingInputProps) {
  const { t } = useTranslation()
  const starSize = size === 'sm' ? 28 : 36
  return (
    <div className="flex items-center justify-center gap-2">
      {[1, 2, 3, 4, 5].map((score) => {
        const filled = score <= value
        return (
          <button
            key={score}
            type="button"
            disabled={disabled}
            onClick={() => onChange(score)}
            className="p-1 rounded-lg transition-transform active:scale-95 disabled:opacity-50"
            aria-label={t('rating.starAria', { score, defaultValue: `Rating ${score}` })}
          >
            <Star
              size={starSize}
              weight={filled ? 'fill' : 'regular'}
              className={filled ? 'text-amber-400' : 'text-border'}
            />
          </button>
        )
      })}
    </div>
  )
}
