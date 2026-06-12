import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, Clock, MapPin, Plus } from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'
import Skeleton from '../../../components/Skeleton'
import NotificationBell from '../../../components/notifications/NotificationBell'
import InlineConfirm from '../../admin/components/InlineConfirm'
import { cancelDriverOffer, listDriverOffers } from '../../../lib/backend'
import { formatRideDate, formatRideTime } from '../../../i18n/dateTime'
import { hapticNotification } from '../../../lib/telegram'
import { useEscapeClose } from '../../../lib/useEscapeClose'
import type { DriverRideOffer } from '../../../types'
import { OFFER_STATUS_COLOR } from '../constants'
import DriverOfferForm from './DriverOfferForm'

interface DriverOffersListProps {
  onClose: () => void
}

const PAGE_SIZE = 20

export default function DriverOffersList({ onClose }: DriverOffersListProps) {
  const { t } = useTranslation()
  const [tab, setTab] = useState<'open' | 'all'>('open')
  const [offers, setOffers] = useState<DriverRideOffer[]>([])
  const [total, setTotal] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)

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
                <div className="flex items-start gap-3">
                  <div className="flex flex-col items-center gap-1 pt-1">
                    <div className="w-2.5 h-2.5 rounded-full bg-point-a" />
                    <div className="w-px h-6 bg-border" />
                    <div className="w-2.5 h-2.5 rounded-full bg-point-b" />
                  </div>
                  <div className="flex-1 min-w-0 space-y-2">
                    <p className="text-sm font-semibold truncate">{offer.from.address}</p>
                    <p className="text-sm font-semibold truncate">{offer.to.address}</p>
                    <p className="text-xs text-muted">
                      {t('driver.offers.seatsSummary', {
                        available: offer.seatsAvailable,
                        total: offer.totalSeats,
                        defaultValue: `${offer.seatsAvailable}/${offer.totalSeats} seats`,
                      })}
                      {' · '}
                      {t('driver.offers.bookingsCount', {
                        count: offer.bookingsCount,
                        defaultValue: `${offer.bookingsCount} bookings`,
                      })}
                    </p>
                  </div>
                </div>
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
