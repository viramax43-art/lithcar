import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, CaretDown, Clock, MapPin, Plus } from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'
import Skeleton from '../../../components/Skeleton'
import NotificationBell from '../../../components/notifications/NotificationBell'
import CabinetRoleBanner from '../../../components/CabinetRoleBanner'
import RatingBadge from '../../../components/RatingBadge'
import MatchScoreChip, { showMatchUi } from '../../../components/MatchScoreChip'
import InlineConfirm from '../../admin/components/InlineConfirm'
import { cancelDriverOffer, claimDriverRide, listDriverOffers, listOfferMatchingRequests, parseApiErrorCode } from '../../../lib/backend'
import { formatRideDate, formatRideTime } from '../../../i18n/dateTime'
import { offerSeatsBooked } from '../../../lib/offerSeats'
import { getDriverMatchClaimLabel } from '../../../lib/matchUi'
import { hapticNotification, openExternalLink } from '../../../lib/telegram'
import { useEscapeClose } from '../../../lib/useEscapeClose'
import type { DriverRideOffer, MatchedRideRequest } from '../../../types'
import { OFFER_STATUS_COLOR } from '../constants'
import DriverOfferForm from './DriverOfferForm'

interface DriverOffersListProps {
  onClose: () => void
}

const PAGE_SIZE = 20

function formatVehicleLabel(brand?: string, model?: string): string {
  const effectiveBrand = brand === 'Unknown' ? undefined : brand
  return [effectiveBrand, model].filter(Boolean).join(' ').trim() || model || '—'
}

export default function DriverOffersList({ onClose }: DriverOffersListProps) {
  const { t } = useTranslation()
  const [tab, setTab] = useState<'open' | 'all'>('open')
  const [offers, setOffers] = useState<DriverRideOffer[]>([])
  const [total, setTotal] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [expandedOfferId, setExpandedOfferId] = useState<string | null>(null)
  const [matchingByOffer, setMatchingByOffer] = useState<Record<string, MatchedRideRequest[]>>({})
  const [matchingLoadingId, setMatchingLoadingId] = useState<string | null>(null)
  const [claimingRequestId, setClaimingRequestId] = useState<string | null>(null)
  const [matchCountsByOffer, setMatchCountsByOffer] = useState<Record<string, number>>({})
  const autoExpandDoneRef = useRef(false)

  useEscapeClose(!showForm, onClose)

  const loadOffers = useCallback(async () => {
    setIsLoading(true)
    setErrorMessage(null)
    try {
      const page = await listDriverOffers({
        limit: PAGE_SIZE,
        offset: 0,
        status: tab === 'open' ? 'open' : 'all',
      })
      setOffers(page.items)
      setTotal(page.total)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t('common.error', { defaultValue: 'Error' }))
    } finally {
      setIsLoading(false)
    }
  }, [tab, t])

  useEffect(() => {
    void loadOffers()
  }, [loadOffers])

  useEffect(() => {
    autoExpandDoneRef.current = false
    setMatchCountsByOffer({})
  }, [tab])

  useEffect(() => {
    if (isLoading || tab !== 'open') return
    const openOffers = offers.filter((o) => o.status === 'open').slice(0, 10)
    if (openOffers.length === 0) return

    let cancelled = false
    const timeoutId = window.setTimeout(async () => {
      try {
        const entries = await Promise.all(
          openOffers.map(async (offer) => {
            const page = await listOfferMatchingRequests(offer.id, { limit: 10, minScore: 60 })
            return [offer.id, page.total] as const
          }),
        )
        if (!cancelled) {
          setMatchCountsByOffer(Object.fromEntries(entries))
        }
      } catch {
        /* badge optional */
      }
    }, 300)

    return () => {
      cancelled = true
      clearTimeout(timeoutId)
    }
  }, [offers, isLoading, tab])

  const expandMatching = useCallback(async (offer: DriverRideOffer) => {
    setExpandedOfferId(offer.id)
    if (matchingByOffer[offer.id]) return
    setMatchingLoadingId(offer.id)
    try {
      const page = await listOfferMatchingRequests(offer.id, { limit: 10, minScore: 60 })
      setMatchingByOffer((prev) => ({ ...prev, [offer.id]: page.items }))
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t('common.error', { defaultValue: 'Error' }))
    } finally {
      setMatchingLoadingId(null)
    }
  }, [matchingByOffer, t])

  useEffect(() => {
    if (autoExpandDoneRef.current || expandedOfferId != null) return
    const firstWithMatches = offers.find(
      (o) => o.status === 'open' && (matchCountsByOffer[o.id] ?? 0) > 0,
    )
    if (!firstWithMatches) return
    autoExpandDoneRef.current = true
    void expandMatching(firstWithMatches)
  }, [matchCountsByOffer, offers, expandedOfferId, expandMatching])

  const handleCancel = async (id: string) => {
    try {
      await cancelDriverOffer(id)
      hapticNotification('success')
      await loadOffers()
    } catch (error) {
      hapticNotification('error')
      setErrorMessage(error instanceof Error ? error.message : t('common.error', { defaultValue: 'Error' }))
    }
  }

  const toggleMatching = async (offer: DriverRideOffer) => {
    if (expandedOfferId === offer.id) {
      setExpandedOfferId(null)
      return
    }
    await expandMatching(offer)
  }

  const handleClaimRequest = async (offerId: string, requestId: string) => {
    setClaimingRequestId(requestId)
    setErrorMessage(null)
    try {
      await claimDriverRide(requestId, { offerId })
      hapticNotification('success')
      await loadOffers()
      const page = await listOfferMatchingRequests(offerId, { limit: 10, minScore: 60 })
      setMatchingByOffer((prev) => ({ ...prev, [offerId]: page.items }))
    } catch (error) {
      hapticNotification('error')
      if (parseApiErrorCode(error) === 'blocked') {
        setErrorMessage(t('errors.blocked', { defaultValue: 'This action is not available because of a block' }))
      } else {
        setErrorMessage(error instanceof Error ? error.message : t('common.error', { defaultValue: 'Error' }))
      }
    } finally {
      setClaimingRequestId(null)
    }
  }

  if (showForm) {
    return (
      <DriverOfferForm
        onClose={() => setShowForm(false)}
        onCreated={() => void loadOffers()}
      />
    )
  }

  return (
    <div className="fixed inset-0 z-[200] bg-white flex flex-col animate-slide-in-right">
      <header
        className="flex-shrink-0 bg-white border-b border-border/50"
        style={{ paddingTop: 'var(--app-safe-area-top-total)' }}
      >
        <CabinetRoleBanner variant="inline" />
        <div className="flex items-center gap-3 px-3 h-14 w-full max-w-2xl mx-auto">
          <button
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-surface transition-colors flex-shrink-0"
          >
            <ArrowLeft size={20} weight="bold" />
          </button>
          <h1 className="text-base font-extrabold tracking-tight flex-1">
            {t('driver.offers.title', { defaultValue: 'My offers' })}
          </h1>
          <button
            onClick={() => setShowForm(true)}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-black text-white active:scale-95 flex-shrink-0"
          >
            <Plus size={18} weight="bold" />
          </button>
          <NotificationBell pool="driver" />
        </div>
        <div className="flex items-center gap-1 px-5 pb-3 overflow-x-auto w-full max-w-2xl mx-auto">
          {(['open', 'all'] as const).map((key) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-3 py-1.5 rounded-pill text-xs font-semibold whitespace-nowrap transition-colors ${
                tab === key ? 'bg-black text-white' : 'bg-surface text-muted'
              }`}
            >
              {key === 'open' ? t('status.offer.open', { defaultValue: 'Open' }) : t('common.all', { defaultValue: 'All' })}
            </button>
          ))}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto" style={{ paddingBottom: 'var(--app-safe-area-bottom-total)' }}>
        <div className="flex flex-col w-full max-w-2xl mx-auto">
        {errorMessage && <p className="px-5 py-3 text-xs font-medium text-red-600">{errorMessage}</p>}
        {isLoading &&
          [0, 1, 2].map((index) => (
            <div key={index} className="px-5 py-4 border-b border-surface space-y-2">
              <Skeleton width={80} height={20} rounded="pill" />
              <Skeleton width="90%" height={14} />
              <Skeleton width="70%" height={14} />
            </div>
          ))}
        {!isLoading && offers.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
            <MapPin size={48} className="text-border mb-4" weight="regular" />
            <p className="text-muted text-sm mb-4">{t('driver.offers.empty', { defaultValue: 'No offers yet' })}</p>
            <button
              onClick={() => setShowForm(true)}
              className="mt-4 px-6 py-2.5 bg-black text-white text-sm font-bold rounded-pill"
            >
              {t('driver.offers.create', { defaultValue: 'New offer' })}
            </button>
          </div>
        )}
        {!isLoading &&
          offers.map((offer) => {
            const status = OFFER_STATUS_COLOR[offer.status]
            const dateStr = formatRideDate(offer, { day: 'numeric', month: 'short' })
            const timeStr = formatRideTime(offer)
            const canCancel = offer.status === 'open' || offer.status === 'full'
            const booked = offerSeatsBooked(offer)
            const isExpanded = expandedOfferId === offer.id
            const matching = matchingByOffer[offer.id] ?? []
            const canExpandMatching = offer.status === 'open'
            const matchCount = matchCountsByOffer[offer.id]
            const vehicleLabel = formatVehicleLabel(offer.carBrand, offer.carModel)
            return (
              <div key={offer.id} className="px-5 py-4 border-b border-surface">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span
                    className="text-xs font-bold px-3 py-1 rounded-pill"
                    style={{ color: status.color, background: status.bg }}
                  >
                    {t(`status.offer.${offer.status}`, { defaultValue: offer.status })}
                  </span>
                  <span className="flex items-center gap-1 text-xs text-muted">
                    <Clock size={12} />
                    {dateStr}, {timeStr}
                  </span>
                </div>
                {vehicleLabel !== '—' && (
                  <p className="text-sm font-bold truncate mb-2">{vehicleLabel}</p>
                )}
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  <span className="text-xs font-bold px-3 py-1 rounded-pill bg-surface text-muted">
                    {t('driver.offers.seatsSummary', {
                      booked,
                      available: offer.seatsAvailable,
                      total: offer.totalSeats,
                      defaultValue: `${booked} taken · ${offer.seatsAvailable} free of ${offer.totalSeats}`,
                    })}
                  </span>
                  {matchCount != null && matchCount > 0 && (
                    <span className="text-xs font-bold px-3 py-1 rounded-pill bg-accent/15 text-accent-dark">
                      {matchCount >= 10
                        ? t('driver.offers.matchCountMany', { defaultValue: '10+ matches' })
                        : t('driver.offers.matchCount', { count: matchCount, defaultValue: `${matchCount} matches` })}
                    </span>
                  )}
                  <span className="text-xs text-muted ml-auto">
                    {t('driver.offers.bookingsCount', {
                      count: offer.bookingsCount,
                      defaultValue: `${offer.bookingsCount} bookings`,
                    })}
                  </span>
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
                  {canExpandMatching && (
                    <button
                      type="button"
                      onClick={() => void toggleMatching(offer)}
                      className="w-11 h-11 flex items-center justify-center rounded-xl bg-surface hover:bg-border/40 active:scale-[0.97] transition-colors flex-shrink-0"
                      aria-expanded={isExpanded}
                      aria-label={t('driver.offers.matchingRequests', { defaultValue: 'Matching requests' })}
                    >
                      <CaretDown
                        size={16}
                        weight="bold"
                        className={`text-muted transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                      />
                    </button>
                  )}
                </div>

                {isExpanded && canExpandMatching && (
                  <div className="mt-3 rounded-xl bg-surface/70 p-3 space-y-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted">
                      {t('driver.offers.matchingRequests', { defaultValue: 'Matching requests' })}
                    </p>
                    {matchingLoadingId === offer.id && (
                      <p className="text-xs text-muted">{t('common.loading', { defaultValue: 'Loading…' })}</p>
                    )}
                    {matchingLoadingId !== offer.id && matching.length === 0 && (
                      <p className="text-xs text-muted">{t('driver.offers.noMatchingRequests', { defaultValue: 'No matching requests yet' })}</p>
                    )}
                    {matching.map((request) => {
                      const reqDate = formatRideDate(request, { day: 'numeric', month: 'short' })
                      const reqTime = formatRideTime(request)
                      const openTelegram = () => {
                        const username = request.passengerTelegramUsername
                        if (!username) return
                        openExternalLink(`https://t.me/${username.replace(/^@/, '')}`)
                      }
                      return (
                        <div key={request.id} className="rounded-xl bg-white border border-border p-3 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm font-bold truncate">{request.passengerName}</p>
                              <RatingBadge
                                rating={request.passengerRating}
                                ratingCount={request.passengerRatingCount}
                              />
                            </div>
                            {showMatchUi(request.matchScore) && (
                              <MatchScoreChip score={request.matchScore} namespace="driver" />
                            )}
                          </div>
                          <p className="text-xs text-muted truncate">{request.from.address}</p>
                          <p className="text-xs text-muted truncate">{request.to.address}</p>
                          <p className="text-[10px] text-muted">{reqDate}, {reqTime}</p>
                          <div className="flex gap-2">
                            {request.passengerTelegramUsername && (
                              <button
                                type="button"
                                onClick={openTelegram}
                                className="flex-1 min-h-[44px] py-3 rounded-xl border border-border text-sm font-semibold active:scale-[0.97] transition-transform"
                              >
                                {t('common.writeTelegram', { defaultValue: 'Message' })}
                              </button>
                            )}
                            <button
                              type="button"
                              disabled={claimingRequestId === request.id}
                              onClick={() => void handleClaimRequest(offer.id, request.id)}
                              className="flex-1 min-h-[44px] py-3 rounded-xl bg-black text-white text-sm font-bold disabled:opacity-60 active:scale-[0.97] transition-transform"
                            >
                              {claimingRequestId === request.id
                                ? t('common.loading', { defaultValue: 'Loading…' })
                                : getDriverMatchClaimLabel(request.matchScore, t)
                                  ?? t('driver.offers.claimRequest', { defaultValue: 'Claim request' })}
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                {canCancel && (
                  <div className="mt-3 flex justify-end">
                    <InlineConfirm
                      label={t('driver.offers.cancel', { defaultValue: 'Cancel' })}
                      confirmLabel={t('driver.offers.cancelConfirm', { defaultValue: 'Cancel offer?' })}
                      onConfirm={() => void handleCancel(offer.id)}
                    />
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
