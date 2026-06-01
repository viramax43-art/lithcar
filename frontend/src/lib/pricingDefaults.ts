import type { PricingFormula, PricingSettings } from '../types'
import { EMPTY_USER_INFO_TEXT, normalizeUserInfoText } from './userInfoText'

export const DEFAULT_PRICING_FORMULA: PricingFormula = {
  version: 1,
  basePriceCents: 200,
  pricePerKmCents: 12,
  pricePerMinuteCents: 4,
  circuityFreeThreshold: 1.1,
  circuityPenaltyPerStepCents: 8,
  minPriceCents: 300,
  maxPriceCents: 2500,
  minPoints: 1,
  requireOsrm: false,
  fallbackSpeedKmh: 35,
  tiers: [
    { maxCircuity: 1.12, distanceMultiplier: 1, minuteMultiplier: 1, label: 'Direct route' },
    { maxCircuity: 1.3, distanceMultiplier: 1.15, minuteMultiplier: 1.1, label: 'Typical ride' },
    { maxCircuity: 999, distanceMultiplier: 1.35, minuteMultiplier: 1.25, label: 'City & detours' },
  ],
}

export const DEFAULT_PRICING_SETTINGS: PricingSettings = {
  pointsPerRide: 10,
  pointPriceCents: 50,
  pricingMode: 'fixed',
  pricingFormula: DEFAULT_PRICING_FORMULA,
  userInfoText: { ...EMPTY_USER_INFO_TEXT },
  userInfoTextProfile: { ...EMPTY_USER_INFO_TEXT },
  workStartTime: '06:00',
  workEndTime: '19:00',
  slotIntervalMinutes: 30,
}

export function mapPricingSettings(raw: Partial<PricingSettings>): PricingSettings {
  const formula = raw.pricingFormula ?? DEFAULT_PRICING_FORMULA
  return {
    pointsPerRide: Number(raw.pointsPerRide ?? 10),
    pointPriceCents: Number(raw.pointPriceCents ?? 50),
    pricingMode: raw.pricingMode === 'dynamic' ? 'dynamic' : 'fixed',
    pricingFormula: {
      ...DEFAULT_PRICING_FORMULA,
      ...formula,
      tiers: formula.tiers?.length ? formula.tiers : DEFAULT_PRICING_FORMULA.tiers,
    },
    userInfoText: normalizeUserInfoText(raw.userInfoText),
    userInfoTextProfile: normalizeUserInfoText(raw.userInfoTextProfile),
    workStartTime: String(raw.workStartTime ?? '06:00'),
    workEndTime: String(raw.workEndTime ?? '19:00'),
    slotIntervalMinutes: Number(raw.slotIntervalMinutes ?? 30),
  }
}
