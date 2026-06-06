import { useCallback, useMemo, useState } from 'react'
import { Calendar, CaretDown, CaretUp, Clock } from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'

import { toDateInputValue, type PeriodFilterState } from '../../../lib/periodFilter'

export interface DriverMapPeriodFilterProps extends PeriodFilterState {
  pointCount: number
  topOffset?: string
  showAvailableLegend?: boolean
  onFilterDateChange: (value: string) => void
  onFilterDateEndChange: (value: string) => void
  onFilterTimeChange: (value: string) => void
  onFilterTimeEndChange: (value: string) => void
  onExpandedChange?: (expanded: boolean) => void
}

function isDefaultTodayFilter(
  filterDate: string,
  filterDateEnd: string,
  filterTime: string,
  filterTimeEnd: string,
  today: string,
): boolean {
  return filterDate === today && filterDateEnd === today && filterTime === '00:00' && filterTimeEnd === '23:59'
}

export default function DriverMapPeriodFilter({
  pointCount,
  topOffset = 'calc(var(--app-safe-area-top-total) + 64px)',
  showAvailableLegend = false,
  filterDate,
  filterDateEnd,
  filterTime,
  filterTimeEnd,
  onFilterDateChange,
  onFilterDateEndChange,
  onFilterTimeChange,
  onFilterTimeEndChange,
  onExpandedChange,
}: DriverMapPeriodFilterProps) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)

  const setExpandedState = useCallback(
    (value: boolean) => {
      setExpanded(value)
      onExpandedChange?.(value)
    },
    [onExpandedChange],
  )

  const dayOptions = useMemo(() => {
    const now = new Date()
    const tomorrow = new Date(now)
    tomorrow.setDate(now.getDate() + 1)
    const dayAfterTomorrow = new Date(now)
    dayAfterTomorrow.setDate(now.getDate() + 2)
    return {
      today: toDateInputValue(now),
      tomorrow: toDateInputValue(tomorrow),
      dayAfterTomorrow: toDateInputValue(dayAfterTomorrow),
    }
  }, [])

  const applySingleDay = useCallback(
    (dayValue: string) => {
      onFilterDateChange(dayValue)
      onFilterDateEndChange(dayValue)
    },
    [onFilterDateChange, onFilterDateEndChange],
  )

  const showAllTrips = useCallback(() => {
    onFilterDateChange('')
    onFilterDateEndChange('')
    onFilterTimeChange('')
    onFilterTimeEndChange('')
  }, [onFilterDateChange, onFilterDateEndChange, onFilterTimeChange, onFilterTimeEndChange])

  const collapsedLabel = useMemo(() => {
    if (!filterDate && !filterDateEnd) {
      return t('common.allTrips')
    }
    if (filterDate === dayOptions.today && filterDateEnd === dayOptions.today) {
      return t('common.today')
    }
    if (filterDate === dayOptions.tomorrow && filterDateEnd === dayOptions.tomorrow) {
      return t('common.tomorrow')
    }
    if (filterDate === dayOptions.dayAfterTomorrow && filterDateEnd === dayOptions.dayAfterTomorrow) {
      return t('common.dayAfterTomorrow')
    }
    if (filterDate && filterDateEnd && filterDate === filterDateEnd) {
      return filterDate
    }
    if (filterDate && filterDateEnd) {
      return `${filterDate} – ${filterDateEnd}`
    }
    return t('common.periodFilter')
  }, [filterDate, filterDateEnd, dayOptions, t])

  const hasCustomFilter = !isDefaultTodayFilter(
    filterDate,
    filterDateEnd,
    filterTime,
    filterTimeEnd,
    dayOptions.today,
  )

  return (
    <div
      className="driver-map-period-filter absolute left-3 right-3 z-[12] bg-white rounded-card shadow-card overflow-hidden"
      style={{ top: topOffset }}
    >
      <button
        type="button"
        onClick={() => setExpandedState(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2.5 min-h-[44px] touch-none text-left"
      >
        <Calendar size={16} className="text-muted flex-shrink-0" />
        <span className="flex-1 min-w-0 text-xs font-semibold truncate">
          {collapsedLabel}
          <span className="text-muted font-medium">
            {' '}
            · {t('driver.map.periodFilterCount', { count: pointCount })}
          </span>
        </span>
        {hasCustomFilter && (
          <span className="text-[10px] text-muted flex-shrink-0">{t('common.filterActive')}</span>
        )}
        <span className="w-8 h-8 rounded-lg border border-border flex items-center justify-center flex-shrink-0">
          {expanded ? <CaretUp size={14} /> : <CaretDown size={14} />}
        </span>
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-2.5 border-t border-border/40">
          <div className="rounded-xl border border-border bg-surface/50 px-3 py-2">
            <div className="flex items-center gap-2 mb-1.5">
              <Clock size={15} className="text-muted flex-shrink-0" />
              <span className="text-[11px] text-muted whitespace-nowrap">
                {t('common.timeRangeFromTo', { defaultValue: 'Time from-to' })}
              </span>
            </div>
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
              <label className="min-w-0">
                <span className="text-[10px] text-muted">{t('common.from')}</span>
                <input
                  type="time"
                  value={filterTime}
                  onChange={(event) => onFilterTimeChange(event.target.value)}
                  className="w-full mt-1 h-10 px-2 rounded-lg border border-border bg-white text-xs outline-none focus:border-black"
                />
              </label>
              <span className="text-muted text-sm mt-5">-</span>
              <label className="min-w-0">
                <span className="text-[10px] text-muted">{t('common.to')}</span>
                <input
                  type="time"
                  value={filterTimeEnd}
                  onChange={(event) => onFilterTimeEndChange(event.target.value)}
                  className="w-full mt-1 h-10 px-2 rounded-lg border border-border bg-white text-xs outline-none focus:border-black"
                />
              </label>
            </div>
          </div>

          <div className="flex gap-1.5 overflow-x-auto scrollbar-none -mx-1 px-1 pb-0.5">
            <button
              type="button"
              onClick={() => applySingleDay(dayOptions.today)}
              className={`flex-shrink-0 min-h-10 px-3 rounded-lg border text-xs font-semibold transition-colors touch-none ${
                filterDate === dayOptions.today && filterDateEnd === dayOptions.today
                  ? 'border-black bg-black text-white'
                  : 'border-border hover:bg-surface'
              }`}
            >
              {t('common.today')}
            </button>
            <button
              type="button"
              onClick={() => applySingleDay(dayOptions.tomorrow)}
              className={`flex-shrink-0 min-h-10 px-3 rounded-lg border text-xs font-semibold transition-colors touch-none ${
                filterDate === dayOptions.tomorrow && filterDateEnd === dayOptions.tomorrow
                  ? 'border-black bg-black text-white'
                  : 'border-border hover:bg-surface'
              }`}
            >
              {t('common.tomorrow')}
            </button>
            <button
              type="button"
              onClick={() => applySingleDay(dayOptions.dayAfterTomorrow)}
              className={`flex-shrink-0 min-h-10 px-3 rounded-lg border text-xs font-semibold transition-colors touch-none ${
                filterDate === dayOptions.dayAfterTomorrow && filterDateEnd === dayOptions.dayAfterTomorrow
                  ? 'border-black bg-black text-white'
                  : 'border-border hover:bg-surface'
              }`}
            >
              {t('common.dayAfterTomorrow')}
            </button>
            <button
              type="button"
              onClick={showAllTrips}
              className="flex-shrink-0 min-h-10 px-3 rounded-lg border border-border text-xs font-semibold hover:bg-surface transition-colors touch-none"
            >
              {t('common.allTrips')}
            </button>
          </div>

          <p className="text-[10px] text-muted leading-snug px-0.5">
            {showAvailableLegend ? t('driver.map.legendAvailable') : t('driver.map.legendShort')}
          </p>
        </div>
      )}
    </div>
  )
}
