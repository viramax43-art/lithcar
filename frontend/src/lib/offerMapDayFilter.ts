import { addAppLocalDays } from '../i18n/dateTime'

export type OfferDayOffset = 0 | 1 | 2

export function offerMapDateForOffset(offset: OfferDayOffset): string {
  return addAppLocalDays(new Date(), offset)
}

export const OFFER_DAY_OFFSETS: OfferDayOffset[] = [0, 1, 2]
