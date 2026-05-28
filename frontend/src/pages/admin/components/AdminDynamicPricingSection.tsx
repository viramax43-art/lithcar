import { useCallback, useEffect, useState } from 'react'

import { getRideQuoteAdmin } from '../../../infrastructure/api/adminApi'
import { DEFAULT_PRICING_FORMULA } from '../../../lib/pricingDefaults'
import type { PricingFormula, PricingFormulaTier, PricingSettings, RideQuote } from '../../../types'
import { inputCls } from './AdminSidebarShared'

type PricingChangeHandler = (
  payload: Partial<
    Pick<
      PricingSettings,
      | 'pointsPerRide'
      | 'pointPriceCents'
      | 'pricingMode'
      | 'pricingFormula'
      | 'userInfoText'
      | 'workStartTime'
      | 'workEndTime'
      | 'slotIntervalMinutes'
    >
  >,
) => Promise<void>

interface AdminDynamicPricingSectionProps {
  pricing: PricingSettings
  onPricingChange: PricingChangeHandler
}

/** Примеры маршрутов для проверки цены (без координат в UI). */
const EXAMPLE_ROUTES = [
  {
    id: 'highway',
    label: 'Почти прямой путь',
    hint: 'Как по трассе между районами',
    fromLat: 54.6872,
    fromLng: 25.2797,
    toLat: 54.634,
    toLng: 25.287,
  },
  {
    id: 'mixed',
    label: 'Обычная поездка по городу',
    hint: 'Через несколько улиц',
    fromLat: 54.691,
    fromLng: 25.271,
    toLat: 54.7,
    toLng: 25.3,
  },
  {
    id: 'urban',
    label: 'Длинный путь с объездом',
    hint: 'Много поворотов, как через центр',
    fromLat: 54.68,
    fromLng: 25.25,
    toLat: 54.71,
    toLng: 25.32,
  },
] as const

const TIER_HINTS = [
  'Подходит, когда машина едет почти напрямик — дешевле всего.',
  'Обычный маршрут по городу — средняя цена.',
  'Много поворотов и объездов — дороже всего.',
] as const

function centsToEuro(cents: number): number {
  return Math.round(cents) / 100
}

function euroToCents(euro: number): number {
  return Math.max(0, Math.round(euro * 100))
}

function multToPercent(mult: number): number {
  return Math.round((mult - 1) * 100)
}

function percentToMult(percent: number): number {
  return 1 + Math.max(0, percent) / 100
}

function friendlyBreakdownLabel(key: string, label: string): string {
  const map: Record<string, string> = {
    base: 'Базовая плата',
    distance: 'За километры',
    duration: 'За время в пути',
    circuity: 'За сложный маршрут',
    clamp: 'Ограничение min/max',
    fixed: 'Фиксированная цена',
  }
  return map[key] ?? label.split('(')[0].trim()
}

export function AdminDynamicPricingSection({ pricing, onPricingChange }: AdminDynamicPricingSectionProps) {
  const [formulaDraft, setFormulaDraft] = useState<PricingFormula>(pricing.pricingFormula)
  const [pointsPerRideDraft, setPointsPerRideDraft] = useState(pricing.pointsPerRide)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [exampleRouteId, setExampleRouteId] = useState<string>(EXAMPLE_ROUTES[0].id)
  const [sandboxQuote, setSandboxQuote] = useState<RideQuote | null>(null)
  const [sandboxLoading, setSandboxLoading] = useState(false)
  const [sandboxError, setSandboxError] = useState<string | null>(null)

  useEffect(() => {
    setFormulaDraft(pricing.pricingFormula)
    setPointsPerRideDraft(pricing.pointsPerRide)
  }, [pricing.pricingFormula, pricing.pointsPerRide])

  const isDynamic = pricing.pricingMode === 'dynamic'
  const formulaDirty = JSON.stringify(formulaDraft) !== JSON.stringify(pricing.pricingFormula)
  const pointsDirty = pointsPerRideDraft !== pricing.pointsPerRide

  const updateTier = (index: number, patch: Partial<PricingFormulaTier>) => {
    setFormulaDraft((prev) => ({
      ...prev,
      tiers: prev.tiers.map((tier, i) => (i === index ? { ...tier, ...patch } : tier)),
    }))
  }

  const runExampleQuote = useCallback(async () => {
    const route = EXAMPLE_ROUTES.find((r) => r.id === exampleRouteId) ?? EXAMPLE_ROUTES[0]
    setSandboxLoading(true)
    setSandboxError(null)
    try {
      const quote = await getRideQuoteAdmin({
        fromLat: route.fromLat,
        fromLng: route.fromLng,
        toLat: route.toLat,
        toLng: route.toLng,
      })
      setSandboxQuote(quote)
    } catch (error) {
      setSandboxQuote(null)
      setSandboxError(error instanceof Error ? error.message : 'Не удалось посчитать цену')
    } finally {
      setSandboxLoading(false)
    }
  }, [exampleRouteId])

  return (
    <div className="space-y-4">
      <div className="rounded-card border-[1.5px] border-border p-4 space-y-3">
        <p className="text-sm font-bold">Как считать цену поездки</p>
        <div className="grid grid-cols-1 gap-2">
          <ModeButton
            active={pricing.pricingMode === 'fixed'}
            title="Одна цена на все поездки"
            description="Каждая поездка стоит одинаково — сколько поинтов вы укажете ниже."
            onClick={() => void onPricingChange({ pricingMode: 'fixed' })}
          />
          <ModeButton
            active={pricing.pricingMode === 'dynamic'}
            title="Цена зависит от маршрута"
            description="Длиннее и сложнее путь — дороже. Прямая дорога — дешевле."
            onClick={() => void onPricingChange({ pricingMode: 'dynamic' })}
          />
        </div>
      </div>

      {!isDynamic && (
        <div className="rounded-card border-[1.5px] border-border p-4 space-y-3">
          <label className="block text-sm font-bold">Поинтов за одну поездку</label>
          <p className="text-[11px] text-muted">
            Сколько спишется с пассажира за каждую заявку. В евро это: поинты × цена одного поинта.
          </p>
          <input
            type="number"
            min={1}
            value={pointsPerRideDraft}
            onChange={(e) => setPointsPerRideDraft(parseInt(e.target.value, 10) || 1)}
            className={inputCls}
          />
          <p className="text-xs text-muted">
            ≈ €{((pointsPerRideDraft * pricing.pointPriceCents) / 100).toFixed(2)} при текущей цене поинта
          </p>
          <button
            type="button"
            disabled={!pointsDirty}
            onClick={() => void onPricingChange({ pointsPerRide: pointsPerRideDraft })}
            className="w-full py-2.5 bg-black text-white rounded-xl text-sm font-bold disabled:opacity-50"
          >
            Сохранить
          </button>
        </div>
      )}

      {isDynamic && (
        <>
          <div className="rounded-card border-[1.5px] border-border p-4 space-y-4">
            <div>
              <p className="text-sm font-bold">Базовые тарифы</p>
              <p className="text-[11px] text-muted mt-1">Все суммы в евро. От них складывается цена поездки.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <EuroField
                label="Стартовая плата"
                hint="Платят всегда, даже за короткий путь"
                value={centsToEuro(formulaDraft.basePriceCents)}
                onChange={(euro) =>
                  setFormulaDraft((p) => ({ ...p, basePriceCents: euroToCents(euro) }))
                }
              />
              <EuroField
                label="За 1 км"
                hint="Чем дальше ехать — тем больше"
                value={centsToEuro(formulaDraft.pricePerKmCents)}
                onChange={(euro) =>
                  setFormulaDraft((p) => ({ ...p, pricePerKmCents: euroToCents(euro) }))
                }
                step={0.01}
              />
              <EuroField
                label="За 1 минуту"
                hint="Дольше в пути — дороже"
                value={centsToEuro(formulaDraft.pricePerMinuteCents)}
                onChange={(euro) =>
                  setFormulaDraft((p) => ({ ...p, pricePerMinuteCents: euroToCents(euro) }))
                }
                step={0.01}
              />
              <EuroField
                label="Минимум за поездку"
                value={centsToEuro(formulaDraft.minPriceCents)}
                onChange={(euro) =>
                  setFormulaDraft((p) => ({ ...p, minPriceCents: euroToCents(euro) }))
                }
              />
              <EuroField
                label="Максимум за поездку"
                value={centsToEuro(formulaDraft.maxPriceCents)}
                onChange={(euro) =>
                  setFormulaDraft((p) => ({ ...p, maxPriceCents: euroToCents(euro) }))
                }
              />
              <NumberField
                label="Минимум поинтов"
                hint="Не меньше этого спишется"
                value={formulaDraft.minPoints}
                min={1}
                onChange={(v) => setFormulaDraft((p) => ({ ...p, minPoints: v }))}
              />
            </div>
          </div>

          <div className="rounded-card border-[1.5px] border-border p-4 space-y-3">
            <div>
              <p className="text-sm font-bold">Наценка по типу дороги</p>
              <p className="text-[11px] text-muted mt-1">
                Прямой путь дешевле, город с поворотами — дороже. Подкрутите проценты, если нужно.
              </p>
            </div>
            {formulaDraft.tiers.map((tier, index) => (
              <div key={index} className="rounded-xl bg-surface p-3 space-y-3">
                <input
                  value={tier.label}
                  onChange={(e) => updateTier(index, { label: e.target.value })}
                  className={inputCls}
                  placeholder="Название"
                />
                <p className="text-[11px] text-muted">{TIER_HINTS[index] ?? 'Дополнительная категория маршрута.'}</p>
                <PercentField
                  label="Дороже за километры"
                  value={multToPercent(tier.distanceMultiplier)}
                  onChange={(pct) => updateTier(index, { distanceMultiplier: percentToMult(pct) })}
                />
                <PercentField
                  label="Дороже за время"
                  value={multToPercent(tier.minuteMultiplier)}
                  onChange={(pct) => updateTier(index, { minuteMultiplier: percentToMult(pct) })}
                />
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="w-full text-left text-xs font-semibold text-muted py-1"
          >
            {showAdvanced ? '▼ Скрыть дополнительные настройки' : '▶ Дополнительные настройки (обычно не нужны)'}
          </button>

          {showAdvanced && (
            <div className="rounded-card border border-dashed border-border p-4 space-y-3">
              <NumberField
                label="Порог «прямого» маршрута"
                hint="Техн. параметр: чем меньше число, тем строже считается путь прямым"
                value={formulaDraft.circuityFreeThreshold}
                step={0.01}
                onChange={(v) => setFormulaDraft((p) => ({ ...p, circuityFreeThreshold: v }))}
              />
              <EuroField
                label="Доплата за сложный путь (за шаг)"
                value={centsToEuro(formulaDraft.circuityPenaltyPerStepCents)}
                onChange={(euro) =>
                  setFormulaDraft((p) => ({ ...p, circuityPenaltyPerStepCents: euroToCents(euro) }))
                }
                step={0.01}
              />
              <NumberField
                label="Скорость по умолчанию (км/ч)"
                hint="Если карта маршрута временно недоступна"
                value={formulaDraft.fallbackSpeedKmh}
                step={1}
                onChange={(v) => setFormulaDraft((p) => ({ ...p, fallbackSpeedKmh: v }))}
              />
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={formulaDraft.requireOsrm}
                  onChange={(e) => setFormulaDraft((p) => ({ ...p, requireOsrm: e.target.checked }))}
                />
                Не считать цену, если маршрут на карте недоступен
              </label>
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              disabled={!formulaDirty}
              onClick={() => void onPricingChange({ pricingFormula: formulaDraft })}
              className="flex-1 py-2.5 bg-black text-white rounded-xl text-sm font-bold disabled:opacity-50"
            >
              Сохранить тарифы
            </button>
            <button
              type="button"
              onClick={() => setFormulaDraft(pricing.pricingFormula ?? DEFAULT_PRICING_FORMULA)}
              className="px-3 py-2.5 rounded-xl bg-surface text-xs font-semibold"
            >
              Отменить
            </button>
          </div>
        </>
      )}

      <div className="rounded-card border-[1.5px] border-border p-4 space-y-3">
        <p className="text-sm font-bold">Проверить, сколько выйдет</p>
        <p className="text-[11px] text-muted">Выберите пример поездки и посмотрите цену в поинтах и евро.</p>
        <select
          value={exampleRouteId}
          onChange={(e) => setExampleRouteId(e.target.value)}
          className={inputCls}
        >
          {EXAMPLE_ROUTES.map((route) => (
            <option key={route.id} value={route.id}>
              {route.label}
            </option>
          ))}
        </select>
        <p className="text-[10px] text-muted">
          {EXAMPLE_ROUTES.find((r) => r.id === exampleRouteId)?.hint}
        </p>
        <button
          type="button"
          disabled={sandboxLoading}
          onClick={() => void runExampleQuote()}
          className="w-full py-2.5 bg-black text-white rounded-xl text-sm font-bold disabled:opacity-50"
        >
          {sandboxLoading ? 'Считаем…' : 'Посчитать цену'}
        </button>
        {sandboxError && <p className="text-xs text-red-600">{sandboxError}</p>}
        {sandboxQuote && (
          <div className="rounded-xl bg-black text-white p-4 space-y-2 text-sm">
            <p className="text-2xl font-extrabold text-accent">
              {sandboxQuote.points} поинтов · €{sandboxQuote.priceEur.toFixed(2)}
            </p>
            {sandboxQuote.metrics && (
              <p className="text-white/70 text-xs">
                ~{sandboxQuote.metrics.roadKm} км, ~{Math.round(sandboxQuote.metrics.durationMin)} мин ·{' '}
                {sandboxQuote.metrics.tierLabel}
              </p>
            )}
            {sandboxQuote.breakdown.length > 0 && (
              <ul className="text-[11px] text-white/60 space-y-1 border-t border-white/15 pt-2">
                {sandboxQuote.breakdown.map((line) => (
                  <li key={line.key} className="flex justify-between gap-2">
                    <span>{friendlyBreakdownLabel(line.key, line.label)}</span>
                    <span>€{(line.amountCents / 100).toFixed(2)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function ModeButton({
  active,
  title,
  description,
  onClick,
}: {
  active: boolean
  title: string
  description: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left p-3 rounded-xl border-[1.5px] transition-all active:scale-[0.99] ${
        active ? 'border-black bg-black text-white' : 'border-border bg-white'
      }`}
    >
      <p className={`text-sm font-bold ${active ? 'text-white' : 'text-black'}`}>{title}</p>
      <p className={`text-[11px] mt-1 ${active ? 'text-white/70' : 'text-muted'}`}>{description}</p>
    </button>
  )
}

function EuroField({
  label,
  hint,
  value,
  onChange,
  step = 0.1,
}: {
  label: string
  hint?: string
  value: number
  onChange: (euro: number) => void
  step?: number
}) {
  return (
    <div>
      <label className="block text-[10px] font-semibold text-muted uppercase tracking-wider mb-1">{label}</label>
      {hint && <p className="text-[10px] text-muted mb-1">{hint}</p>}
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">€</span>
        <input
          type="number"
          min={0}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          className={`${inputCls} pl-7`}
        />
      </div>
    </div>
  )
}

function NumberField({
  label,
  hint,
  value,
  onChange,
  min,
  step = 1,
}: {
  label: string
  hint?: string
  value: number
  onChange: (v: number) => void
  min?: number
  step?: number
}) {
  return (
    <div>
      <label className="block text-[10px] font-semibold text-muted uppercase tracking-wider mb-1">{label}</label>
      {hint && <p className="text-[10px] text-muted mb-1">{hint}</p>}
      <input
        type="number"
        min={min}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className={inputCls}
      />
    </div>
  )
}

function PercentField({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (pct: number) => void
}) {
  return (
    <div>
      <label className="block text-[10px] font-semibold text-muted mb-1">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="range"
          min={0}
          max={80}
          value={value}
          onChange={(e) => onChange(parseInt(e.target.value, 10))}
          className="flex-1"
        />
        <span className="text-xs font-bold w-10 text-right">+{value}%</span>
      </div>
    </div>
  )
}
