import { CheckCircle, Coins, Star, User, X } from '@phosphor-icons/react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import LithuanianPlate from '../../../components/LithuanianPlate'
import MatchScoreChip, { showMatchUi } from '../../../components/MatchScoreChip'
import { formatRideDate, formatRideTime } from '../../../i18n/dateTime'
import { offerSeatsBooked } from '../../../lib/offerSeats'
import { getPassengerMatchButtonLabel } from '../../../lib/matchUi'
import { openExternalLink } from '../../../lib/telegram'
import { useEscapeClose } from '../../../lib/useEscapeClose'
import type { MatchedPassengerRideOffer } from '../../../types'

interface OfferMapSheetProps {
  offer: MatchedPassengerRideOffer | null
  open: boolean
  isConfirming: boolean
  isBooking: boolean
  errorMessage: string | null
  onClose: () => void
  onBookClick: () => void
  onConfirmBook: () => void
  onCancelConfirm: () => void
}

export default function OfferMapSheet({
  offer,
  open,
  isConfirming,
  isBooking,
  errorMessage,
  onClose,
  onBookClick,
  onConfirmBook,
  onCancelConfirm,
}: OfferMapSheetProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  useEscapeClose(open && !isBooking, onClose)

  if (!open || !offer) return null

  const dateStr = formatRideDate(offer, { day: 'numeric', month: 'short' })
  const timeStr = formatRideTime(offer)
  const isBooked = Boolean(offer.bookedByMe)
  const booked = offerSeatsBooked(offer)
  const telegramUsername = offer.driver.telegramUsername
  const hasMatch = showMatchUi(offer.matchScore)
  const matchLabel = getPassengerMatchButtonLabel(offer.matchScore, t)
  const bookLabel = matchLabel ?? t('passenger.offers.book', { defaultValue: 'Book seat' })

  const openTelegram = () => {
    if (!telegramUsername) return
    openExternalLink(`https://t.me/${telegramUsername.replace(/^@/, '')}`)
  }

  return (
    <>
      <div className="fixed inset-0 z-[640] bg-black/40" onClick={onClose} />
      <div
        className="fixed left-0 right-0 bottom-0 z-[650] bg-white rounded-t-3xl overflow-hidden animate-slide-up md:max-w-lg md:mx-auto md:rounded-t-2xl"
        style={{
          boxShadow: '0 -8px 32px rgba(0,0,0,0.12)',
        }}
      >
        <div className="flex justify-center pt-3">
          <div className="w-9 h-1 rounded-full bg-border" />
        </div>

        <div className="px-5 pt-4 pb-3 flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-lg font-extrabold tracking-tight">
                {t('passenger.offers.map.sheetTitle', { defaultValue: 'Driver ride' })}
              </p>
              {hasMatch && <MatchScoreChip score={offer.matchScore} />}
            </div>
            <p className="text-sm text-muted mt-0.5">
              {dateStr}, {timeStr}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-11 h-11 rounded-2xl bg-surface flex items-center justify-center flex-shrink-0 hover:bg-border/40 active:bg-border/60 transition-colors"
            aria-label={t('common.close', { defaultValue: 'Close' })}
          >
            <X size={16} weight="bold" className="text-muted" />
          </button>
        </div>

        <div
          className="px-5 space-y-3"
          style={{ paddingBottom: 'calc(1.25rem + var(--app-user-safe-bottom))' }}
        >
          {isBooked ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-pill bg-accent/15 text-accent-dark">
              <CheckCircle size={14} weight="fill" />
              {t('passenger.offers.alreadyBooked', { defaultValue: 'You have already booked this ride' })}
            </span>
          ) : (
            <span className="inline-flex text-xs font-bold px-3 py-1 rounded-pill bg-surface text-muted">
              {t('passenger.offers.seatsSummary', {
                booked,
                available: offer.seatsAvailable,
                total: offer.totalSeats,
                defaultValue: `${booked} taken · ${offer.seatsAvailable} free of ${offer.totalSeats}`,
              })}
            </span>
          )}

          <div className="rounded-xl bg-surface/70 p-3 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white border border-border flex items-center justify-center flex-shrink-0 overflow-hidden">
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
            <div className="text-right flex-shrink-0">
              <div className="inline-flex items-center gap-1 text-sm font-bold">
                <Coins size={14} weight="fill" className="text-accent-dark" />
                {offer.quotedPoints}
              </div>
            </div>
          </div>

          <div className="flex items-start gap-3">
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

          {errorMessage && <p className="text-xs font-medium text-red-600">{errorMessage}</p>}

          {isBooked && offer.myRequestId ? (
            <button
              type="button"
              onClick={() => navigate(`/requests/${offer.myRequestId}`)}
              className="w-full py-3 rounded-xl bg-black text-white text-sm font-bold active:scale-[0.97] transition-transform"
            >
              {t('passenger.offers.viewMyBooking', { defaultValue: 'View my booking' })}
            </button>
          ) : isConfirming ? (
            <div className="flex gap-2">
              {telegramUsername && (
                <button
                  type="button"
                  onClick={openTelegram}
                  disabled={isBooking}
                  className="flex-1 py-3 rounded-xl border border-border text-sm font-semibold active:scale-[0.97] transition-transform disabled:opacity-60"
                >
                  {t('common.writeTelegram', { defaultValue: 'Message' })}
                </button>
              )}
              <button
                type="button"
                onClick={onCancelConfirm}
                disabled={isBooking}
                className="flex-1 py-3 rounded-xl border border-border text-sm font-semibold text-muted active:bg-surface active:scale-[0.97] transition-transform disabled:opacity-60"
              >
                {t('common.cancel', { defaultValue: 'Cancel' })}
              </button>
              <button
                type="button"
                onClick={onConfirmBook}
                disabled={isBooking}
                className="flex-1 py-3 rounded-xl bg-black text-white text-sm font-bold disabled:opacity-60 active:scale-[0.97] transition-transform"
              >
                {isBooking
                  ? t('passenger.offers.map.booking', { defaultValue: 'Booking…' })
                  : t('passenger.offers.confirmBook', {
                      points: offer.quotedPoints,
                      defaultValue: `Book for ${offer.quotedPoints} pts?`,
                    })}
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              {telegramUsername && (
                <button
                  type="button"
                  onClick={openTelegram}
                  disabled={isBooking}
                  className="flex-1 py-3 rounded-xl border border-border text-sm font-semibold active:scale-[0.97] transition-transform disabled:opacity-60"
                >
                  {t('common.writeTelegram', { defaultValue: 'Message' })}
                </button>
              )}
              <button
                type="button"
                onClick={onBookClick}
                disabled={isBooking}
                className="flex-1 py-3 rounded-xl bg-black text-white text-sm font-bold disabled:opacity-60 active:scale-[0.97] transition-transform"
              >
                {isBooking
                  ? t('passenger.offers.map.booking', { defaultValue: 'Booking…' })
                  : bookLabel}
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
