import { Car, Clock, Coins, Star, X } from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'
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
      <div
        className="fixed left-0 right-0 bottom-0 z-[510] bg-white rounded-t-3xl overflow-hidden animate-slide-up md:max-w-lg md:mx-auto md:rounded-t-2xl flex flex-col max-h-[min(78dvh,640px)]"
        style={{ boxShadow: '0 -8px 32px rgba(0,0,0,0.12)' }}
      >
        <div className="flex justify-center pt-3 flex-shrink-0">
          <div className="w-9 h-1 rounded-full bg-border" />
        </div>

        <div className="px-5 pt-4 pb-3 flex items-start gap-3 flex-shrink-0">
          <div className="flex-1 min-w-0">
            <p className="text-lg font-extrabold tracking-tight">{title}</p>
            <p className="text-xs text-muted mt-0.5">{hint}</p>
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
          className="flex-1 overflow-y-auto px-5 space-y-3"
          style={{ paddingBottom: 'calc(1.25rem + var(--app-user-safe-bottom))' }}
        >
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
                  <p className="flex-1 text-sm font-semibold leading-snug text-black">{inviteText}</p>
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
                  <div className="flex-1 min-w-0 space-y-1">
                    <p className="text-sm font-semibold truncate">{offer.from.address}</p>
                    <p className="text-sm font-semibold truncate">{offer.to.address}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-bold truncate">{offer.driver.name}</p>
                    <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-amber-700">
                      <Star size={10} weight="fill" />
                      {offer.driver.rating.toFixed(1)}
                    </span>
                  </div>
                  <span className="inline-flex items-center gap-1 text-sm font-bold flex-shrink-0">
                    <Coins size={12} weight="fill" className="text-accent-dark" />
                    {offer.quotedPoints}
                  </span>
                </div>
                {matchLabel && (
                  <p className="mt-2 text-xs font-bold text-black">{matchLabel}</p>
                )}
              </button>
            )
          })}
        </div>
      </div>
    </>
  )
}
