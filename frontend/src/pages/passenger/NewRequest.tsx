import { CaretDown, CaretRight, Car, ClipboardText, Clock, Coins, Crosshair, Info, List, MagnifyingGlass, NavigationArrow, Star, UserCircle, Warning, X } from '@phosphor-icons/react'
import { MapContainer, Marker, Polyline, Popup } from 'react-leaflet'
import LocalizedTileLayer from '../../components/LocalizedTileLayer'
import NotificationBell from '../../components/notifications/NotificationBell'
import L from 'leaflet'
import { useEffect, useMemo, useState, useRef, Fragment } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { hapticSelection } from '../../lib/telegram'
import { makeMapMarkIcon, makeOfferPickupIcon } from '../../lib/mapMarkIcons'
import LanguageSwitcher from '../../components/LanguageSwitcher'
import { listPublicMapMarks, updateCurrentUserLanguage } from '../../lib/backend'
import { useEnsurePassengerSession } from '../../application/session/useEnsurePassengerSession'
import type { AppLanguage } from '../../i18n/languages'
import { hasUserInfoText, resolveUserInfoText } from '../../lib/userInfoText'
import { FieldRow } from './new-request/FieldRow'
import { iconA, iconB, iconOfferB, MapBinder } from './new-request/NewRequestMapBinder'
import { OfferRouteFitBounds } from './new-request/OfferRouteFitBounds'
import OfferDayFilter from './components/OfferDayFilter'
import {
  firstAvailableOfferDayOffset,
  isOfferDayOffsetBookable,
  offerDayOffsetFromDate,
  offerMapDateForOffset,
  OFFER_DAY_OFFSETS,
  type OfferDayOffset,
} from '../../lib/offerMapDayFilter'
import { DEFAULT_PRICING_SETTINGS } from '../../lib/pricingDefaults'
import { useNewRequestController } from './new-request/useNewRequestController'
import { usePassengerRideOffersOnMap } from './new-request/usePassengerRideOffersOnMap'
import { useMatchingRideOffers } from './new-request/useMatchingRideOffers'
import OfferMapSheet from './components/OfferMapSheet'
import DriverOffersListModal from './components/DriverOffersListModal'
import type { MapMark, MatchedPassengerRideOffer } from '../../types'
import { buildRideTimeSlots } from '../../lib/rideTimeSlots'
import { hasRideDateTime } from '../../lib/rideDraft'
import { isCoarsePointer } from '../../lib/pointer'
import { useEscapeClose } from '../../lib/useEscapeClose'

const VILNIUS_CENTER: [number, number] = [54.6872, 25.2797]

export default function NewRequest() {
  const { t, i18n } = useTranslation()
  const model = useNewRequestController()
  const passengerSession = useEnsurePassengerSession()
  const navigate = useNavigate()
  const offerDayReady = useRef(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [publicMapMarks, setPublicMapMarks] = useState<MapMark[]>([])
  const [openedPublicMarkId, setOpenedPublicMarkId] = useState<string | null>(null)
  const [fullscreenPhoto, setFullscreenPhoto] = useState<{ src: string; title: string } | null>(null)
  const [isSignalMode, setIsSignalMode] = useState(false)
  const [dayOffersModalOpen, setDayOffersModalOpen] = useState(false)
  const [routeOffersModalOpen, setRouteOffersModalOpen] = useState(false)
  const routeModalDismissedRef = useRef(false)
  const [offerDayOffset, setOfferDayOffset] = useState<OfferDayOffset>(() =>
    firstAvailableOfferDayOffset(DEFAULT_PRICING_SETTINGS),
  )
  const offerMapDate = useMemo(() => offerMapDateForOffset(offerDayOffset), [offerDayOffset])
  const disabledOfferDayOffsets = useMemo(() => {
    const disabled = new Set<OfferDayOffset>()
    for (const offset of OFFER_DAY_OFFSETS) {
      if (!isOfferDayOffsetBookable(offset, model.pricing)) {
        disabled.add(offset)
      }
    }
    return disabled
  }, [model.pricing])
  const rideTimeSlots = useMemo(
    () =>
      buildRideTimeSlots({
        workStartTime: model.pricing.workStartTime || '06:00',
        workEndTime: model.pricing.workEndTime || '19:00',
        slotIntervalMinutes: model.pricing.slotIntervalMinutes || 30,
        selectedDate: offerMapDate,
      }),
    [model.pricing, offerMapDate],
  )
  const userInfoMessage = resolveUserInfoText(model.pricing.userInfoText, i18n.language)
  const hasInfo = hasUserInfoText(model.pricing.userInfoText) && Boolean(userInfoMessage.trim())
  const isMapMarkViewMode = Boolean(openedPublicMarkId || fullscreenPhoto)
  const offersPaused = isMapMarkViewMode || model.showSearch || isSignalMode
  const offersMap = usePassengerRideOffersOnMap({
    isPinLive: model.isPinLive,
    paused: offersPaused,
    mapDate: offerMapDate,
    pickupPoint: model.fromPoint,
  })
  const pointASetupHint = t('passenger.pointASetupHint', { defaultValue: 'Enter, adjust and confirm the address' })
  const pointBSetupHint = t('passenger.pointBSetupHint', { defaultValue: 'Enter, adjust and confirm the destination' })
  const activeSetupHint = model.isPickingPointA ? pointASetupHint : pointBSetupHint
  const matchingOffers = useMatchingRideOffers({
    from: model.fromPoint,
    to: model.toPoint,
    dateTime: model.dateTime,
    limit: 30,
    enabled: Boolean(
      model.fromPoint && model.toPoint && hasRideDateTime(model.dateTime) && !offersPaused,
    ),
  })

  const offerPickupIcon = useMemo(() => makeOfferPickupIcon(), [])
  const offerPickupIconSubdued = useMemo(() => makeOfferPickupIcon({ subdued: true }), [])

  const offerById = useMemo(() => {
    const map = new Map<string, MatchedPassengerRideOffer>()
    for (const offer of offersMap.offers) map.set(offer.id, offer)
    for (const offer of matchingOffers.items) map.set(offer.id, offer)
    return map
  }, [offersMap.offers, matchingOffers.items])

  const highlightedOffer = useMemo(() => {
    if (!offersMap.selectedOfferId) return null
    return offerById.get(offersMap.selectedOfferId) ?? null
  }, [offersMap.selectedOfferId, offerById])

  const routeModalOffers = useMemo(() => {
    if (!model.fromPoint || !model.toPoint) return []
    if (hasRideDateTime(model.dateTime)) return matchingOffers.items
    return offersMap.offers
  }, [model.fromPoint, model.toPoint, model.dateTime, matchingOffers.items, offersMap.offers])

  const routeKey = useMemo(() => {
    if (!model.fromPoint || !model.toPoint) return ''
    return `${model.fromPoint.lat.toFixed(5)},${model.fromPoint.lng.toFixed(5)}-${model.toPoint.lat.toFixed(5)},${model.toPoint.lng.toFixed(5)}`
  }, [model.fromPoint, model.toPoint])

  const showDayOffersButton =
    !offersPaused && !offersMap.isLoading && offersMap.offers.length > 0

  useEscapeClose(Boolean(fullscreenPhoto), () => setFullscreenPhoto(null))
  useEscapeClose(!fullscreenPhoto && model.showSearch, () => {
    model.setShowSearch(false)
    model.setSearchResults([])
  })
  useEscapeClose(menuOpen, () => setMenuOpen(false))
  useEscapeClose(dayOffersModalOpen, () => setDayOffersModalOpen(false))
  useEscapeClose(routeOffersModalOpen, () => {
    routeModalDismissedRef.current = true
    setRouteOffersModalOpen(false)
  })

  useEffect(() => {
    routeModalDismissedRef.current = false
  }, [routeKey])

  useEffect(() => {
    if (highlightedOffer) {
      setDayOffersModalOpen(false)
      setRouteOffersModalOpen(false)
    }
  }, [highlightedOffer])

  useEffect(() => {
    if (!model.fromPoint || !model.toPoint) {
      setRouteOffersModalOpen(false)
      return
    }
    if (offersPaused || highlightedOffer || routeModalDismissedRef.current) return
    if (hasRideDateTime(model.dateTime) && matchingOffers.isLoading) return
    setRouteOffersModalOpen(routeModalOffers.length > 0)
  }, [
    model.fromPoint,
    model.toPoint,
    model.dateTime,
    routeModalOffers.length,
    matchingOffers.isLoading,
    offersPaused,
    highlightedOffer,
    routeKey,
  ])

  useEffect(() => {
    if (offersMap.offers.length === 0) setDayOffersModalOpen(false)
  }, [offersMap.offers.length])

  useEffect(() => {
    if (!offerDayReady.current) {
      const draftDate = model.dateTime.split('T')[0]?.trim()
      const fromDraft = draftDate ? offerDayOffsetFromDate(draftDate) : null
      const nextOffset =
        fromDraft != null && isOfferDayOffsetBookable(fromDraft, model.pricing)
          ? fromDraft
          : firstAvailableOfferDayOffset(model.pricing)
      setOfferDayOffset(nextOffset)
      offerDayReady.current = true
      return
    }
    if (!isOfferDayOffsetBookable(offerDayOffset, model.pricing)) {
      setOfferDayOffset(firstAvailableOfferDayOffset(model.pricing))
    }
  }, [model.pricing, model.dateTime, offerDayOffset])

  useEffect(() => {
    if (!offerDayReady.current) return
    const [currentDate, timePart = ''] = model.dateTime.split('T')
    const validTime = timePart && rideTimeSlots.includes(timePart) ? timePart : ''
    const needsUpdate = currentDate !== offerMapDate || (timePart !== '' && validTime === '')
    if (!needsUpdate) return
    model.setDateTime(validTime ? `${offerMapDate}T${validTime}` : `${offerMapDate}T`)
  }, [offerDayOffset, offerMapDate, rideTimeSlots, model.dateTime, model.setDateTime])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const page = await listPublicMapMarks('bearer', { limit: 300, offset: 0 })
        if (!cancelled) setPublicMapMarks(page.items)
      } catch {
        if (!cancelled) setPublicMapMarks([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="relative h-[100dvh] overflow-hidden bg-white">
      <div className="absolute inset-0" style={{ zIndex: 0 }}>
        <MapContainer center={VILNIUS_CENTER} zoom={13} style={{ width: '100%', height: '100%' }} zoomControl={false} attributionControl={true}>
          {!offersPaused &&
            offersMap.offers.map((offer) => {
              const isSelected = offersMap.selectedOfferId === offer.id
              const routeOpacity = isSelected
                ? (model.isPinLive ? 0.75 : 0.95)
                : offersMap.selectedOfferId
                  ? (model.isPinLive ? 0.12 : 0.2)
                  : (model.isPinLive ? 0.28 : 0.42)
              return (
                <Polyline
                  key={`offer-route-${offer.id}`}
                  positions={[
                    [offer.from.latlng.lat, offer.from.latlng.lng],
                    [offer.to.latlng.lat, offer.to.latlng.lng],
                  ]}
                  pathOptions={{
                    color: isSelected ? '#000' : '#374151',
                    weight: isSelected ? 5 : 2,
                    dashArray: '10, 10',
                    opacity: routeOpacity,
                  }}
                  interactive={false}
                />
              )
            })}
          {!offersPaused &&
            offersMap.offers.map((offer) => {
              if (offersMap.selectedOfferId === offer.id) return null
              const select = (event: L.LeafletMouseEvent) => {
                L.DomEvent.stopPropagation(event.originalEvent)
                offersMap.selectOffer(offer.id)
              }
              const markerIcon = model.isPinLive ? offerPickupIconSubdued : offerPickupIcon
              return (
                <Fragment key={`offer-endpoints-${offer.id}`}>
                  <Marker
                    position={[offer.from.latlng.lat, offer.from.latlng.lng]}
                    icon={markerIcon}
                    eventHandlers={{ click: select }}
                  />
                  <Marker
                    position={[offer.to.latlng.lat, offer.to.latlng.lng]}
                    icon={iconOfferB}
                    eventHandlers={{ click: select }}
                  />
                </Fragment>
              )
            })}
          {highlightedOffer && !offersMap.offers.some((offer) => offer.id === highlightedOffer.id) && (
            <Polyline
              key={`offer-route-highlight-${highlightedOffer.id}`}
              positions={[
                [highlightedOffer.from.latlng.lat, highlightedOffer.from.latlng.lng],
                [highlightedOffer.to.latlng.lat, highlightedOffer.to.latlng.lng],
              ]}
              pathOptions={{
                color: '#000',
                weight: 5,
                dashArray: '10, 10',
                opacity: model.isPinLive ? 0.75 : 0.95,
              }}
              interactive={false}
            />
          )}
          {highlightedOffer && (
            <>
              <OfferRouteFitBounds
                offerId={highlightedOffer.id}
                from={highlightedOffer.from.latlng}
                to={highlightedOffer.to.latlng}
              />
              <Marker
                position={[
                  highlightedOffer.from.latlng.lat,
                  highlightedOffer.from.latlng.lng,
                ]}
                icon={iconA}
                interactive={false}
                zIndexOffset={600}
              />
              <Marker
                position={[
                  highlightedOffer.to.latlng.lat,
                  highlightedOffer.to.latlng.lng,
                ]}
                icon={iconB}
                interactive={false}
                zIndexOffset={600}
              />
            </>
          )}
          {model.fromPoint && model.toPoint && !highlightedOffer && (
            <Polyline
              positions={[
                [model.fromPoint.lat, model.fromPoint.lng],
                [model.toPoint.lat, model.toPoint.lng],
              ]}
              pathOptions={{ color: '#000', weight: 3, dashArray: '10, 10', opacity: 0.6 }}
            />
          )}
          {publicMapMarks.map((mark) => (
            <Marker
              key={mark.id}
              position={[mark.position.lat, mark.position.lng]}
              icon={makeMapMarkIcon(mark.color, 28)}
              eventHandlers={{
                popupopen: () => setOpenedPublicMarkId(mark.id),
                popupclose: () => setOpenedPublicMarkId((current) => (current === mark.id ? null : current)),
              }}
            >
              <Popup className="map-mark-popup">
                <div className="text-xs w-[min(76vw,260px)]">
                  <p className="font-bold">{mark.title}</p>
                  {mark.photoUrl && (
                    <button
                      type="button"
                      onClick={() => setFullscreenPhoto({ src: mark.photoUrl!, title: mark.title })}
                      className="block w-full mt-2 rounded-lg overflow-hidden border border-border"
                    >
                      <img
                        src={mark.photoUrl}
                        alt={mark.title}
                        className="w-full h-auto max-h-[44vh] object-contain bg-surface/40"
                      />
                    </button>
                  )}
                </div>
              </Popup>
            </Marker>
          ))}
          {model.fromPoint && !highlightedOffer && <Marker position={[model.fromPoint.lat, model.fromPoint.lng]} icon={iconA} />}
          {model.toPoint && !highlightedOffer && <Marker position={[model.toPoint.lat, model.toPoint.lng]} icon={iconB} />}
          <MapBinder
            registerMap={(map) => {
              model.mapRef.current = map
            }}
            enabled={!isMapMarkViewMode && !highlightedOffer}
            onPanStart={() => model.setIsPanning(true)}
            onPanEnd={(latlng) => {
              model.setIsPanning(false)
              void model.commitPin(latlng)
            }}
          />
        </MapContainer>
      </div>

      {!isMapMarkViewMode && model.isPinLive && !highlightedOffer && (
        <>
          <div className={`center-pin ${model.activeIsFrom ? 'pin-a' : 'pin-b'} ${model.isPanning ? 'is-panning' : ''}`}>
            <div className="pin-body">
              <span>{model.activeIsFrom ? 'A' : 'B'}</span>
            </div>
          </div>
          <div className="center-pin-shadow" style={model.isPanning ? { width: 22, opacity: 0.45 } : undefined} />
        </>
      )}

      {!isMapMarkViewMode && (
      <header
        className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between gap-2 px-3"
        style={{ paddingTop: 'var(--app-user-safe-top)' }}
      >
        <button
          onClick={() => { hapticSelection(); setMenuOpen(true) }}
          className="w-10 h-10 rounded-pill bg-white/95 shadow-card backdrop-blur-sm flex items-center justify-center active:scale-95 transition-transform"
          title={t('common.menu', { defaultValue: 'Menu' })}
        >
          <List size={20} weight="bold" />
        </button>
        {showDayOffersButton && (
          <button
            type="button"
            onClick={() => {
              hapticSelection()
              setDayOffersModalOpen(true)
            }}
            className="relative w-10 h-10 rounded-full bg-black text-white shadow-card flex items-center justify-center active:scale-95 transition-transform"
            title={t('passenger.offers.dayMapButton', {
              count: offersMap.offers.length,
              defaultValue: `Driver rides today (${offersMap.offers.length})`,
            })}
          >
            <Car size={18} weight="fill" />
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-point-a text-[10px] font-extrabold leading-[18px] text-center">
              {offersMap.offers.length}
            </span>
          </button>
        )}
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              hapticSelection()
              setIsSignalMode(true)
              if (!document.fullscreenElement) {
                void document.documentElement.requestFullscreen?.().catch(() => undefined)
              }
            }}
            className="w-10 h-10 rounded-pill bg-red-500 text-white shadow-card flex items-center justify-center active:scale-95 transition-transform"
            title={t('passenger.signalModeOpen', { defaultValue: 'Signal for driver' })}
          >
            <Warning size={18} weight="fill" />
          </button>
          <button
            onClick={() => {
              hapticSelection()
              model.handleLocateMe()
            }}
            disabled={model.isLocating}
            className="w-10 h-10 rounded-pill bg-white shadow-card flex items-center justify-center active:scale-95 transition-transform disabled:opacity-60"
            title={t('common.myLocation', { defaultValue: 'My location' })}
          >
            {model.isLocating ? <span className="w-4 h-4 rounded-full border-[2px] border-border border-t-black animate-spin" /> : <Crosshair size={18} weight="bold" />}
          </button>
          {/* Address search lives next to the A/B fields in the bottom panel — no duplicate trigger here */}
          <NotificationBell pool="passenger" />
        </div>
      </header>
      )}

      {/* Side menu drawer */}
      {!isMapMarkViewMode && menuOpen && (
        <>
          <div
            className="absolute inset-0 z-[500] bg-black/30 backdrop-blur-[1px]"
            onClick={() => setMenuOpen(false)}
          />
          <div
            className="absolute top-0 left-0 bottom-0 z-[501] w-72 bg-white flex flex-col shadow-[4px_0_24px_rgba(0,0,0,0.12)] animate-slide-in-left"
            style={{ paddingTop: 'var(--app-user-safe-top)', paddingBottom: 'var(--app-user-safe-bottom)' }}
          >
            <div className="flex items-center justify-between px-4 h-14 border-b border-border/50">
              <h2 className="text-lg font-extrabold tracking-tight">{t('app.name', { defaultValue: 'RIDE' })}</h2>
              <button
                onClick={() => setMenuOpen(false)}
                className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-surface transition-colors"
              >
                <X size={18} />
              </button>
            </div>
            <nav className="flex-1 px-3 py-4 flex flex-col gap-1">
              <button
                onClick={() => { hapticSelection(); setMenuOpen(false); navigate('/requests') }}
                className="flex items-center gap-3 w-full px-3 py-3.5 rounded-xl hover:bg-surface active:bg-surface transition-colors text-left"
              >
                <div className="w-9 h-9 rounded-xl bg-surface flex items-center justify-center flex-shrink-0">
                  <ClipboardText size={18} weight="duotone" />
                </div>
                <div>
                  <p className="text-sm font-bold">{t('nav.requests')}</p>
                  <p className="text-[11px] text-muted">{t('passenger.requestsHistory')}</p>
                </div>
              </button>
              <button
                onClick={() => { hapticSelection(); setMenuOpen(false); navigate('/profile') }}
                className="flex items-center gap-3 w-full px-3 py-3.5 rounded-xl hover:bg-surface active:bg-surface transition-colors text-left"
              >
                <div className="w-9 h-9 rounded-xl bg-surface flex items-center justify-center flex-shrink-0">
                  <UserCircle size={18} weight="duotone" />
                </div>
                <div>
                  <p className="text-sm font-bold">{t('nav.profile')}</p>
                  <p className="text-[11px] text-muted">{t('passenger.profileMenuDesc')}</p>
                </div>
              </button>
              <div className="px-3 pt-2">
                <LanguageSwitcher
                  onChangeLanguage={async (language: AppLanguage) => {
                    try {
                      await updateCurrentUserLanguage(language)
                    } catch {
                      // keep selected language locally if API call fails
                    }
                  }}
                />
              </div>
            </nav>
          </div>
        </>
      )}

      {!isMapMarkViewMode && model.isPinLive && !highlightedOffer && (
        <div
          className="absolute left-1/2 -translate-x-1/2 z-10 pointer-events-none max-w-[80vw]"
          style={{ top: 'calc(42% - 88px)' }}
        >
          {model.pinOutOfZone ? (
            <div className="px-3 py-1.5 rounded-pill bg-red-500 text-white text-[11px] font-bold shadow-card inline-flex items-center gap-1.5 animate-fade-in">
              <Warning size={12} weight="fill" />
              {t('passenger.outOfServiceZone', { defaultValue: 'Out of service zone' })}
            </div>
          ) : model.isResolving ? (
            <div className="px-3 py-1.5 rounded-pill bg-white text-black text-[11px] font-bold shadow-card inline-flex items-center gap-2 border border-black/10 animate-fade-in">
              <span className={`w-3 h-3 rounded-full border-[2px] border-border animate-spin ${model.activeIsFrom ? 'border-t-point-a' : 'border-t-point-b'}`} />
              <span className="inline-flex items-center gap-0.5">
                {t('passenger.resolvingAddress', { defaultValue: 'Resolving address' })}
                <span className="dot-pulse" style={{ animationDelay: '0ms' }}>.</span>
                <span className="dot-pulse" style={{ animationDelay: '150ms' }}>.</span>
                <span className="dot-pulse" style={{ animationDelay: '300ms' }}>.</span>
              </span>
            </div>
          ) : model.pinAddress ? (
            <div className={`px-3 py-1.5 rounded-pill text-white text-[11px] font-bold shadow-card truncate max-w-[80vw] animate-fade-in ${model.activeIsFrom ? 'bg-point-a' : 'bg-point-b'}`}>
              {model.pinAddress}
            </div>
          ) : (
            <div className={`px-3 py-1.5 rounded-pill text-white text-[11px] font-bold shadow-card max-w-[80vw] text-center leading-snug ${model.activeIsFrom ? 'bg-point-a' : 'bg-point-b'}`}>
              {activeSetupHint}
            </div>
          )}
        </div>
      )}

      {!isMapMarkViewMode && model.zoneWarning && (
        <div
          className="absolute left-3 right-3 z-30 flex items-center gap-2 px-3 py-2.5 bg-red-50 border border-red-200 rounded-pill shadow-card animate-fade-in"
          style={{ top: 'calc(var(--app-user-safe-top) + 48px)' }}
        >
          <Warning size={16} weight="fill" className="text-red-500 flex-shrink-0" />
          <span className="text-xs font-semibold text-red-700 flex-1 truncate">{model.zoneWarning}</span>
          <button
            onClick={() => model.setZoneWarning(null)}
            className="flex-shrink-0 w-8 h-8 -my-1 flex items-center justify-center rounded-full touch-compact"
            aria-label={t('common.close', { defaultValue: 'Close' })}
          >
            <X size={14} className="text-red-400" />
          </button>
        </div>
      )}

      {!isMapMarkViewMode && (
      <div
        className="absolute left-0 right-0 z-20 flex flex-col gap-0 transition-transform duration-[250ms] ease-in-out md:max-w-xl md:mx-auto"
        style={{
          bottom: 0,
          transform: model.isPanning || highlightedOffer ? 'translateY(100%)' : 'translateY(0)',
        }}
      >
        {/* Service info (persistent, non-dismissible) */}
        {hasInfo && (
          <div className="mx-3 mb-2 flex items-center gap-2.5 bg-white border border-border rounded-xl shadow-card px-3 py-2.5">
            <Info size={14} weight="fill" className="text-muted flex-shrink-0 self-center" />
            <p className="flex-1 text-xs text-black leading-snug">{userInfoMessage}</p>
          </div>
        )}

        <div
          className="bg-white rounded-t-2xl shadow-[0_-4px_24px_rgba(0,0,0,0.10)] px-3 pt-4 space-y-3 md:rounded-2xl md:mb-4 md:shadow-card"
          style={{ paddingBottom: 'calc(var(--app-user-safe-bottom) + 12px)' }}
        >
          <OfferDayFilter
            value={offerDayOffset}
            disabledOffsets={disabledOfferDayOffsets}
            onChange={(offset) => {
              setOfferDayOffset(offset)
              offersMap.clearSelection()
            }}
          />

          <div className="flex flex-col gap-1.5">
            <FieldRow
              dotClass="bg-point-a"
              label={t('passenger.fromLabel', { defaultValue: 'From' })}
              value={model.fromAddress}
              placeholder={model.fromPoint
                ? t('passenger.addressPlaceholder', { defaultValue: 'Move map or tap to search' })
                : pointASetupHint}
              active={model.activeIsFrom}
              onClick={() => model.setActiveField('from')}
              onClear={model.fromPoint ? () => {
                model.setFromPoint(null)
                model.setFromAddress('')
                model.setActiveField('from')
                model.armPinFromMapCenter()
              } : undefined}
              onSearch={() => {
                model.setActiveField('from')
                model.setShowSearch(true)
                model.setSearchQuery('')
                model.setSearchResults([])
              }}
            />
            <div className="ml-[18px] w-px h-2 bg-border" />
            <FieldRow
              dotClass="bg-point-b"
              label={t('passenger.toLabel', { defaultValue: 'To' })}
              value={model.toAddress}
              placeholder={model.fromPoint
                ? (model.toPoint
                  ? t('passenger.addressPlaceholder', { defaultValue: 'Move map or tap to search' })
                  : pointBSetupHint)
                : t('passenger.pickPointAFirst', { defaultValue: 'Pick point A first' })}
              active={!model.activeIsFrom}
              onClick={() => model.setActiveField('to')}
              onClear={model.toPoint ? () => {
                model.setToPoint(null)
                model.setToAddress('')
                model.setActiveField('to')
                model.armPinFromMapCenter()
              } : undefined}
              onSearch={() => {
                model.setActiveField('to')
                model.setShowSearch(true)
                model.setSearchQuery('')
                model.setSearchResults([])
              }}
            />
          </div>

          <div className="flex items-center gap-1.5 w-full px-2 py-2 rounded-lg bg-surface border-t border-surface pt-2.5">
            <Clock size={14} className="text-muted flex-shrink-0" />
            <select
              value={model.dateTime.split('T')[1] || ''}
              onChange={(e) => {
                model.setDateTime(`${offerMapDate}T${e.target.value}`)
              }}
              className="flex-1 text-xs font-semibold bg-transparent outline-none min-w-0 appearance-none"
            >
              <option value="">{t('passenger.selectTime', { defaultValue: 'Select time' })}</option>
              {rideTimeSlots.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <CaretDown size={12} weight="bold" className="text-muted flex-shrink-0 pointer-events-none" />
          </div>

          {model.fromPoint && model.toPoint && (
            <div className="flex items-center justify-between rounded-xl bg-surface/80 px-3 py-2 text-[11px] text-muted">
              <span className="inline-flex items-center gap-1">
                <Coins size={12} weight="fill" className="text-accent-dark" />
                {t('passenger.rideCost', { defaultValue: 'Ride cost' })}
              </span>
              <span className="font-bold text-black text-xs">
                {model.quoteLoading
                  ? t('common.calculating', { defaultValue: 'Calculating...' })
                  : model.displayPoints != null
                    ? t('passenger.pointsAmount', { count: model.displayPoints, defaultValue: `${model.displayPoints} points` })
                    : model.quoteError ?? '—'}
              </span>
            </div>
          )}

          {model.submitted ? (
            <div className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-accent/10 text-accent-dark font-bold text-sm">
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                <circle cx="10" cy="10" r="10" fill="#22EA36" />
                <path d="M6 10l3 3 5-6" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {t('passenger.requestSent', { defaultValue: 'Request sent!' })}
            </div>
          ) : !model.fromPoint ? (
            <button
              onClick={model.confirmPoint}
              disabled={!model.pinReadyForConfirm}
              className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all text-center leading-snug ${model.pinReadyForConfirm ? 'bg-black text-white active:scale-[0.97]' : 'bg-surface text-muted cursor-not-allowed'}`}
            >
              {model.pinOutOfZone
                ? t('passenger.pointAOutOfZone', { defaultValue: 'Point A is outside service area' })
                : model.pinReadyForConfirm
                  ? t('passenger.confirmPointA', { defaultValue: 'Confirm point A' })
                  : pointASetupHint}
              <CaretRight size={14} weight="bold" className="flex-shrink-0" />
            </button>
          ) : !model.toPoint ? (
            <button
              onClick={model.confirmPoint}
              disabled={!model.pinReadyForConfirm}
              className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all text-center leading-snug ${model.pinReadyForConfirm ? 'bg-black text-white active:scale-[0.97]' : 'bg-surface text-muted cursor-not-allowed'}`}
            >
              {model.pinOutOfZone
                ? t('passenger.pointBOutOfZone', { defaultValue: 'Point B is outside service area' })
                : model.pinReadyForConfirm
                  ? t('passenger.confirmPointB', { defaultValue: 'Confirm point B' })
                  : pointBSetupHint}
              <CaretRight size={14} weight="bold" className="flex-shrink-0" />
            </button>
          ) : (
            <button
              onClick={() => void model.handleSubmit()}
              disabled={!model.canSubmit}
              className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all ${model.canSubmit ? 'bg-black text-white active:scale-[0.97]' : 'bg-surface text-muted cursor-not-allowed'}`}
            >
              {model.submitting
                ? t('common.sending', { defaultValue: 'Sending...' })
                : !model.hasValidDateTime
                  ? t('passenger.selectTime', { defaultValue: 'Select time' })
                  : t('passenger.bookRide', { defaultValue: 'Book ride' })}
              <CaretRight size={14} weight="bold" />
            </button>
          )}

          {(model.errorMessage || passengerSession.error) && (
            <p className="text-[11px] font-medium text-red-600">{model.errorMessage || passengerSession.error}</p>
          )}
        </div>
      </div>
      )}

      {!isMapMarkViewMode && model.showSearch && (
        <div
          className="absolute inset-0 z-[600] bg-white md:bg-black/40 md:backdrop-blur-[1px] flex flex-col md:items-center md:justify-start md:pt-20 md:px-4 animate-fade-in"
          style={{
            paddingTop: 'var(--app-user-safe-top)',
            paddingBottom: 'var(--app-user-safe-bottom)',
          }}
          onClick={() => {
            model.setShowSearch(false)
            model.setSearchResults([])
          }}
        >
          {/* Fullscreen on mobile, centered panel over a dimmed map on desktop */}
          <div
            className="flex flex-col flex-1 min-h-0 w-full bg-white md:flex-none md:max-w-xl md:rounded-card md:shadow-card md:max-h-[72vh] md:overflow-hidden"
            onClick={(event) => event.stopPropagation()}
          >
          <header className="flex items-center gap-3 px-3 py-3 border-b border-border">
            <button
              onClick={() => {
                model.setShowSearch(false)
                model.setSearchResults([])
              }}
              className="p-2 -ml-1 hover:bg-surface rounded-xl transition-colors"
            >
              <X size={18} />
            </button>
            <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl bg-surface">
              <MagnifyingGlass size={16} className="text-muted flex-shrink-0" />
              <input
                autoFocus={!isCoarsePointer}
                type="text"
                value={model.searchQuery}
                onChange={(e) => model.handleSearch(e.target.value)}
                placeholder={model.activeIsFrom
                  ? t('passenger.fromShort', { defaultValue: 'From?' })
                  : t('passenger.toShort', { defaultValue: 'To?' })}
                className="flex-1 text-sm font-medium outline-none bg-transparent placeholder:text-muted min-w-0"
              />
              {model.searchQuery && (
                <button
                  onClick={() => {
                    model.setSearchQuery('')
                    model.setSearchResults([])
                  }}
                >
                  <X size={14} className="text-muted" />
                </button>
              )}
            </div>
          </header>
          <div className="flex-1 overflow-y-auto">
            <button
              onClick={() => {
                model.setShowSearch(false)
                model.setSearchResults([])
              }}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface transition-colors border-b border-border/50"
            >
              <div className="w-9 h-9 rounded-full bg-surface flex items-center justify-center">
                <NavigationArrow size={16} weight="fill" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-black">{t('passenger.pickOnMap', { defaultValue: 'Pick point on map' })}</p>
                <p className="text-[11px] text-muted">{t('passenger.moveMapToSetPoint', {
                  point: model.activeIsFrom ? 'A' : 'B',
                  defaultValue: `Move map to set point ${model.activeIsFrom ? 'A' : 'B'}`,
                })}</p>
              </div>
              <CaretRight size={14} weight="bold" className="text-muted" />
            </button>

            {model.isSearching && <p className="px-4 py-3 text-sm text-muted">{t('common.searching', { defaultValue: 'Searching...' })}</p>}
            {model.searchResults.map((r) => (
              <button
                key={r.place_id}
                onClick={() => model.handleSelectSearchResult(r)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface transition-colors border-b border-border/50 last:border-b-0"
              >
                <div className="w-9 h-9 rounded-full bg-surface flex items-center justify-center flex-shrink-0">
                  <MagnifyingGlass size={14} className="text-muted" />
                </div>
                <span className="text-sm text-black flex-1 truncate">{r.display_name}</span>
              </button>
            ))}
            {!model.isSearching && model.searchQuery.length >= 3 && model.searchResults.length === 0 && <p className="px-4 py-3 text-sm text-muted">{t('common.notFound', { defaultValue: 'Nothing found.' })}</p>}
            {model.searchQuery.length < 3 && !model.isSearching && <p className="px-4 py-3 text-sm text-muted">{t('passenger.searchMinChars', { defaultValue: 'Start typing address - minimum 3 characters.' })}</p>}
          </div>
          </div>
        </div>
      )}

      {fullscreenPhoto && (
        <div
          className="fixed inset-0 z-[2200] bg-black/90 flex items-center justify-center p-4"
          onClick={() => setFullscreenPhoto(null)}
        >
          <button
            type="button"
            onClick={() => setFullscreenPhoto(null)}
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/15 text-white flex items-center justify-center"
            aria-label={t('common.close', { defaultValue: 'Close' })}
            style={{ top: 'calc(var(--app-safe-area-top-total) + 36px)' }}
          >
            <X size={18} />
          </button>
          <img
            src={fullscreenPhoto.src}
            alt={fullscreenPhoto.title}
            className="max-w-[96vw] max-h-[88vh] object-contain rounded-xl"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      )}

      <DriverOffersListModal
        offers={offersMap.offers}
        open={dayOffersModalOpen}
        title={t('passenger.offers.dayModalTitle', { defaultValue: 'Driver rides this day' })}
        hint={t('passenger.offers.dayModalHint', {
          defaultValue: 'Drivers offer a seat on their route. Tap to view on the map.',
        })}
        onClose={() => setDayOffersModalOpen(false)}
        onSelect={(offer) => {
          setDayOffersModalOpen(false)
          offersMap.selectOffer(offer.id)
        }}
      />

      <DriverOffersListModal
        offers={routeModalOffers}
        open={routeOffersModalOpen}
        title={t('passenger.offers.routeModalTitle', { defaultValue: 'Rides for your route' })}
        hint={t('passenger.offers.routeModalHint', {
          defaultValue: 'Drivers offer a shared ride along your route. Tap to inspect A and B on the map.',
        })}
        onClose={() => {
          routeModalDismissedRef.current = true
          setRouteOffersModalOpen(false)
        }}
        onSelect={(offer) => {
          routeModalDismissedRef.current = true
          setRouteOffersModalOpen(false)
          offersMap.selectOffer(offer.id)
        }}
      />

      <OfferMapSheet
        offer={highlightedOffer}
        open={Boolean(highlightedOffer)}
        isConfirming={offersMap.confirmOfferId === offersMap.selectedOfferId}
        isBooking={Boolean(offersMap.bookingOfferId)}
        errorMessage={offersMap.bookError}
        onClose={offersMap.clearSelection}
        onBookClick={() => {
          if (offersMap.selectedOfferId) offersMap.startBookConfirm(offersMap.selectedOfferId)
        }}
        onConfirmBook={() => void offersMap.bookSelectedOffer()}
        onCancelConfirm={offersMap.cancelBookConfirm}
      />

      {isSignalMode && (
        <div className="fixed inset-0 z-[2400] signal-attention-screen flex flex-col items-center justify-center text-center px-6">
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
            <X size={18} />
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
