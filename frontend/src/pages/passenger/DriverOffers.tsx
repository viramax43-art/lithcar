import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, CheckCircle, Clock, Coins, MapPin, Star, User } from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'
import Skeleton from '../../components/Skeleton'
import NotificationBell from '../../components/notifications/NotificationBell'
import LithuanianPlate from '../../components/LithuanianPlate'
import { bookRideOffer, listMatchingRideOffers, listRideOffers } from '../../lib/backend'
import { parseOfferBookingConflict } from '../../lib/offerBooking'
import { offerSeatsBooked } from '../../lib/offerSeats'
import { getPassengerMatchButtonLabel } from '../../lib/matchUi'
import { hasRideDateTime, rideDateFromDateTime } from '../../lib/rideDraft'
import { openExternalLink } from '../../lib/telegram'
import MatchScoreChip, { showMatchUi } from '../../components/MatchScoreChip'
import { ApiError, parseApiErrorCode } from '../../infrastructure/http/httpClient'
import { formatRideDate, formatRideTime } from '../../i18n/dateTime'
import { hapticNotification } from '../../lib/telegram'
import type { LatLng, PassengerRideOffer } from '../../types'

const PAGE_SIZE = 20
const DRAFT_KEY = 'ride_new_request_draft'

function loadDraftGeofilter(): {
  fromPoint: LatLng | null
  toPoint: LatLng | null
  dateTime: string | null
} {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY)
    if (!raw) return { fromPoint: null, toPoint: null, dateTime: null }
    const parsed = JSON.parse(raw) as {
      fromPoint?: LatLng | null
      toPoint?: LatLng | null
      dateTime?: string
    }
    return {
      fromPoint: parsed.fromPoint ?? null,
      toPoint: parsed.toPoint ?? null,
      dateTime: parsed.dateTime ?? null,
    }
  } catch {
    return { fromPoint: null, toPoint: null, dateTime: null }
  }
}

export default function DriverOffers() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [offers, setOffers] = useState<PassengerRideOffer[]>([])
  const [matchScores, setMatchScores] = useState<Record<string, number>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [bookingId, setBookingId] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)

  const loadOffers = useCallback(async () => {
    const draft = loadDraftGeofilter()
    const listParams: {
      limit: number
      offset: number
      fromLat?: number
      fromLng?: number
      radiusKm?: number
      date?: string
    } = { limit: PAGE_SIZE, offset: 0 }
    if (draft.fromPoint) {
      listParams.fromLat = draft.fromPoint.lat
      listParams.fromLng = draft.fromPoint.lng
      listParams.radiusKm = 2
    }
    const rideDate = rideDateFromDateTime(draft.dateTime)
    if (rideDate) listParams.date = rideDate
    const page = await listRideOffers(listParams)
    setOffers(page.items)

    if (draft.fromPoint && draft.toPoint && hasRideDateTime(draft.dateTime)) {
      try {
        const matches = await listMatchingRideOffers({
          fromLat: draft.fromPoint.lat,
          fromLng: draft.fromPoint.lng,
          toLat: draft.toPoint.lat,
          toLng: draft.toPoint.lng,
          dateTime: draft.dateTime || undefined,
          limit: PAGE_SIZE,
          minScore: 60,
          radiusKm: 2,
        })
        const scores: Record<string, number> = {}
        for (const item of matches.items) {
          scores[item.id] = item.matchScore
        }
        setMatchScores(scores)
      } catch {
        setMatchScores({})
      }
    } else {
      setMatchScores({})
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setIsLoading(true)
      setErrorMessage(null)
      try {
        await loadOffers()
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : t('common.error', { defaultValue: 'Error' }))
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [loadOffers, t])

  const reloadOffers = useCallback(async () => {
    await loadOffers()
  }, [loadOffers])

  const handleBook = useCallback(
    async (offer: PassengerRideOffer) => {
      if (bookingId || offer.bookedByMe) return
      setBookingId(offer.id)
      setErrorMessage(null)
      try {
        const request = await bookRideOffer(offer.id)
        hapticNotification('success')
        navigate(`/requests/${request.id}`)
      } catch (error) {
        hapticNotification('error')
        const conflict = parseOfferBookingConflict(error)
        if (conflict === 'already_booked') {
          setErrorMessage(t('passenger.offers.alreadyBooked', { defaultValue: 'You have already booked this ride' }))
          void reloadOffers()
        } else if (conflict === 'offer_full' || (error instanceof ApiError && error.status === 409)) {
          setErrorMessage(t('passenger.offers.full', { defaultValue: 'No seats left' }))
          void reloadOffers()
        } else if (parseApiErrorCode(error) === 'blocked') {
          setErrorMessage(t('errors.blocked', { defaultValue: 'This action is not available because of a block' }))
        } else if (error instanceof ApiError && error.status === 400) {
          try {
            const parsed = JSON.parse(error.body) as { detail?: { code?: string } }
            if (parsed.detail && typeof parsed.detail === 'object' && parsed.detail.code === 'insufficient_points') {
              setErrorMessage(t('passenger.insufficientPoints', { defaultValue: 'Not enough points. Top up in Profile.' }))
            } else {
              setErrorMessage(error.message)
            }
          } catch {
            setErrorMessage(error.message)
          }
        } else {
          setErrorMessage(error instanceof Error ? error.message : t('common.error', { defaultValue: 'Error' }))
        }
      } finally {
        setBookingId(null)
        setConfirmId(null)
      }
    },
    [bookingId, navigate, reloadOffers, t],
  )

  return (
    <div className="fixed inset-0 z-[200] bg-white flex flex-col animate-slide-in-right">
      <header
        className="flex-shrink-0 bg-white border-b border-border/50"
        style={{ paddingTop: 'var(--app-user-safe-top)' }}
      >
        <div className="flex items-center gap-3 px-3 h-14 w-full max-w-2xl mx-auto">
            <button
              onClick={() => navigate(-1)}
              className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-surface transition-colors flex-shrink-0"
            >
            <ArrowLeft size={20} weight="bold" />
          </button>
          <h1 className="text-base font-extrabold tracking-tight flex-1">
            {t('passenger.offers.title', { defaultValue: 'Driver rides' })}
          </h1>
          <NotificationBell pool="passenger" />
        </div>
      </header>

      <div className="flex-1 overflow-y-auto" style={{ paddingBottom: 'var(--app-user-safe-bottom)' }}>
        <div className="w-full max-w-2xl mx-auto">
          {errorMessage && <p className="px-5 py-3 text-xs font-medium text-red-600">{errorMessage}</p>}
          {isLoading &&
            [0, 1, 2].map((index) => (
              <div key={index} className="px-5 py-4 border-b border-surface space-y-2">
                <Skeleton width={120} height={20} rounded="pill" />
                <Skeleton width="90%" height={14} />
              </div>
            ))}
          {!isLoading && offers.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
              <MapPin size={48} className="text-border mb-4" weight="regular" />
              <p className="text-muted text-sm mb-4">
                {t('passenger.offers.empty', { defaultValue: 'No rides available' })}
              </p>
              <button
                onClick={() => navigate('/')}
                className="mt-4 px-6 py-2.5 bg-black text-white text-sm font-bold rounded-pill"
              >
                {t('nav.newRequest', { defaultValue: 'New request' })}
              </button>
            </div>
          )}
          {!isLoading &&
            offers.map((offer) => {
              const dateStr = formatRideDate(offer, { day: 'numeric', month: 'short' })
              const timeStr = formatRideTime(offer)
              const isConfirming = confirmId === offer.id
              const booked = offerSeatsBooked(offer)
              const matchScore = matchScores[offer.id]
              const hasMatch = matchScore != null && showMatchUi(matchScore)
              const matchLabel = matchScore != null ? getPassengerMatchButtonLabel(matchScore, t) : null
              const openTelegram = () => {
                const username = offer.driver.telegramUsername
                if (!username) return
                openExternalLink(`https://t.me/${username.replace(/^@/, '')}`)
              }
              return (
                <div key={offer.id} className="px-5 py-4 border-b border-surface">
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2 min-w-0 flex-wrap">
                      {offer.bookedByMe ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-pill bg-accent/15 text-accent-dark">
                          <CheckCircle size={14} weight="fill" />
                          {t('passenger.offers.alreadyBooked', { defaultValue: 'You have already booked this ride' })}
                        </span>
                      ) : (
                        <span className="text-xs font-bold px-3 py-1 rounded-pill bg-surface text-muted">
                          {t('passenger.offers.seatsSummary', {
                            booked,
                            available: offer.seatsAvailable,
                            total: offer.totalSeats,
                            defaultValue: `${booked} taken · ${offer.seatsAvailable} free of ${offer.totalSeats}`,
                          })}
                        </span>
                      )}
                      {hasMatch && <MatchScoreChip score={matchScore} />}
                    </div>
                    <span className="flex items-center gap-1 text-xs text-muted flex-shrink-0">
                      <Clock size={12} />
                      {dateStr}, {timeStr}
                    </span>
                  </div>

                  <div className="rounded-xl bg-surface/70 p-3 mb-3 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-white border border-border flex items-center justify-center">
                      {offer.driver.photoUrl ? (
                        <img src={offer.driver.photoUrl} alt="" className="w-full h-full object-cover rounded-xl" />
                      ) : (
                        <User size={18} className="text-muted" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold truncate">{offer.driver.name}</p>
                      <p className="text-xs text-muted truncate">{offer.driver.carModel}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <LithuanianPlate value={offer.driver.carPlate} size="sm" />
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-amber-700">
                          <Star size={10} weight="fill" />
                          {offer.driver.rating.toFixed(1)}
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="inline-flex items-center gap-1 text-sm font-bold">
                        <Coins size={14} weight="fill" className="text-accent-dark" />
                        {offer.quotedPoints}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 mb-3">
                    <div className="flex flex-col items-center gap-1 pt-1">
                      <div className="w-2.5 h-2.5 rounded-full bg-point-a" />
                      <div className="w-px h-6 bg-border" />
                      <div className="w-2.5 h-2.5 rounded-full bg-point-b" />
                    </div>
                    <div className="flex-1 min-w-0 space-y-2">
                      <p className="text-sm font-semibold truncate">{offer.from.address}</p>
                      <p className="text-sm font-semibold truncate">{offer.to.address}</p>
                    </div>
                  </div>

                  {offer.bookedByMe && offer.myRequestId ? (
                    <button
                      onClick={() => navigate(`/requests/${offer.myRequestId}`)}
                      className="w-full py-3 rounded-xl bg-black text-white text-sm font-bold active:scale-[0.97] transition-transform"
                    >
                      {t('passenger.offers.viewMyBooking', { defaultValue: 'View my booking' })}
                    </button>
                  ) : isConfirming ? (
                    <div className="flex gap-2">
                      {offer.driver.telegramUsername && (
                        <button
                          onClick={openTelegram}
                          className="flex-1 py-3 rounded-xl border border-border text-sm font-semibold active:scale-[0.97] transition-transform"
                        >
                          {t('common.writeTelegram', { defaultValue: 'Message' })}
                        </button>
                      )}
                      <button
                        onClick={() => setConfirmId(null)}
                        className="flex-1 py-3 rounded-xl border border-border text-sm font-semibold text-muted active:scale-[0.97] transition-transform"
                      >
                        {t('common.cancel', { defaultValue: 'Cancel' })}
                      </button>
                      <button
                        onClick={() => void handleBook(offer)}
                        disabled={bookingId === offer.id}
                        className="flex-1 py-3 rounded-xl bg-black text-white text-sm font-bold disabled:opacity-60 active:scale-[0.97] transition-transform"
                      >
                        {t('passenger.offers.confirmBook', {
                          points: offer.quotedPoints,
                          defaultValue: `Book for ${offer.quotedPoints} pts?`,
                        })}
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      {offer.driver.telegramUsername && (
                        <button
                          onClick={openTelegram}
                          className="flex-1 py-3 rounded-xl border border-border text-sm font-semibold active:scale-[0.97] transition-transform"
                        >
                          {t('common.writeTelegram', { defaultValue: 'Message' })}
                        </button>
                      )}
                      <button
                        onClick={() => setConfirmId(offer.id)}
                        disabled={Boolean(bookingId)}
                        className="flex-1 py-3 rounded-xl bg-black text-white text-sm font-bold disabled:opacity-60 active:scale-[0.97] transition-transform"
                      >
                        {hasMatch && matchLabel
                          ? matchLabel
                          : t('passenger.offers.book', { defaultValue: 'Book seat' })}
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
        </div>
      </div>
    </div>
  )
}
