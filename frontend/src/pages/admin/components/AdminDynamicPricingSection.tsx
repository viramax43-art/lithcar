import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CircleMarker, MapContainer, Polyline, TileLayer, useMapEvents } from 'react-leaflet'

import { getRideQuoteAdmin } from '../../../infrastructure/api/adminApi'
import { DEFAULT_PRICING_FORMULA } from '../../../lib/pricingDefaults'
import type { LatLng, PricingFormula, PricingFormulaTier, PricingSettings, RideQuote } from '../../../types'
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

const TIER_HINT_KEYS = [
  'admin.pricing.tierHint0',
  'admin.pricing.tierHint1',
  'admin.pricing.tierHint2',
] as const

const BREAKDOWN_LABEL_KEYS: Record<string, string> = {
  base: 'admin.pricing.breakdown.base',
  distance: 'admin.pricing.breakdown.distance',
  duration: 'admin.pricing.breakdown.duration',
  circuity: 'admin.pricing.breakdown.circuity',
  clamp: 'admin.pricing.breakdown.clamp',
  fixed: 'admin.pricing.breakdown.fixed',
}

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

function normalizeToFixedPoints(rideEuro: number, pointPriceCents: number): number {
  const pointPriceEur = Math.max(pointPriceCents, 1) / 100
  return Math.max(1, Math.round(rideEuro / pointPriceEur))
}

function fromFixedPointsToEur(points: number, pointPriceCents: number): number {
  return points * Math.max(pointPriceCents, 1) / 100
}

function friendlyBreakdownLabel(key: string, label: string, translate: (key: string) => string): string {
  const mappedKey = BREAKDOWN_LABEL_KEYS[key]
  return mappedKey ? translate(mappedKey) : label.split('(')[0].trim()
}

export function AdminDynamicPricingSection({ pricing, onPricingChange }: AdminDynamicPricingSectionProps) {
  const { t } = useTranslation()
  const [formulaDraft, setFormulaDraft] = useState<PricingFormula>(pricing.pricingFormula)
  const [fixedRideEuroDraft, setFixedRideEuroDraft] = useState(
    fromFixedPointsToEur(pricing.pointsPerRide, pricing.pointPriceCents),
  )
  const [sandboxQuote, setSandboxQuote] = useState<RideQuote | null>(null)
  const [sandboxLoading, setSandboxLoading] = useState(false)
  const [sandboxError, setSandboxError] = useState<string | null>(null)
  const [quoteFrom, setQuoteFrom] = useState<LatLng>({ lat: 54.6872, lng: 25.2797 })
  const [quoteTo, setQuoteTo] = useState<LatLng>({ lat: 54.7, lng: 25.3 })
  const [activeQuotePoint, setActiveQuotePoint] = useState<'from' | 'to'>('from')

  useEffect(() => {
    setFormulaDraft(pricing.pricingFormula)
    setFixedRideEuroDraft(fromFixedPointsToEur(pricing.pointsPerRide, pricing.pointPriceCents))
  }, [pricing.pricingFormula, pricing.pointsPerRide, pricing.pointPriceCents])

  const isDynamic = pricing.pricingMode === 'dynamic'
  const formulaDirty = JSON.stringify(formulaDraft) !== JSON.stringify(pricing.pricingFormula)
  const fixedPointsDraft = useMemo(
    () => normalizeToFixedPoints(fixedRideEuroDraft, pricing.pointPriceCents),
    [fixedRideEuroDraft, pricing.pointPriceCents],
  )
  const pointsDirty = fixedPointsDraft !== pricing.pointsPerRide

  const updateTier = (index: number, patch: Partial<PricingFormulaTier>) => {
    setFormulaDraft((prev) => ({
      ...prev,
      tiers: prev.tiers.map((tier, i) => (i === index ? { ...tier, ...patch } : tier)),
    }))
  }

  const runExampleQuote = useCallback(async () => {
    setSandboxLoading(true)
    setSandboxError(null)
    try {
      const quote = await getRideQuoteAdmin({
        fromLat: quoteFrom.lat,
        fromLng: quoteFrom.lng,
        toLat: quoteTo.lat,
        toLng: quoteTo.lng,
      })
      setSandboxQuote(quote)
    } catch (error) {
      setSandboxQuote(null)
      setSandboxError(error instanceof Error ? error.message : t('errors.quoteFailed'))
    } finally {
      setSandboxLoading(false)
    }
  }, [quoteFrom, quoteTo, t])

  return (
    <div className="space-y-4">
      <div className="rounded-card border-[1.5px] border-border p-4 space-y-3">
        <p className="text-sm font-bold">{t('admin.pricing.howToPrice')}</p>
        <div className="grid grid-cols-1 gap-2">
          <ModeButton
            active={pricing.pricingMode === 'fixed'}
            title={t('admin.pricing.fixedModeTitle')}
            description={t('admin.pricing.fixedModeDesc')}
            onClick={() => void onPricingChange({ pricingMode: 'fixed' })}
          />
          <ModeButton
            active={pricing.pricingMode === 'dynamic'}
            title={t('admin.pricing.dynamicModeTitle')}
            description={t('admin.pricing.dynamicModeDesc')}
            onClick={() => void onPricingChange({ pricingMode: 'dynamic' })}
          />
        </div>
      </div>

      {!isDynamic && (
        <div className="rounded-card border-[1.5px] border-border p-4 space-y-3">
          <label className="block text-sm font-bold">{t('admin.settings.ridePrice')}</label>
          <p className="text-[11px] text-muted">
            {t('admin.pricing.approxAtPointPrice', {
              amount: (pricing.pointPriceCents / 100).toFixed(2),
            })}
          </p>
          <EuroField
            label={t('admin.settings.approxEur')}
            value={fixedRideEuroDraft}
            onChange={(euro) => setFixedRideEuroDraft(euro)}
          />
          <p className="text-xs text-muted">
            {t('admin.settings.pointsCount', {
              count: fixedPointsDraft,
            })}
          </p>
          <button
            type="button"
            disabled={!pointsDirty}
            onClick={() => void onPricingChange({ pointsPerRide: fixedPointsDraft })}
            className="w-full py-2.5 bg-black text-white rounded-xl text-sm font-bold disabled:opacity-50"
          >
            {t('common.save')}
          </button>
        </div>
      )}

      {isDynamic && (
        <>
          <div className="rounded-card border-[1.5px] border-border p-4 space-y-4">
            <div>
              <p className="text-sm font-bold">{t('admin.pricing.baseTariffs')}</p>
              <p className="text-[11px] text-muted mt-1">{t('admin.pricing.baseTariffsHint')}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <EuroField
                label={t('admin.pricing.perKm')}
                hint={t('admin.pricing.perKmHint')}
                value={centsToEuro(formulaDraft.pricePerKmCents)}
                onChange={(euro) =>
                  setFormulaDraft((p) => ({ ...p, pricePerKmCents: euroToCents(euro) }))
                }
                step={0.01}
              />
              <EuroField
                label={t('admin.pricing.perMinute')}
                hint={t('admin.pricing.perMinuteHint')}
                value={centsToEuro(formulaDraft.pricePerMinuteCents)}
                onChange={(euro) =>
                  setFormulaDraft((p) => ({ ...p, pricePerMinuteCents: euroToCents(euro) }))
                }
                step={0.01}
              />
              <EuroField
                label={t('admin.pricing.minRidePrice')}
                value={centsToEuro(formulaDraft.minPriceCents)}
                onChange={(euro) =>
                  setFormulaDraft((p) => ({ ...p, minPriceCents: euroToCents(euro) }))
                }
              />
              <EuroField
                label={t('admin.pricing.maxRidePrice')}
                value={centsToEuro(formulaDraft.maxPriceCents)}
                onChange={(euro) =>
                  setFormulaDraft((p) => ({ ...p, maxPriceCents: euroToCents(euro) }))
                }
              />
            </div>
          </div>

          <div className="rounded-card border-[1.5px] border-border p-4 space-y-3">
            <div>
              <p className="text-sm font-bold">{t('admin.pricing.roadSurcharge')}</p>
              <p className="text-[11px] text-muted mt-1">{t('admin.pricing.roadSurchargeHint')}</p>
            </div>
            {formulaDraft.tiers.map((tier, index) => (
              <div key={index} className="rounded-xl bg-surface p-3 space-y-3">
                <p className="text-sm font-bold">
                  {index === 0
                    ? t('admin.pricing.exampleHighway')
                    : index === 1
                      ? t('admin.pricing.exampleMixed')
                      : t('admin.pricing.exampleUrban')}
                </p>
                <p className="text-[11px] text-muted">
                  {t(TIER_HINT_KEYS[index] ?? 'admin.pricing.tierHintExtra')}
                </p>
                <PercentField
                  label={t('admin.pricing.surchargeKm')}
                  value={multToPercent(tier.distanceMultiplier)}
                  onChange={(pct) => updateTier(index, { distanceMultiplier: percentToMult(pct) })}
                />
                <PercentField
                  label={t('admin.pricing.surchargeTime')}
                  value={multToPercent(tier.minuteMultiplier)}
                  onChange={(pct) => updateTier(index, { minuteMultiplier: percentToMult(pct) })}
                />
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              disabled={!formulaDirty}
              onClick={() => void onPricingChange({
                pricingFormula: {
                  ...formulaDraft,
                  basePriceCents: 0,
                  minPoints: normalizeToFixedPoints(centsToEuro(formulaDraft.minPriceCents), pricing.pointPriceCents),
                },
              })}
              className="flex-1 py-2.5 bg-black text-white rounded-xl text-sm font-bold disabled:opacity-50"
            >
              {t('admin.pricing.saveTariffs')}
            </button>
            <button
              type="button"
              onClick={() => setFormulaDraft(pricing.pricingFormula ?? DEFAULT_PRICING_FORMULA)}
              className="px-3 py-2.5 rounded-xl bg-surface text-xs font-semibold"
            >
              {t('admin.pricing.undoChanges')}
            </button>
          </div>
        </>
      )}

      <div className="rounded-card border-[1.5px] border-border p-4 space-y-3">
        <p className="text-sm font-bold">{t('admin.pricing.checkPrice')}</p>
        <p className="text-[11px] text-muted">{t('admin.pricing.checkPriceHint')}</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveQuotePoint('from')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
              activeQuotePoint === 'from' ? 'bg-red-500 text-white' : 'bg-surface text-muted'
            }`}
          >
            {t('common.from')}
          </button>
          <button
            type="button"
            onClick={() => setActiveQuotePoint('to')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
              activeQuotePoint === 'to' ? 'bg-blue-500 text-white' : 'bg-surface text-muted'
            }`}
          >
            {t('common.to')}
          </button>
          <span className="text-[11px] text-muted">
            {t('admin.assignModal.mapHint')}
          </span>
        </div>
        <div className="h-52 rounded-xl overflow-hidden border border-border">
          <MapContainer
            center={[(quoteFrom.lat + quoteTo.lat) / 2, (quoteFrom.lng + quoteTo.lng) / 2]}
            zoom={13}
            style={{ width: '100%', height: '100%' }}
            zoomControl={false}
            attributionControl={false}
          >
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <QuoteMapClickHandler
              activePoint={activeQuotePoint}
              onSetFrom={setQuoteFrom}
              onSetTo={setQuoteTo}
            />
            <CircleMarker center={[quoteFrom.lat, quoteFrom.lng]} radius={7} pathOptions={{ color: '#fff', fillColor: '#EF4444', fillOpacity: 1, weight: 2 }} />
            <CircleMarker center={[quoteTo.lat, quoteTo.lng]} radius={7} pathOptions={{ color: '#fff', fillColor: '#3B82F6', fillOpacity: 1, weight: 2 }} />
            <Polyline
              positions={[
                [quoteFrom.lat, quoteFrom.lng],
                [quoteTo.lat, quoteTo.lng],
              ]}
              pathOptions={{ color: '#111827', weight: 2.5, dashArray: '6,6', opacity: 0.65 }}
            />
          </MapContainer>
        </div>
        <button
          type="button"
          disabled={sandboxLoading}
          onClick={() => void runExampleQuote()}
          className="w-full py-2.5 bg-black text-white rounded-xl text-sm font-bold disabled:opacity-50"
        >
          {sandboxLoading ? t('common.calculating') : t('admin.pricing.calculatePrice')}
        </button>
        {sandboxError && <p className="text-xs text-red-600">{sandboxError}</p>}
        {sandboxQuote && (
          <div className="rounded-xl bg-black text-white p-4 space-y-2 text-sm">
            <p className="text-2xl font-extrabold text-accent">
              {t('admin.pricing.quoteSummary', {
                points: sandboxQuote.points,
                eur: sandboxQuote.priceEur.toFixed(2),
              })}
            </p>
            {sandboxQuote.metrics && (
              <p className="text-white/70 text-xs">
                {t('admin.pricing.quoteMetrics', {
                  km: sandboxQuote.metrics.roadKm,
                  min: Math.round(sandboxQuote.metrics.durationMin),
                  tier: sandboxQuote.metrics.tierLabel,
                })}
              </p>
            )}
            {sandboxQuote.breakdown.length > 0 && (
              <ul className="text-[11px] text-white/60 space-y-1 border-t border-white/15 pt-2">
                {sandboxQuote.breakdown.map((line) => (
                  <li key={line.key} className="flex justify-between gap-2">
                    <span>{friendlyBreakdownLabel(line.key, line.label, t)}</span>
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

function QuoteMapClickHandler({
  activePoint,
  onSetFrom,
  onSetTo,
}: {
  activePoint: 'from' | 'to'
  onSetFrom: (value: LatLng) => void
  onSetTo: (value: LatLng) => void
}) {
  useMapEvents({
    click(event) {
      const value = { lat: event.latlng.lat, lng: event.latlng.lng }
      if (activePoint === 'from') onSetFrom(value)
      else onSetTo(value)
    },
  })
  return null
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
