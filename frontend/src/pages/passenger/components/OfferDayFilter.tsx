import { useTranslation } from 'react-i18next'
import { hapticSelection } from '../../../lib/telegram'
import { OFFER_DAY_OFFSETS, type OfferDayOffset } from '../../../lib/offerMapDayFilter'

interface OfferDayFilterProps {
  value: OfferDayOffset
  onChange: (offset: OfferDayOffset) => void
}

const LABEL_KEYS: Record<OfferDayOffset, string> = {
  0: 'common.today',
  1: 'common.tomorrow',
  2: 'common.dayAfterTomorrow',
}

const LABEL_DEFAULTS: Record<OfferDayOffset, string> = {
  0: 'Today',
  1: 'Tomorrow',
  2: 'Day after',
}

export default function OfferDayFilter({ value, onChange }: OfferDayFilterProps) {
  const { t } = useTranslation()

  return (
    <div className="flex gap-2">
      {OFFER_DAY_OFFSETS.map((offset) => {
        const active = value === offset
        return (
          <button
            key={offset}
            type="button"
            onClick={() => {
              hapticSelection()
              onChange(offset)
            }}
            className={`flex-1 min-h-11 rounded-xl text-sm font-bold transition-colors touch-none ${
              active
                ? 'bg-black text-white shadow-card'
                : 'bg-surface text-muted hover:bg-border/30 active:bg-border/40'
            }`}
          >
            {t(LABEL_KEYS[offset], { defaultValue: LABEL_DEFAULTS[offset] })}
          </button>
        )
      })}
    </div>
  )
}
