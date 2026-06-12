import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { bookRideOffer, listRideOffers } from '../../../lib/backend'
import { parseOfferBookingConflict } from '../../../lib/offerBooking'
import { ApiError } from '../../../infrastructure/http/httpClient'
import { isCoarsePointer } from '../../../lib/pointer'
import { hapticNotification, hapticSelection } from '../../../lib/telegram'
import type { PassengerRideOffer } from '../../../types'

const POLL_INTERVAL_MS = 60_000
const PAGE_LIMIT = 50

export interface UsePassengerRideOffersOnMapOptions {
  /** When true — offer markers in subdued mode (pin picking) */
  isPinLive: boolean
  /** When true — do not load/show offers (search overlay, signal mode) */
  paused?: boolean
}

export function usePassengerRideOffersOnMap(options: UsePassengerRideOffersOnMapOptions) {
  const { paused = false } = options
  const { t } = useTranslation()
  const navigate = useNavigate()

  const [offers, setOffers] = useState<PassengerRideOffer[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selectedOfferId, setSelectedOfferId] = useState<string | null>(null)
  const [hoveredOfferId, setHoveredOfferId] = useState<string | null>(null)
  const [confirmOfferId, setConfirmOfferId] = useState<string | null>(null)
  const [bookingOfferId, setBookingOfferId] = useState<string | null>(null)
  const [bookError, setBookError] = useState<string | null>(null)

  const pausedRef = useRef(paused)
  pausedRef.current = paused

  const refresh = useCallback(async () => {
    if (pausedRef.current) return
    try {
      const page = await listRideOffers({ limit: PAGE_LIMIT, offset: 0 })
      setOffers(page.items)
      setLoadError(null)
    } catch (error) {
      console.warn('[usePassengerRideOffersOnMap] failed to load offers', error)
      setLoadError(error instanceof Error ? error.message : t('common.error', { defaultValue: 'Error' }))
      setOffers([])
    }
  }, [t])

  useEffect(() => {
    if (paused) {
      setSelectedOfferId(null)
      setHoveredOfferId(null)
      setConfirmOfferId(null)
      setBookError(null)
      return
    }

    let cancelled = false
    void (async () => {
      setIsLoading(true)
      try {
        const page = await listRideOffers({ limit: PAGE_LIMIT, offset: 0 })
        if (!cancelled) {
          setOffers(page.items)
          setLoadError(null)
        }
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

    return () => {
      cancelled = true
    }
  }, [paused, t])

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

  const highlightedOfferId = selectedOfferId ?? hoveredOfferId

  const highlightedOffer = useMemo(
    () => offers.find((offer) => offer.id === highlightedOfferId) ?? null,
    [offers, highlightedOfferId],
  )

  const selectOffer = useCallback((id: string) => {
    hapticSelection()
    setSelectedOfferId(id)
    setConfirmOfferId(null)
    setBookError(null)
  }, [])

  const clearSelection = useCallback(() => {
    setSelectedOfferId(null)
    setHoveredOfferId(null)
    setConfirmOfferId(null)
    setBookError(null)
  }, [])

  const setHoveredOffer = useCallback((id: string | null) => {
    if (isCoarsePointer) return
    setHoveredOfferId(id)
  }, [])

  const startBookConfirm = useCallback((id: string) => {
    setConfirmOfferId(id)
    setBookError(null)
  }, [])

  const cancelBookConfirm = useCallback(() => {
    setConfirmOfferId(null)
  }, [])

  const bookSelectedOffer = useCallback(async () => {
    const offer = selectedOffer
    if (!offer || bookingOfferId) return

    setBookingOfferId(offer.id)
    setBookError(null)
    try {
      const request = await bookRideOffer(offer.id)
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
  }, [bookingOfferId, navigate, refresh, selectedOffer, t])

  return {
    offers,
    isLoading,
    loadError,
    selectedOfferId,
    hoveredOfferId,
    isSheetOpen: selectedOfferId !== null,
    confirmOfferId,
    bookingOfferId,
    bookError,
    selectedOffer,
    highlightedOfferId,
    highlightedOffer,
    selectOffer,
    clearSelection,
    setHoveredOffer,
    startBookConfirm,
    cancelBookConfirm,
    bookSelectedOffer,
    refresh,
  }
}
