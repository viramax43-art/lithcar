import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { MapContainer, Marker, Polyline } from 'react-leaflet'
import LocalizedTileLayer from '../../components/LocalizedTileLayer'
import L from 'leaflet'
import { ArrowLeft, Car, Check, MapPin, Calendar, Clock, NavigationArrow, Star, Users, Warning } from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'
import type { RideRequest } from '../../types'
import Skeleton from '../../components/Skeleton'
import NotificationBell from '../../components/notifications/NotificationBell'
import StarRatingInput from '../../components/StarRatingInput'
import RatingBadge from '../../components/RatingBadge'
import { confirmPickup, deleteRequest, getRequestById, rateRideAsPassenger, updateRequest, blockUser } from '../../lib/backend'
import InlineConfirm from '../admin/components/InlineConfirm'
import LithuanianPlate from '../../components/LithuanianPlate'
import { showOnMapHref } from '../../lib/navigation'
import { formatRideDate, formatRideTime } from '../../i18n/dateTime'
import EditRequestSheet from './components/EditRequestSheet'
import { useEscapeClose } from '../../lib/useEscapeClose'

const STATUS_COLOR_MAP: Record<string, { color: string; bg: string }> = {
  pending: { color: '#F59E0B', bg: 'rgba(245,158,11,0.1)' },
  grouped: { color: '#8B5CF6', bg: 'rgba(139,92,246,0.1)' },
  assigned: { color: '#22C55E', bg: 'rgba(34,197,94,0.1)' },
  en_route_to_pickup: { color: '#0EA5E9', bg: 'rgba(14,165,233,0.1)' },
  awaiting_passenger: { color: '#F97316', bg: 'rgba(249,115,22,0.1)' },
  in_progress: { color: '#3B82F6', bg: 'rgba(59,130,246,0.1)' },
  completed: { color: '#858585', bg: 'rgba(133,133,133,0.1)' },
}

const REQUEST_POLL_MS = 10_000

const iconA = L.divIcon({ className: '', html: '<div class="marker-a">A</div>', iconSize: [36, 36], iconAnchor: [18, 18] })
const iconB = L.divIcon({ className: '', html: '<div class="marker-b">B</div>', iconSize: [36, 36], iconAnchor: [18, 18] })
const iconDriver = L.divIcon({ className: '', html: '<div class="marker-driver"></div>', iconSize: [24, 24], iconAnchor: [12, 12] })

export default function RequestDetail() {
  const { t } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [request, setRequest] = useState<RideRequest | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  useEscapeClose(showDeleteConfirm && !isDeleting, () => setShowDeleteConfirm(false))
  const [isConfirmingPickup, setIsConfirmingPickup] = useState(false)
  const [ratingScore, setRatingScore] = useState(0)
  const [ratingComment, setRatingComment] = useState('')
  const [isRatingSubmitting, setIsRatingSubmitting] = useState(false)
  const [isBlockingDriver, setIsBlockingDriver] = useState(false)
  const [driverBlocked, setDriverBlocked] = useState(false)
  const [isSignalMode, setIsSignalMode] = useState(false)
  const [showEditSheet, setShowEditSheet] = useState(false)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const requestData = await getRequestById(id)
        if (!cancelled) setRequest(requestData)
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(
            error instanceof Error ? error.message : t('errors.loadRequestFailed', { defaultValue: 'Failed to load request.' }),
          )
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [id, t])

  // Live polling while ride is active.
  useEffect(() => {
    if (!id || !request) return
    if (request.status === 'completed') return
    const timer = window.setInterval(() => {
      void (async () => {
        try {
          const fresh = await getRequestById(id)
          setRequest(fresh)
        } catch {
          // ignore transient polling errors
        }
      })()
    }, REQUEST_POLL_MS)
    return () => window.clearInterval(timer)
  }, [id, request?.status])

  if (loading) {
    return (
      <div className="min-h-[100dvh] bg-white">
        <header
          className="sticky top-0 z-20 bg-white/90 backdrop-blur-md border-b border-border/50"
          style={{ paddingTop: 'var(--app-user-safe-top)' }}
        >
          <div className="flex items-center gap-3 px-4 h-14">
            <button onClick={() => navigate(-1)} className="p-1">
              <ArrowLeft size={22} weight="bold" />
            </button>
            <Skeleton width={140} height={16} />
          </div>
        </header>
        <Skeleton width="100%" height={256} rounded="sm" />
        <div className="px-5 py-5 space-y-5">
          <div className="bg-surface rounded-card p-4 space-y-3">
            <Skeleton width="70%" height={14} />
            <Skeleton width="55%" height={14} />
          </div>
          <div className="bg-surface rounded-card p-4 space-y-3">
            <Skeleton width={120} height={12} />
            <Skeleton width={90} height={12} />
          </div>
          <div className="bg-surface rounded-card p-6 space-y-3">
            <Skeleton width="50%" height={14} />
            <Skeleton width="80%" height={12} />
          </div>
        </div>
      </div>
    )
  }

  if (!request) {
    return (
      <div className="flex items-center justify-center h-[100dvh]">
        <p className="text-muted">{errorMessage || t('errors.requestNotFound', { defaultValue: 'Request not found.' })}</p>
      </div>
    )
  }

  const driver = request.assignedDriver ?? null
  const hasAssignedDriverStatus = ['assigned', 'en_route_to_pickup', 'awaiting_passenger', 'in_progress', 'completed'].includes(
    request.status,
  )
  const shouldShowAssignedFallback = Boolean(request.driverId) || hasAssignedDriverStatus
  const status = STATUS_COLOR_MAP[request.status] || STATUS_COLOR_MAP.pending
  const dateStr = formatRideDate(request, { day: 'numeric', month: 'long', year: 'numeric' })
  const timeStr = formatRideTime(request)

  const center: [number, number] = [
    (request.from.latlng.lat + request.to.latlng.lat) / 2,
    (request.from.latlng.lng + request.to.latlng.lng) / 2,
  ]

  const bounds = L.latLngBounds(
    [request.from.latlng.lat, request.from.latlng.lng],
    [request.to.latlng.lat, request.to.latlng.lng]
  )

  const canUseSignalMode = Boolean(driver) && request.status !== 'completed'

  return (
    <div className="min-h-[100dvh] bg-white">
      {/* Header */}
      <header
        className="sticky top-0 z-20 bg-white/90 backdrop-blur-md border-b border-border/50"
        style={{ paddingTop: 'var(--app-user-safe-top)' }}
      >
        <div className="flex items-center gap-3 px-3 h-14 w-full max-w-2xl mx-auto">
          <button
            onClick={() => navigate(-1)}
            className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-surface transition-colors flex-shrink-0"
          >
            <ArrowLeft size={20} weight="bold" />
          </button>
          <h1 className="text-base font-bold flex-1 min-w-0 truncate">
            {t('passenger.requestTitle', { number: request.rideNumber, defaultValue: `Request #${request.rideNumber}` })}
          </h1>
          <span
            className="text-xs font-bold px-3 py-1 rounded-pill whitespace-nowrap flex-shrink-0"
            style={{ color: status.color, background: status.bg }}
          >
            {t(`status.${request.status}`, { defaultValue: request.status })}
          </span>
          <NotificationBell pool="passenger" />
        </div>
      </header>

      {/* Map */}
      <div className="h-64 md:h-80 lg:h-96 w-full">
        <MapContainer
          center={center}
          zoom={12}
          bounds={bounds}
          boundsOptions={{ padding: [40, 40] }}
          style={{ width: '100%', height: '100%' }}
          zoomControl={false}
          attributionControl={false}
        >
          <LocalizedTileLayer />

          <Marker position={[request.from.latlng.lat, request.from.latlng.lng]} icon={iconA} />
          <Marker position={[request.to.latlng.lat, request.to.latlng.lng]} icon={iconB} />

          <Polyline
            positions={[
              [request.from.latlng.lat, request.from.latlng.lng],
              [request.to.latlng.lat, request.to.latlng.lng],
            ]}
            pathOptions={{ color: '#000', weight: 3, dashArray: '10, 10', opacity: 0.7 }}
          />

          {driver?.currentLocation && (
            <Marker
              position={[driver.currentLocation.lat, driver.currentLocation.lng]}
              icon={iconDriver}
            />
          )}
        </MapContainer>
      </div>

      {/* Content */}
      <div
        className="px-5 py-5 space-y-5 w-full max-w-2xl mx-auto"
        style={{ paddingBottom: 'calc(1.25rem + var(--app-user-safe-bottom, 0px))' }}
      >
        {request.status !== 'completed' && (
          <div className="flex gap-2">
            <button
              onClick={() => setShowEditSheet(true)}
              disabled={isSaving || isDeleting}
              className="flex-1 py-2 rounded-xl border border-border text-sm font-semibold disabled:opacity-60"
            >
              {isSaving
                ? t('common.saving', { defaultValue: 'Saving...' })
                : request.status === 'pending'
                  ? t('passenger.editRequest', { defaultValue: 'Edit' })
                  : t('passenger.editRoute', { defaultValue: 'Edit route' })}
            </button>
            {request.status === 'pending' && (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                disabled={isSaving || isDeleting}
                className="flex-1 py-2 rounded-xl border border-red-200 text-red-600 text-sm font-semibold disabled:opacity-60"
              >
                {isDeleting ? t('common.deleting', { defaultValue: 'Deleting...' }) : t('common.delete', { defaultValue: 'Delete' })}
              </button>
            )}
          </div>
        )}
        {errorMessage && <p className="text-xs text-red-600">{errorMessage}</p>}

        {/* Pickup confirmation banner */}
        {request.pickupChangedByDriver && !request.pickupConfirmedAt && (
          <div className="bg-amber-50 border-[1.5px] border-amber-200 rounded-card p-4 space-y-3 animate-slide-up">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
                <Warning size={18} weight="fill" className="text-amber-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-amber-900">
                  {t('passenger.pickupChangedByDriver', { defaultValue: 'Driver changed pickup point' })}
                </p>
                <p className="text-xs text-amber-700 mt-1">
                  {t('passenger.newPickupPoint', { defaultValue: 'New point:' })}{' '}
                  <span className="font-semibold">{request.from.address}</span>
                </p>
                <p className="text-[11px] text-amber-600 mt-0.5">
                  {t('passenger.confirmPickupPrompt', { defaultValue: 'Please confirm you see the new pickup point.' })}
                </p>
              </div>
            </div>
            <button
              onClick={async () => {
                setIsConfirmingPickup(true)
                setErrorMessage(null)
                try {
                  const updated = await confirmPickup(request.id, request.pickupRevision ?? 0)
                  setRequest(updated)
                } catch (error) {
                  setErrorMessage(
                    error instanceof Error ? error.message : t('errors.confirmPickupFailed', { defaultValue: 'Failed to confirm pickup point.' }),
                  )
                } finally {
                  setIsConfirmingPickup(false)
                }
              }}
              disabled={isConfirmingPickup}
              className="w-full py-3 rounded-xl bg-amber-500 text-white text-sm font-bold inline-flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-60"
            >
              {isConfirmingPickup ? (
                t('passenger.confirmingPickup', { defaultValue: 'Confirming…' })
              ) : (
                <>
                  <Check size={16} weight="bold" />
                  {t('passenger.confirmPickupButton', { defaultValue: 'Confirm pickup point' })}
                </>
              )}
            </button>
          </div>
        )}

        {/* Pickup confirmed badge */}
        {request.pickupChangedByDriver && request.pickupConfirmedAt && (
          <div className="bg-green-50 border border-green-200 rounded-card p-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
              <MapPin size={14} weight="fill" className="text-green-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-green-800">
                {t('passenger.pickupConfirmed', { defaultValue: 'Pickup point confirmed' })}
              </p>
              <p className="text-[11px] text-green-600">{request.from.address}</p>
            </div>
            <Check size={16} weight="bold" className="text-green-600 flex-shrink-0" />
          </div>
        )}

        {/* Route card */}
        <div className="bg-surface rounded-card p-4">
          <div className="flex items-start gap-3">
            <div className="flex flex-col items-center gap-1 pt-1">
              <div className="w-3 h-3 rounded-full bg-point-a" />
              <div className="w-px h-8 bg-border" />
              <div className="w-3 h-3 rounded-full bg-point-b" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted mb-0.5">{t('passenger.fromLabel', { defaultValue: 'From' })}</p>
              <p className="text-sm font-semibold text-black mb-3">{request.from.address}</p>
              <p className="text-xs text-muted mb-0.5">{t('passenger.toLabel', { defaultValue: 'To' })}</p>
              <p className="text-sm font-semibold text-black">{request.to.address}</p>
            </div>
          </div>
        </div>

        {/* Date/Time */}
        <div className="bg-surface rounded-card p-4 space-y-3">
          <div>
            <p className="text-xs text-muted mb-1 inline-flex items-center gap-1.5">
              <Calendar size={14} />
              {t('passenger.dateLabel', { defaultValue: 'Date' })}
            </p>
            <p className="text-sm font-semibold">{dateStr}</p>
          </div>
          <div className="w-full h-px bg-border" />
          <div>
            <p className="text-xs text-muted mb-1 inline-flex items-center gap-1.5">
              <Clock size={14} />
              {t('passenger.timeLabel', { defaultValue: 'Time' })}
            </p>
            <p className="text-sm font-semibold">{timeStr}</p>
          </div>
        </div>

        {/* Driver card */}
        {driver ? (
          <div className="bg-black text-white rounded-card overflow-hidden">
            <div className="px-5 pt-5 pb-4 flex items-center gap-4">
              {driver.photoUrl ? (
                <img
                  src={driver.photoUrl}
                  alt={driver.name}
                  className="w-16 h-16 rounded-2xl object-cover border-2 border-white/15 flex-shrink-0"
                />
              ) : (
                <div className="w-16 h-16 rounded-2xl bg-white/10 flex items-center justify-center flex-shrink-0">
                  <Car size={28} weight="fill" className="text-white/80" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wider text-white/50">
                  {t('passenger.yourDriver', { defaultValue: 'Your driver' })}
                </p>
                <p className="text-lg font-extrabold truncate">{driver.name}</p>
                <RatingBadge rating={driver.rating} variant="dark" />
                <div className="flex items-center gap-2 mt-0.5 text-xs">
                  <span className="text-white/60 inline-flex items-center gap-1">
                    <Users size={12} />{' '}
                    {t('passenger.seatsCount', {
                      count: driver.seatsCount ?? 4,
                      defaultValue: `${driver.seatsCount ?? 4} seats`,
                    })}
                  </span>
                </div>
              </div>
            </div>

            {/* Vehicle band — car info + plate */}
            <div className="mx-5 mb-4 rounded-xl bg-white/5 border border-white/10 px-4 py-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wider text-white/50">
                  {t('passenger.vehicle', { defaultValue: 'Vehicle' })}
                </p>
                <p className="text-sm font-bold truncate">
                  {[driver.carBrand, driver.carModel].filter(Boolean).join(' ')}
                </p>
                {driver.vehicleColor && (
                  <p className="text-[11px] text-white/60 truncate">{driver.vehicleColor}</p>
                )}
              </div>
              <LithuanianPlate value={driver.carPlate} size="md" />
            </div>

            <div className="px-5 pb-5 flex gap-3">
              {driver.currentLocation && (
                <a
                  href={showOnMapHref(
                    driver.currentLocation,
                    t('passenger.driverOnMapLabel', { name: driver.name, defaultValue: `Driver · ${driver.name}` }),
                  )}
                  target="_blank"
                  rel="noreferrer"
                  className="flex-1 flex items-center justify-center gap-2 py-3 bg-accent text-black rounded-xl text-sm font-extrabold hover:bg-accent/90 transition-colors active:scale-[0.98]"
                >
                  <NavigationArrow size={16} weight="fill" /> {t('common.showOnMap', { defaultValue: 'Show on map' })}
                </a>
              )}
              {canUseSignalMode && (
                <button
                  type="button"
                  onClick={() => {
                    setIsSignalMode(true)
                    if (document.fullscreenElement) return
                    void document.documentElement.requestFullscreen?.().catch(() => undefined)
                  }}
                  className="flex-1 flex items-center justify-center gap-2 py-3 bg-white text-black rounded-xl text-sm font-extrabold hover:bg-white/90 transition-colors active:scale-[0.98]"
                >
                  <Warning size={16} weight="fill" />
                  {t('passenger.signalModeOpen', { defaultValue: 'Signal for driver' })}
                </button>
              )}
            </div>

            {driver.isOnline && driver.currentLocation && (
              <div className="px-5 pb-4 -mt-2 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                <span className="text-[11px] text-white/60">
                  {t('passenger.driverOnlineWithGeo', { defaultValue: 'Driver online · location available' })}
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-surface rounded-card p-6 text-center">
            <div className="w-12 h-12 rounded-full bg-white border border-border flex items-center justify-center mx-auto mb-3">
              <Car size={20} weight="fill" className="text-zinc-700" />
            </div>
            <p className="text-sm font-bold">
              {shouldShowAssignedFallback
                ? t('passenger.driverAssigned', { defaultValue: 'Driver assigned' })
                : t('passenger.searchingDriver', { defaultValue: 'Looking for a driver' })}
            </p>
            <p className="text-xs text-muted mt-1">
              {shouldShowAssignedFallback
                ? t('passenger.driverDataUpdating', {
                    defaultValue: 'Driver info is updating. Refresh the screen in a few seconds.',
                  })
                : t('passenger.driverAssignNotify', {
                    defaultValue: 'We will notify you when a driver is assigned',
                  })}
            </p>
          </div>
        )}

        {request.status === 'completed' && request.rating && (
          <div className="bg-surface rounded-card p-5 space-y-4">
            {request.rating.canRate ? (
              <>
                <div>
                  <p className="text-sm font-extrabold">{t('rating.rateRide', { defaultValue: 'Rate your ride' })}</p>
                  <p className="text-xs text-muted mt-0.5">
                    {driver
                      ? t('rating.howWasRideWith', {
                          name: driver.name,
                          defaultValue: `How was your ride with ${driver.name}?`,
                        })
                      : t('rating.helpOthers', { defaultValue: 'Your rating helps other passengers' })}
                  </p>
                </div>
                <StarRatingInput value={ratingScore} onChange={setRatingScore} disabled={isRatingSubmitting} />
                <textarea
                  value={ratingComment}
                  onChange={(e) => setRatingComment(e.target.value)}
                  disabled={isRatingSubmitting}
                  placeholder={t('rating.commentOptional', { defaultValue: 'Comment (optional)' })}
                  rows={3}
                  maxLength={500}
                  className="w-full rounded-xl border-[1.5px] border-border bg-surface px-4 py-3 text-sm resize-none focus:outline-none focus:border-black focus:bg-white transition-colors"
                />
                <button
                  type="button"
                  disabled={isRatingSubmitting || ratingScore < 1}
                  onClick={() => {
                    if (!id || ratingScore < 1) return
                    void (async () => {
                      setIsRatingSubmitting(true)
                      setErrorMessage(null)
                      try {
                        const updated = await rateRideAsPassenger(id, {
                          score: ratingScore,
                          comment: ratingComment.trim() || undefined,
                        })
                        setRequest(updated)
                      } catch (error) {
                        setErrorMessage(
                          error instanceof Error ? error.message : t('errors.submitRatingFailed', { defaultValue: 'Failed to submit rating.' }),
                        )
                      } finally {
                        setIsRatingSubmitting(false)
                      }
                    })()
                  }}
                  className="w-full h-12 rounded-xl bg-black text-white text-sm font-extrabold disabled:opacity-40"
                >
                  {isRatingSubmitting
                    ? t('common.submitting', { defaultValue: 'Submitting...' })
                    : t('rating.submitRating', { defaultValue: 'Submit rating' })}
                </button>
              </>
            ) : request.rating.myScore ? (
              <div className="text-center space-y-2">
                <p className="text-sm font-extrabold">{t('rating.thanks', { defaultValue: 'Thanks for your rating!' })}</p>
                <div className="flex items-center justify-center gap-1">
                  {Array.from({ length: request.rating.myScore }).map((_, i) => (
                    <Star key={i} size={20} weight="fill" className="text-amber-400" />
                  ))}
                </div>
                {request.rating.myComment && (
                  <p className="text-xs text-muted">{request.rating.myComment}</p>
                )}
              </div>
            ) : null}
          </div>
        )}

        {request.status === 'completed' && driver?.userId && !driverBlocked && (
          <div className="bg-white border border-border rounded-card p-4 flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-muted">
              {t('block.blockDriver', { defaultValue: 'Block driver' })}
            </p>
            <InlineConfirm
              label={t('block.blockDriver', { defaultValue: 'Block driver' })}
              confirmLabel={t('block.confirmBlock', {
                name: driver.name,
                defaultValue: `Block ${driver.name}?`,
              })}
              onConfirm={() => {
                if (!driver.userId || isBlockingDriver) return
                void (async () => {
                  setIsBlockingDriver(true)
                  setErrorMessage(null)
                  try {
                    await blockUser(driver.userId!)
                    setDriverBlocked(true)
                  } catch (error) {
                    setErrorMessage(
                      error instanceof Error
                        ? error.message
                        : t('errors.blockFailed', { defaultValue: 'Failed to update block list' }),
                    )
                  } finally {
                    setIsBlockingDriver(false)
                  }
                })()
              }}
            />
          </div>
        )}

        {driverBlocked && (
          <p className="text-xs font-medium text-muted text-center">
            {t('block.blockedSuccess', { defaultValue: 'User blocked' })}
          </p>
        )}

        {/* Passenger info */}
        <div className="bg-surface rounded-card p-4 space-y-2">
          <p className="text-xs font-semibold text-muted uppercase tracking-wider">
            {t('passenger.passengerLabel', { defaultValue: 'Passenger' })}
          </p>
          <p className="text-sm font-semibold">{request.passengerName}</p>
          <RatingBadge
            rating={request.passengerRating ?? 5}
            ratingCount={request.passengerRatingCount}
            size="sm"
          />
          <p className="text-xs text-muted">
            {t('passenger.rideNumber', { number: request.rideNumber, defaultValue: `Ride number: ${request.rideNumber}` })}
          </p>
        </div>
      </div>

      <EditRequestSheet
        open={showEditSheet}
        request={request}
        routeOnly={request.status !== 'pending'}
        isSaving={isSaving}
        onClose={() => setShowEditSheet(false)}
        onSave={async ({ fromAddress, toAddress, fromLatLng, toLatLng, dateTime }) => {
          setIsSaving(true)
          setErrorMessage(null)
          try {
            const updated = await updateRequest(request.id, {
              from: { address: fromAddress, latlng: fromLatLng },
              to: { address: toAddress, latlng: toLatLng },
              dateTime,
            })
            setRequest(updated)
            setShowEditSheet(false)
          } catch (error) {
            setErrorMessage(
              error instanceof Error ? error.message : t('errors.updateRequestFailed', { defaultValue: 'Failed to update request.' }),
            )
          } finally {
            setIsSaving(false)
          }
        }}
      />

      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[3300] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center">
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label={t('common.cancel', { defaultValue: 'Cancel' })}
            onClick={() => !isDeleting && setShowDeleteConfirm(false)}
          />
          <div
            className="relative w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-card shadow-card p-5 space-y-4 animate-slide-up"
            style={{ paddingBottom: 'calc(1.25rem + var(--app-user-safe-bottom, 0px))' }}
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center flex-shrink-0">
                <Warning size={20} weight="fill" className="text-red-600" />
              </div>
              <div className="min-w-0">
                <p className="text-base font-extrabold tracking-tight">
                  {t('passenger.deleteRequestConfirm', { defaultValue: 'Delete request?' })}
                </p>
                <p className="text-xs text-muted mt-1">
                  №{request.rideNumber} · {request.from.address}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isDeleting}
                className="flex-1 h-12 rounded-2xl bg-surface text-sm font-bold disabled:opacity-60"
              >
                {t('common.cancel', { defaultValue: 'Cancel' })}
              </button>
              <button
                type="button"
                onClick={async () => {
                  setIsDeleting(true)
                  setErrorMessage(null)
                  try {
                    await deleteRequest(request.id)
                    navigate('/requests', { replace: true })
                  } catch (error) {
                    setShowDeleteConfirm(false)
                    setErrorMessage(
                      error instanceof Error ? error.message : t('errors.deleteRequestFailed', { defaultValue: 'Failed to delete request.' }),
                    )
                  } finally {
                    setIsDeleting(false)
                  }
                }}
                disabled={isDeleting}
                className="flex-1 h-12 rounded-2xl bg-red-600 text-white text-sm font-bold disabled:opacity-60 active:scale-[0.98] transition-transform"
              >
                {isDeleting ? t('common.deleting', { defaultValue: 'Deleting...' }) : t('common.delete', { defaultValue: 'Delete' })}
              </button>
            </div>
          </div>
        </div>
      )}

      {isSignalMode && (
        <div className="fixed inset-0 z-[3400] signal-attention-screen flex flex-col items-center justify-center text-center px-6">
          <button
            type="button"
            onClick={() => {
              setIsSignalMode(false)
              if (document.fullscreenElement) {
                void document.exitFullscreen?.().catch(() => undefined)
              }
            }}
            className="absolute top-4 right-4 rounded-full w-11 h-11 bg-black/70 text-white flex items-center justify-center"
            style={{ top: 'calc(var(--app-safe-area-top-total) + 36px)' }}
            aria-label={t('common.close', { defaultValue: 'Close' })}
          >
            <ArrowLeft size={18} weight="bold" />
          </button>
          <div className="signal-attention-content rounded-card px-5 py-4 max-w-[420px]">
            <p className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              {t('passenger.signalModeTitle', { defaultValue: 'Driver, I am here' })}
            </p>
            <p className="mt-2 text-sm font-semibold opacity-90">
              {t('passenger.signalModeHint', { defaultValue: 'Hold the phone up so the driver can see you from the road.' })}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
