import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Clock, Coins, MapPin, Star, User } from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'
import Skeleton from '../../components/Skeleton'
import NotificationBell from '../../components/notifications/NotificationBell'
import LithuanianPlate from '../../components/LithuanianPlate'
import { bookRideOffer, listRideOffers } from '../../lib/backend'
import { ApiError } from '../../infrastructure/http/httpClient'
import { formatRideDate, formatRideTime } from '../../i18n/dateTime'
import { hapticNotification } from '../../lib/telegram'
import type { PassengerRideOffer } from '../../types'

const PAGE_SIZE = 20

export default function DriverOffers() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [offers, setOffers] = useState<PassengerRideOffer[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [bookingId, setBookingId] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setIsLoading(true)
      setErrorMessage(null)
      try {
        const page = await listRideOffers({ limit: PAGE_SIZE, offset: 0 })
        if (!cancelled) setOffers(page.items)
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
  }, [t])

  const handleBook = useCallback(
    async (offer: PassengerRideOffer) => {
      if (bookingId) return
      setBookingId(offer.id)
      setErrorMessage(null)
      try {
        const request = await bookRideOffer(offer.id)
        hapticNotification('success')
        navigate(`/requests/${request.id}`)
      } catch (error) {
        hapticNotification('error')
        if (error instanceof ApiError && error.status === 409) {
          setErrorMessage(t('passenger.offers.full', { defaultValue: 'No seats left' }))
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
    [bookingId, navigate, t],
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
              return (
                <div key={offer.id} className="px-5 py-4 border-b border-surface">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold px-3 py-1 rounded-pill bg-surface text-muted">
                      {t('passenger.offers.seatsLeft', { count: offer.seatsAvailable, defaultValue: `${offer.seatsAvailable} seats` })}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-muted">
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

                  {isConfirming ? (
                    <div className="flex gap-2">
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
                    <button
                      onClick={() => setConfirmId(offer.id)}
                      disabled={Boolean(bookingId)}
                      className="w-full py-3 rounded-xl bg-black text-white text-sm font-bold disabled:opacity-60 active:scale-[0.97] transition-transform"
                    >
                      {t('passenger.offers.book', { defaultValue: 'Book seat' })}
                    </button>
                  )}
                </div>
              )
            })}
        </div>
      </div>
    </div>
  )
}
