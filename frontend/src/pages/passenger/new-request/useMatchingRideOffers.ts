import { useEffect, useState } from 'react'
import { listMatchingRideOffers } from '../../../lib/backend'
import { isOfferVisibleToPassenger } from '../../../lib/offerSeats'
import { hasRideDateTime } from '../../../lib/rideDraft'
import type { LatLng, MatchedPassengerRideOffer } from '../../../types'

interface UseMatchingRideOffersOptions {
  from: LatLng | null
  to: LatLng | null
  dateTime?: string | null
  limit?: number
  enabled?: boolean
}

export function useMatchingRideOffers({
  from,
  to,
  dateTime,
  limit = 5,
  enabled = true,
}: UseMatchingRideOffersOptions) {
  const [items, setItems] = useState<MatchedPassengerRideOffer[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled || !from || !to || !hasRideDateTime(dateTime)) {
      setItems([])
      setError(null)
      return
    }

    let cancelled = false
    const timeoutId = window.setTimeout(() => {
      void (async () => {
        setIsLoading(true)
        try {
          const page = await listMatchingRideOffers({
            fromLat: from.lat,
            fromLng: from.lng,
            toLat: to.lat,
            toLng: to.lng,
            dateTime: dateTime || undefined,
            limit,
            minScore: 60,
            radiusKm: 2,
          })
          if (!cancelled) {
            setItems(page.items.filter(isOfferVisibleToPassenger))
            setError(null)
          }
        } catch (err) {
          if (!cancelled) {
            setItems([])
            setError(err instanceof Error ? err.message : 'Error')
          }
        } finally {
          if (!cancelled) setIsLoading(false)
        }
      })()
    }, 300)

    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [enabled, from, to, dateTime, limit])

  return { items, isLoading, error }
}
