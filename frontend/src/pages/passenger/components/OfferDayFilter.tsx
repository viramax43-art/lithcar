import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { hapticSelection } from '../../../lib/telegram'
import { formatAppLocalDayLong } from '../../../lib/formatAppLocalDay'
import { OFFER_DAY_OFFSETS, offerMapDateForOffset, type OfferDayOffset } from '../../../lib/offerMapDayFilter'

interface OfferDayFilterProps {
  value: OfferDayOffset
  disabledOffsets?: ReadonlySet<OfferDayOffset>
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

export default function OfferDayFilter({ value, disabledOffsets, onChange }: OfferDayFilterProps) {
  const { t } = useTranslation()
  const selectedDateLabel = useMemo(
    () => formatAppLocalDayLong(offerMapDateForOffset(value)),
    [value],
  )

  return (
    <div className="space-y-1.5">
      <div className="flex gap-2">
        {OFFER_DAY_OFFSETS.map((offset) => {
          const active = value === offset
          const disabled = disabledOffsets?.has(offset) ?? false
          return (
            <button
              key={offset}
              type="button"
              disabled={disabled}
              onClick={() => {
                if (disabled) return
                hapticSelection()
                onChange(offset)
              }}
              className={`flex-1 min-h-11 rounded-xl text-sm font-bold transition-colors touch-none ${
                disabled
                  ? 'bg-surface text-muted/40 cursor-not-allowed'
                  : active
                    ? 'bg-black text-white shadow-card'
                    : 'bg-surface text-muted hover:bg-border/30 active:bg-border/40'
              }`}
            >
              {t(LABEL_KEYS[offset], { defaultValue: LABEL_DEFAULTS[offset] })}
            </button>
          )
        })}
      </div>
      <p className="text-center text-xs font-medium text-muted px-1">{selectedDateLabel}</p>
    </div>
  )
}
