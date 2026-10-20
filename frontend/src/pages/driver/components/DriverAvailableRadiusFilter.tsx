import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { CaretDown, CaretUp, Crosshair } from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'

import {
  DRIVER_AVAILABLE_RADIUS_MAX_KM,
  normalizeDriverAvailableRadiusMaxKm,
} from '../../../lib/driverAvailableRadius'

interface DriverAvailableRadiusFilterProps {
  /** Effective radius in km; `0` means "no limit". */
  radiusKm: number
  /** Admin-configured upper bound; falls back to the API limit. */
  maxRadiusKm?: number
  pointCount: number
  hiddenCount?: number
  /** The backend can only filter once the driver's position is known. */
  needsLocation?: boolean
  onChange: (value: number) => void
}

function formatRadius(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

function clampRadius(value: number, maxKm: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(maxKm, Math.max(0, Math.round(value)))
}

/**
 * Compact map bar that limits the "available rides" pool to a radius around
 * the driver. The radius is applied server-side; this component exposes a
 * continuous slider plus a manual numeric field. It is anchored to the bottom
 * edge by its parent, so the expanded panel opens upward without leaving the
 * viewport.
 */
export default function DriverAvailableRadiusFilter({
  radiusKm,
  maxRadiusKm = DRIVER_AVAILABLE_RADIUS_MAX_KM,
  pointCount,
  hiddenCount = 0,
  needsLocation = false,
  onChange,
}: DriverAvailableRadiusFilterProps) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const effectiveMaxKm = normalizeDriverAvailableRadiusMaxKm(maxRadiusKm)
  const [draftKm, setDraftKm] = useState(() => clampRadius(radiusKm, effectiveMaxKm))
  const [manualValue, setManualValue] = useState(() => String(clampRadius(radiusKm, effectiveMaxKm)))

  // Keep the local draft in sync when the effective radius changes (initial
  // load, admin default change, or a newer map poll).
  useEffect(() => {
    const next = clampRadius(radiusKm, effectiveMaxKm)
    setDraftKm(next)
    setManualValue(String(next))
  }, [radiusKm, effectiveMaxKm])

  const commitRadius = (value: number) => {
    const next = clampRadius(value, effectiveMaxKm)
    setDraftKm(next)
    setManualValue(String(next))
    if (next !== radiusKm) onChange(next)
  }

  const commitManualValue = () => {
    const parsed = Number(manualValue.replace(',', '.').trim())
    if (!Number.isFinite(parsed)) {
      setManualValue(String(draftKm))
      return
    }
    commitRadius(parsed)
  }

  const progress = effectiveMaxKm > 0
    ? Math.min(100, Math.max(0, (draftKm / effectiveMaxKm) * 100))
    : 0

  const valueLabel = draftKm > 0
    ? t('driver.map.radiusKm', { count: formatRadius(draftKm), defaultValue: '{{count}} км' })
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
        <div className="px-3 pt-2.5 pb-2 space-y-2 border-b border-border">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted">
              {t('driver.map.radiusFilter', { defaultValue: 'Радиус' })}
            </span>
            <label className="flex items-center gap-1.5">
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={effectiveMaxKm}
                step={1}
                value={manualValue}
                onChange={(event) => setManualValue(event.target.value)}
                onBlur={commitManualValue}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') event.currentTarget.blur()
                }}
                aria-label={t('driver.map.radiusManual', {
                  defaultValue: 'Радиус вручную, км',
                })}
                className="w-16 h-9 px-2 rounded-xl border-[1.5px] border-border bg-surface text-center text-sm font-bold outline-none focus:border-black focus:bg-white transition-colors"
              />
              <span className="text-[11px] font-semibold text-muted">
                {t('driver.map.radiusUnit', { defaultValue: 'км' })}
              </span>
            </label>
          </div>
          <input
            type="range"
            min={0}
            max={effectiveMaxKm}
            step={1}
            value={draftKm}
            onChange={(event) => setDraftKm(clampRadius(Number(event.target.value), effectiveMaxKm))}
            onPointerUp={(event) => commitRadius(Number(event.currentTarget.value))}
            onKeyUp={(event) => commitRadius(Number(event.currentTarget.value))}
            aria-label={t('driver.map.radiusFilter', { defaultValue: 'Радиус' })}
            aria-valuetext={valueLabel}
            className="driver-radius-slider w-full"
            style={{ '--driver-radius-progress': `${progress}%` } as CSSProperties}
          />
          <div className="flex justify-between text-[10px] font-medium text-muted">
            <span>{t('driver.map.radiusZero', { defaultValue: '0 — все' })}</span>
            <span>
              {t('driver.map.radiusKm', {
                count: formatRadius(effectiveMaxKm),
                defaultValue: '{{count}} км',
              })}
            </span>
          </div>
          <p className="text-[10px] leading-snug text-muted">
            {t('driver.map.radiusHint', {
              defaultValue: 'Показываются только заявки, посадка которых ближе выбранного радиуса.',
            })}
          </p>
          {needsLocation && draftKm > 0 && (
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
