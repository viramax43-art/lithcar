import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { bookRideOffer, listRideOffers } from '../../../lib/backend'
import { parseOfferBookingConflict } from '../../../lib/offerBooking'
import { isOfferVisibleToPassenger } from '../../../lib/offerSeats'
import { ApiError, parseApiErrorCode } from '../../../infrastructure/http/httpClient'
import { hapticNotification, hapticSelection } from '../../../lib/telegram'
import type { LatLng, MatchedPassengerRideOffer, PassengerRideOffer } from '../../../types'

const POLL_INTERVAL_MS = 60_000
const PAGE_LIMIT = 50
const GEO_RADIUS_KM = 2
const DEBOUNCE_MS = 300

export interface UsePassengerRideOffersOnMapOptions {
  /** When true — offer markers in subdued mode (pin picking) */
  isPinLive: boolean
  /** When true — do not load/show offers (search overlay, signal mode) */
  paused?: boolean
  /** YYYY-MM-DD in Europe/Vilnius — drives which offers appear on the map */
  mapDate: string
  pickupPoint?: LatLng | null
}

function toMapOffer(item: PassengerRideOffer): MatchedPassengerRideOffer {
  return {
    ...item,
    matchScore: 0,
    matchReason: null,
    match: { pickupDistanceKm: 0, dropoffDistanceKm: 0, timeDeltaMinutes: null },
  }
}

export function usePassengerRideOffersOnMap(options: UsePassengerRideOffersOnMapOptions) {
  const { paused = false, mapDate, pickupPoint } = options
  const { t } = useTranslation()
  const navigate = useNavigate()

  const [offers, setOffers] = useState<MatchedPassengerRideOffer[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selectedOfferId, setSelectedOfferId] = useState<string | null>(null)
  const [confirmOfferId, setConfirmOfferId] = useState<string | null>(null)
  const [bookingOfferId, setBookingOfferId] = useState<string | null>(null)
  const [bookError, setBookError] = useState<string | null>(null)

  const pausedRef = useRef(paused)
  pausedRef.current = paused
  const pickupRef = useRef(pickupPoint)
  pickupRef.current = pickupPoint
  const mapDateRef = useRef(mapDate)
  mapDateRef.current = mapDate

  const loadOffers = useCallback(async () => {
    if (pausedRef.current) return

    const pickup = pickupRef.current
    const date = mapDateRef.current

    const listParams: {
      limit: number
      offset: number
      date: string
      fromLat?: number
      fromLng?: number
      radiusKm?: number
    } = { limit: PAGE_LIMIT, offset: 0, date }
    if (pickup) {
      listParams.fromLat = pickup.lat
      listParams.fromLng = pickup.lng
      listParams.radiusKm = GEO_RADIUS_KM
    }

    const page = await listRideOffers(listParams)
    setOffers(page.items.filter(isOfferVisibleToPassenger).map(toMapOffer))
  }, [])

  const refresh = useCallback(async () => {
    if (pausedRef.current) return
    try {
      await loadOffers()
      setLoadError(null)
    } catch (error) {
      console.warn('[usePassengerRideOffersOnMap] failed to load offers', error)
      setLoadError(error instanceof Error ? error.message : t('common.error', { defaultValue: 'Error' }))
      setOffers([])
    }
  }, [loadOffers, t])

  useEffect(() => {
    if (paused) {
      setSelectedOfferId(null)
      setConfirmOfferId(null)
      setBookError(null)
      return
    }

    let cancelled = false
    const timeoutId = window.setTimeout(() => {
      void (async () => {
        setIsLoading(true)
        try {
          await loadOffers()
          if (!cancelled) setLoadError(null)
        } catch (error) {
          if (!cancelled) {
            console.warn('[usePassengerRideOffersOnMap] failed to load offers', error)
            setLoadError(error instanceof Error ? error.message : t('common.error', { defaultValue: 'Error' }))
            setOffers([])
          }
        } finally {
          if (!cancelled) setIsLoading(false)
        }
      })()
    }, DEBOUNCE_MS)

    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [paused, pickupPoint, mapDate, loadOffers, t])

  useEffect(() => {
    if (paused) return
    const intervalId = window.setInterval(() => {
      void refresh()
    }, POLL_INTERVAL_MS)
    return () => window.clearInterval(intervalId)
  }, [paused, refresh])

  useEffect(() => {
    if (paused) return
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void refresh()
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [paused, refresh])

  const selectedOffer = useMemo(
    () => offers.find((offer) => offer.id === selectedOfferId) ?? null,
    [offers, selectedOfferId],
  )

  const selectOffer = useCallback((id: string) => {
    hapticSelection()
    setSelectedOfferId(id)
    setConfirmOfferId(null)
    setBookError(null)
  }, [])

  const clearSelection = useCallback(() => {
    setSelectedOfferId(null)
    setConfirmOfferId(null)
    setBookError(null)
  }, [])

  const startBookConfirm = useCallback((id: string) => {
    setConfirmOfferId(id)
    setBookError(null)
  }, [])

  const cancelBookConfirm = useCallback(() => {
    setConfirmOfferId(null)
  }, [])

  const bookSelectedOffer = useCallback(async () => {
    const offerId = selectedOfferId
    if (!offerId || bookingOfferId) return

    setBookingOfferId(offerId)
    setBookError(null)
    try {
      const request = await bookRideOffer(offerId)
      hapticNotification('success')
      setConfirmOfferId(null)
      await refresh()
      navigate(`/requests/${request.id}`)
    } catch (error) {
      hapticNotification('error')
      const conflict = parseOfferBookingConflict(error)
      if (conflict === 'already_booked') {
        setBookError(t('passenger.offers.alreadyBooked', { defaultValue: 'You have already booked this ride' }))
        setConfirmOfferId(null)
        void refresh()
      } else if (conflict === 'offer_full') {
        setBookError(t('passenger.offers.full', { defaultValue: 'No seats left' }))
        setConfirmOfferId(null)
        void refresh()
      } else if (error instanceof ApiError && error.status === 409) {
        setBookError(t('passenger.offers.full', { defaultValue: 'No seats left' }))
        setConfirmOfferId(null)
        void refresh()
      } else if (parseApiErrorCode(error) === 'blocked') {
        setBookError(t('errors.blocked', { defaultValue: 'This action is not available because of a block' }))
      } else if (error instanceof ApiError && error.status === 400) {
        try {
          const parsed = JSON.parse(error.body) as { detail?: { code?: string } }
          if (parsed.detail && typeof parsed.detail === 'object' && parsed.detail.code === 'insufficient_points') {
            setBookError(t('passenger.insufficientPoints', { defaultValue: 'Not enough points. Top up in Profile.' }))
          } else {
            setBookError(error.message)
          }
        } catch {
          setBookError(error.message)
        }
      } else {
        setBookError(error instanceof Error ? error.message : t('common.error', { defaultValue: 'Error' }))
      }
    } finally {
      setBookingOfferId(null)
    }
  }, [bookingOfferId, navigate, refresh, selectedOfferId, t])

  return {
    offers,
    isLoading,
    loadError,
    selectedOfferId,
    isSheetOpen: selectedOfferId !== null,
    confirmOfferId,
    bookingOfferId,
    bookError,
    selectedOffer,
    selectOffer,
    clearSelection,
    startBookConfirm,
    cancelBookConfirm,
    bookSelectedOffer,
    refresh,
  }
}
