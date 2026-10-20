import { useState } from 'react'
import { CaretDown, CaretUp, Crosshair } from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'

import { DRIVER_AVAILABLE_RADIUS_OPTIONS } from '../../../lib/driverAvailableRadius'

interface DriverAvailableRadiusFilterProps {
  /** Effective radius in km; `0` means "no limit". */
  radiusKm: number
  pointCount: number
  hiddenCount?: number
  /** The backend can only filter once the driver's position is known. */
  needsLocation?: boolean
  onChange: (value: number) => void
}

function formatRadius(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

/**
 * Compact map bar that limits the "available rides" pool to a radius around
 * the driver. The radius is applied server-side; this component only owns the
 * presentation and the preset list. It is anchored to the bottom edge by its
 * parent, so the expanded panel opens upward without leaving the viewport.
 */
export default function DriverAvailableRadiusFilter({
  radiusKm,
  pointCount,
  hiddenCount = 0,
  needsLocation = false,
  onChange,
}: DriverAvailableRadiusFilterProps) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)

  // An admin may configure a value that is not one of the presets — keep it
  // selectable so the active chip is always visible.
  const options = DRIVER_AVAILABLE_RADIUS_OPTIONS.includes(radiusKm)
    ? DRIVER_AVAILABLE_RADIUS_OPTIONS
    : [...DRIVER_AVAILABLE_RADIUS_OPTIONS, radiusKm].sort((a, b) => a - b)

  const valueLabel = radiusKm > 0
    ? t('driver.map.radiusKm', { count: formatRadius(radiusKm), defaultValue: '{{count}} км' })
    : t('driver.map.radiusAll', { defaultValue: 'Все' })

  return (
    <div className="driver-available-radius-filter w-full bg-white rounded-card shadow-card overflow-hidden flex flex-col-reverse">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        className="w-full flex items-center gap-2 px-3 py-2.5 min-h-[44px] touch-none text-left"
      >
        <Crosshair size={16} className="text-muted flex-shrink-0" />
        <span className="flex-1 min-w-0 text-xs font-semibold truncate">
          {t('driver.map.radiusFilter', { defaultValue: 'Радиус' })}
          {': '}
          {valueLabel}
          {needsLocation && radiusKm > 0 ? (
            <span className="text-amber-700 font-semibold">
              {' '}
              · {t('driver.map.radiusLocationOff', { defaultValue: 'геолокация выключена' })}
            </span>
          ) : (
            <span className="text-muted font-medium">
              {' '}
              · {t('driver.map.radiusFilterCount', { count: pointCount, defaultValue: '{{count}} заявок' })}
            </span>
          )}
        </span>
        {hiddenCount > 0 && (
          <span className="flex-shrink-0 inline-flex items-center min-h-[20px] px-2 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold">
            {t('driver.map.hiddenByFilter', { count: hiddenCount, defaultValue: '+{{count}} скрыто' })}
          </span>
        )}
        {expanded ? (
          <CaretUp size={14} className="text-muted flex-shrink-0" />
        ) : (
          <CaretDown size={14} className="text-muted flex-shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="px-3 pt-3 pb-1 space-y-2 border-b border-border">
          <div className="grid grid-cols-4 gap-1.5">
            {options.map((value) => {
              const selected = value === radiusKm
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onChange(value)}
                  className={`min-h-9 rounded-xl px-2 text-[11px] font-bold transition-colors touch-none ${
                    selected ? 'bg-black text-white' : 'bg-surface text-muted hover:text-black'
                  }`}
                >
                  {value === 0
                    ? t('driver.map.radiusAll', { defaultValue: 'Все' })
                    : t('driver.map.radiusKm', {
                        count: formatRadius(value),
                        defaultValue: '{{count}} км',
                      })}
                </button>
              )
            })}
          </div>
          <p className="text-[10px] leading-snug text-muted">
            {t('driver.map.radiusHint', {
              defaultValue: 'Показываются только заявки, посадка которых ближе выбранного радиуса.',
            })}
          </p>
          {needsLocation && radiusKm > 0 && (
            <p className="text-[10px] leading-snug font-semibold text-amber-700">
              {t('driver.map.radiusNeedsLocation', {
                defaultValue: 'Включите геолокацию, чтобы фильтр по расстоянию работал.',
              })}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
