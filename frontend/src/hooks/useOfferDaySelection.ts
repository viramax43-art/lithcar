import { useEffect, useMemo, useRef, useState } from 'react'
import {
  firstAvailableOfferDayOffset,
  isOfferDayOffsetBookable,
  offerDayOffsetFromDate,
  offerMapDateForOffset,
  OFFER_DAY_OFFSETS,
  type OfferDayOffset,
} from '../lib/offerMapDayFilter'
import { buildRideTimeSlots } from '../lib/rideTimeSlots'
import type { PricingSettings } from '../types'

type DayBookablePricing = Pick<PricingSettings, 'workStartTime' | 'workEndTime' | 'slotIntervalMinutes'>

export function useOfferDaySelection({
  pricing,
  dateTime,
  setDateTime,
}: {
  pricing: DayBookablePricing
  dateTime: string
  setDateTime: (value: string) => void
}) {
  const readyRef = useRef(false)
  const [offerDayOffset, setOfferDayOffset] = useState<OfferDayOffset>(() =>
    firstAvailableOfferDayOffset(pricing),
  )

  const offerMapDate = useMemo(() => offerMapDateForOffset(offerDayOffset), [offerDayOffset])

  const disabledOfferDayOffsets = useMemo(() => {
    const disabled = new Set<OfferDayOffset>()
    for (const offset of OFFER_DAY_OFFSETS) {
      if (!isOfferDayOffsetBookable(offset, pricing)) {
        disabled.add(offset)
      }
    }
    return disabled
  }, [pricing])

  const rideTimeSlots = useMemo(
    () =>
      buildRideTimeSlots({
        workStartTime: pricing.workStartTime || '06:00',
        workEndTime: pricing.workEndTime || '19:00',
        slotIntervalMinutes: pricing.slotIntervalMinutes || 30,
        selectedDate: offerMapDate,
      }),
    [pricing, offerMapDate],
  )

  useEffect(() => {
    if (!readyRef.current) {
      const draftDate = dateTime.split('T')[0]?.trim()
      const fromDraft = draftDate ? offerDayOffsetFromDate(draftDate) : null
      const nextOffset =
        fromDraft != null && isOfferDayOffsetBookable(fromDraft, pricing)
          ? fromDraft
          : firstAvailableOfferDayOffset(pricing)
      setOfferDayOffset(nextOffset)
      readyRef.current = true
      return
    }
    if (!isOfferDayOffsetBookable(offerDayOffset, pricing)) {
      setOfferDayOffset(firstAvailableOfferDayOffset(pricing))
    }
  }, [pricing, dateTime, offerDayOffset])

  useEffect(() => {
    if (!readyRef.current) return
    const [currentDate, timePart = ''] = dateTime.split('T')
    const validTime = timePart && rideTimeSlots.includes(timePart) ? timePart : ''
    const needsUpdate = currentDate !== offerMapDate || (timePart !== '' && validTime === '')
    if (!needsUpdate) return
    setDateTime(validTime ? `${offerMapDate}T${validTime}` : `${offerMapDate}T`)
  }, [offerDayOffset, offerMapDate, rideTimeSlots, dateTime, setDateTime])

  return {
    offerDayOffset,
    setOfferDayOffset,
    offerMapDate,
    disabledOfferDayOffsets,
    rideTimeSlots,
  }
}
