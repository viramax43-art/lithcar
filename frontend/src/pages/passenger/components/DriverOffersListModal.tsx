import { Car, Clock, Coins, X } from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'
import RatingBadge from '../../../components/RatingBadge'
import MatchScoreChip, { showMatchUi } from '../../../components/MatchScoreChip'
import { formatRideDate, formatRideTime } from '../../../i18n/dateTime'
import { offerSeatsBooked } from '../../../lib/offerSeats'
import { getPassengerMatchButtonLabel } from '../../../lib/matchUi'
import { hapticSelection } from '../../../lib/telegram'
import { useEscapeClose } from '../../../lib/useEscapeClose'
import type { MatchedPassengerRideOffer } from '../../../types'

interface DriverOffersListModalProps {
  offers: MatchedPassengerRideOffer[]
  open: boolean
  title: string
  hint: string
  onClose: () => void
  onSelect: (offer: MatchedPassengerRideOffer) => void
}

export default function DriverOffersListModal({
  offers,
  open,
  title,
  hint,
  onClose,
  onSelect,
}: DriverOffersListModalProps) {
  const { t } = useTranslation()
  useEscapeClose(open, onClose)

  if (!open || offers.length === 0) return null

  return (
    <>
      <div className="fixed inset-0 z-[500] bg-black/40" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 z-[510] flex justify-center pointer-events-none">
        <div
          className="pointer-events-auto w-full max-w-lg bg-white rounded-t-3xl overflow-hidden animate-slide-up relative"
          style={{
            maxHeight: 'calc(85dvh - var(--app-user-safe-bottom))',
            boxShadow: '0 -8px 32px rgba(0,0,0,0.12)',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            className="absolute top-3 right-4 z-20 w-10 h-10 rounded-2xl bg-white/95 border border-border shadow-card flex items-center justify-center hover:bg-surface active:bg-border/40 transition-colors"
            aria-label={t('common.close', { defaultValue: 'Close' })}
          >
            <X size={16} weight="bold" className="text-muted" />
          </button>

          <div
            className="overflow-y-auto overscroll-y-contain"
            style={{
              maxHeight: 'calc(85dvh - var(--app-user-safe-bottom))',
              paddingBottom: 'calc(1rem + var(--app-user-safe-bottom))',
            }}
          >
            <div className="flex justify-center pt-3">
              <div className="w-9 h-1 rounded-full bg-border" />
            </div>

            <div className="px-5 pt-3 pb-4 space-y-3">
              <div className="pr-12">
                <p className="text-lg font-extrabold tracking-tight">{title}</p>
                <p className="text-xs text-muted mt-1">{hint}</p>
              </div>

              {offers.map((offer) => {
                const booked = offerSeatsBooked(offer)
                const offerDateStr = formatRideDate(offer, { day: 'numeric', month: 'short' })
                const offerTimeStr = formatRideTime(offer)
                const matchLabel = getPassengerMatchButtonLabel(offer.matchScore, t)
                const inviteText = t('passenger.offers.driverInvite', {
                  driverName: offer.driver.name,
                  from: offer.from.address,
                  to: offer.to.address,
                  time: `${offerDateStr}, ${offerTimeStr}`,
                  defaultValue: `${offer.driver.name} offers a shared ride from ${offer.from.address} to ${offer.to.address} at ${offerTimeStr}`,
                })

                return (
                  <button
                    key={offer.id}
                    type="button"
                    onClick={() => {
                      hapticSelection()
                      onSelect(offer)
                    }}
                    className="w-full rounded-xl border border-border bg-surface/60 p-3 text-left active:scale-[0.98] transition-transform"
                  >
                    <div className="flex items-start gap-2.5 mb-2.5">
                      <div className="w-9 h-9 rounded-xl bg-black text-white flex items-center justify-center flex-shrink-0">
                        <Car size={18} weight="fill" />
                      </div>
                      <p className="flex-1 text-sm font-semibold leading-snug text-black text-left">{inviteText}</p>
                    </div>

                    <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                      <div className="flex items-center gap-2 min-w-0 flex-wrap">
                        <span className="text-xs font-bold px-3 py-1 rounded-pill bg-white border border-border text-muted">
                          {t('passenger.offers.seatsSummary', {
                            booked,
                            available: offer.seatsAvailable,
                            total: offer.totalSeats,
                            defaultValue: `${booked} taken · ${offer.seatsAvailable} free of ${offer.totalSeats}`,
                          })}
                        </span>
                        {showMatchUi(offer.matchScore) && <MatchScoreChip score={offer.matchScore} />}
                      </div>
                      <span className="flex items-center gap-1 text-xs text-muted flex-shrink-0">
                        <Clock size={12} />
                        {offerDateStr}, {offerTimeStr}
                      </span>
                    </div>

                    <div className="flex items-start gap-2 mb-2">
                      <div className="flex flex-col items-center gap-0.5 pt-1 flex-shrink-0">
                        <div className="w-2 h-2 rounded-full bg-point-a" />
                        <div className="w-px h-4 bg-border" />
                        <div className="w-2 h-2 rounded-full bg-point-b" />
                      </div>
                      <div className="flex-1 min-w-0 space-y-1 text-left">
                        <p className="text-sm font-semibold">{offer.from.address}</p>
                        <p className="text-sm font-semibold">{offer.to.address}</p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 text-left">
                        <p className="text-xs font-bold truncate">{offer.driver.name}</p>
                        <RatingBadge rating={offer.driver.rating} variant="compact" size="sm" />
                      </div>
                      <span className="inline-flex items-center gap-1 text-sm font-bold flex-shrink-0">
                        <Coins size={12} weight="fill" className="text-accent-dark" />
                        {offer.quotedPoints}
                      </span>
                    </div>
                    {matchLabel && (
                      <p className="mt-2 text-xs font-bold text-black text-left">{matchLabel}</p>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
