import { addAppLocalDays } from '../i18n/dateTime'
import { buildRideTimeSlots } from './rideTimeSlots'
import type { PricingSettings } from '../types'

export type OfferDayOffset = 0 | 1 | 2

export function offerMapDateForOffset(offset: OfferDayOffset): string {
  return addAppLocalDays(new Date(), offset)
}

export const OFFER_DAY_OFFSETS: OfferDayOffset[] = [0, 1, 2]

type DayBookablePricing = Pick<PricingSettings, 'workStartTime' | 'workEndTime' | 'slotIntervalMinutes'>

function pricingSlotParams(pricing: DayBookablePricing) {
  return {
    workStartTime: pricing.workStartTime || '06:00',
    workEndTime: pricing.workEndTime || '19:00',
    slotIntervalMinutes: pricing.slotIntervalMinutes || 30,
  }
}

export function isAppLocalDayBookable(date: string, pricing: DayBookablePricing): boolean {
  return buildRideTimeSlots({
    ...pricingSlotParams(pricing),
    selectedDate: date,
  }).length > 0
}

export function isOfferDayOffsetBookable(offset: OfferDayOffset, pricing: DayBookablePricing): boolean {
  return isAppLocalDayBookable(offerMapDateForOffset(offset), pricing)
}

export function offerDayOffsetFromDate(date: string): OfferDayOffset | null {
  for (const offset of OFFER_DAY_OFFSETS) {
    if (offerMapDateForOffset(offset) === date) return offset
  }
  return null
}

export function firstAvailableOfferDayOffset(pricing: DayBookablePricing): OfferDayOffset {
  for (const offset of OFFER_DAY_OFFSETS) {
    if (isOfferDayOffsetBookable(offset, pricing)) return offset
  }
  return 2
}
