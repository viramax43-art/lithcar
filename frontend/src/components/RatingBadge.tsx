import { Star } from '@phosphor-icons/react'

type RatingBadgeVariant = 'muted' | 'compact' | 'dark'

interface RatingBadgeProps {
  rating: number
  ratingCount?: number
  size?: 'sm' | 'md'
  variant?: RatingBadgeVariant
  className?: string
}

const STAR_SIZE = { sm: 10, md: 11 } as const

const VARIANT_CLASS: Record<RatingBadgeVariant, string> = {
  muted: 'text-[11px] text-muted',
  compact: 'text-[10px] font-bold text-amber-700',
  dark: 'text-xs font-bold text-amber-400',
}

const STAR_CLASS: Record<RatingBadgeVariant, string> = {
  muted: 'text-amber-400',
  compact: 'text-amber-700',
  dark: 'text-amber-400',
}

export default function RatingBadge({
  rating,
  ratingCount,
  size = 'md',
  variant = 'muted',
  className = '',
}: RatingBadgeProps) {
  return (
    <p className={`inline-flex items-center gap-1 mt-0.5 ${VARIANT_CLASS[variant]} ${className}`.trim()}>
      <Star size={STAR_SIZE[size]} weight="fill" className={STAR_CLASS[variant]} />
      {rating.toFixed(1)}
      {ratingCount != null && ratingCount > 0 && (
        <span className={variant === 'dark' ? 'text-white/50 font-semibold' : 'text-muted/80'}>
          ({ratingCount})
        </span>
      )}
    </p>
  )
}
