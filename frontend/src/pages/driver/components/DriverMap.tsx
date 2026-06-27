import { useEffect, useMemo, useRef, useState } from 'react'
import { CircleMarker, MapContainer, Marker, Polyline, Popup, useMap } from 'react-leaflet'
import LocalizedTileLayer from '../../../components/LocalizedTileLayer'
import L from 'leaflet'
import { Crosshair, X } from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'

import { formatRideTime } from '../../../i18n/dateTime'
import { listPublicMapMarks } from '../../../lib/backend'
import { makeMapMarkIcon } from '../../../lib/mapMarkIcons'
import { getDefaultMapCenterTuple } from '../../../lib/mapRegion'
import type { DriverMapPoint, LatLng, MapMark } from '../../../types'

interface DriverMapProps {
  points: DriverMapPoint[]
  selectedPointId: string | null
  nextPointId: string | null
  driverLocation: LatLng | null
  mapInsetTop?: number
  onSelectPoint: (point: DriverMapPoint) => void
  onPointDragEnd: (rideId: string, pointType: 'pickup' | 'dropoff', latlng: LatLng) => void
  onMapMarkViewModeChange?: (isViewing: boolean) => void
}

function makePointIcon(pt: DriverMapPoint, opts: { isSelected: boolean; isNext: boolean }): L.DivIcon {
  const { isSelected, isNext } = opts
  const isDone = pt.pointStatus === 'done'
  const isPickup = pt.pointType === 'pickup'
  const isAvailable = pt.pointKind === 'available'

  // Driver flow color semantics:
  // - Amber: available unassigned ride
  // - Red: pickup
  // - Blue: dropoff
  // - Green: completed point
  const bg = isAvailable
    ? '#F59E0B'
    : isDone
      ? '#16A34A'
      : isPickup
        ? '#EF4444'
        : '#3B82F6'

  const sz = isDone ? 28 : isNext ? 44 : 36
  const label = pt.recommendedOrder != null ? String(pt.recommendedOrder) : isPickup ? 'A' : 'B'
  const fontSize = isDone ? 10 : isNext ? 16 : 13

  let shadow = '0 2px 8px rgba(0,0,0,0.3)'
  if (isSelected) shadow = `0 0 0 3px white, 0 0 0 6px ${bg}, 0 2px 12px rgba(0,0,0,0.4)`
  else if (isNext) shadow = `0 0 0 3px white, 0 0 0 5px ${bg}, 0 4px 16px rgba(0,0,0,0.35)`

  const pulse = isNext && !isDone && !isAvailable
    ? `<div style="position:absolute;inset:-8px;border-radius:50%;background:${bg};opacity:0.2;animation:ping 1.5s cubic-bezier(0,0,0.2,1) infinite;"></div>`
    : ''

  const markerOpacity = isDone ? 0.95 : 1
  const timeLabel = formatRideTime(pt)
  const timeFont = isDone ? 9 : isNext ? 11 : 10
  const totalW = Math.max(sz, 42)
  const totalH = sz + 18

  return L.divIcon({
    className: '',
    html: `<div style="position:relative;display:flex;flex-direction:column;align-items:center;width:${totalW}px;">
      ${pulse}
      <div style="position:relative;width:${sz}px;height:${sz}px;border-radius:50%;background:${bg};color:white;display:flex;align-items:center;justify-content:center;font-size:${fontSize}px;font-weight:800;box-shadow:${shadow};opacity:${markerOpacity};transition:transform 0.15s,box-shadow 0.15s;transform:${isSelected ? 'scale(1.1)' : 'scale(1)'};">${label}</div>
      <div style="margin-top:3px;padding:2px 6px;border-radius:6px;background:#fff;color:#111827;font-size:${timeFont}px;font-weight:800;line-height:1;white-space:nowrap;box-shadow:0 1px 5px rgba(0,0,0,0.22);border:1px solid rgba(0,0,0,0.08);font-family:Inter,system-ui,sans-serif;">${timeLabel}</div>
    </div>`,
    iconSize: [totalW, totalH],
    iconAnchor: [totalW / 2, sz / 2],
  })
}

function FitBoundsOnce({
  points,
  driverLocation,
  mapInsetTop = 108,
}: {
  points: DriverMapPoint[]
  driverLocation: LatLng | null
  mapInsetTop?: number
}) {
  const map = useMap()
  const fitted = useRef(false)

  useEffect(() => {
    if (fitted.current) return
    const latlngs: [number, number][] = points.map((p) => [p.latLng.lat, p.latLng.lng])
    if (driverLocation) latlngs.push([driverLocation.lat, driverLocation.lng])
    if (latlngs.length === 0) return
    map.fitBounds(L.latLngBounds(latlngs), {
      paddingTopLeft: [24, mapInsetTop],
      paddingBottomRight: [24, 70],
      maxZoom: 15,
    })
    fitted.current = true
  }, [map, points, driverLocation, mapInsetTop])

  return null
}

function FlyToSelected({ points, selectedPointId }: { points: DriverMapPoint[]; selectedPointId: string | null }) {
  const map = useMap()
  const prevId = useRef<string | null>(null)

  useEffect(() => {
    if (!selectedPointId || selectedPointId === prevId.current) return
    prevId.current = selectedPointId
    const pt = points.find((p) => p.id === selectedPointId)
    if (!pt) return
    map.flyTo([pt.latLng.lat, pt.latLng.lng], Math.max(map.getZoom(), 15), { duration: 0.4 })
  }, [map, points, selectedPointId])

  return null
}

function LocateButton() {
  const { t } = useTranslation()
  const map = useMap()
  return (
    <button
      onClick={() => {
        if (!navigator.geolocation) return
        navigator.geolocation.getCurrentPosition(
          (pos) => map.flyTo([pos.coords.latitude, pos.coords.longitude], 15, { duration: 0.5 }),
          () => {},
          { enableHighAccuracy: true, timeout: 8000 },
        )
      }}
      className="absolute bottom-6 right-4 z-[1000] w-12 h-12 bg-white rounded-2xl shadow-card flex items-center justify-center active:scale-95 transition-transform touch-none"
      title={t('common.myLocation', { defaultValue: 'My location' })}
    >
      <Crosshair size={22} weight="bold" />
    </button>
  )
}

export default function DriverMap({
  points,
  selectedPointId,
  nextPointId,
  driverLocation,
  mapInsetTop,
  onSelectPoint,
  onPointDragEnd,
  onMapMarkViewModeChange,
}: DriverMapProps) {
  const { t } = useTranslation()
  const [publicMapMarks, setPublicMapMarks] = useState<MapMark[]>([])
  const [openedPublicMarkId, setOpenedPublicMarkId] = useState<string | null>(null)
  const [fullscreenPhoto, setFullscreenPhoto] = useState<{ src: string; title: string } | null>(null)
  // Dragged point waits for explicit save/cancel instead of hitting the API immediately.
  const [dragPreview, setDragPreview] = useState<{
    pointId: string
    rideId: string
    pointType: 'pickup' | 'dropoff'
    latlng: LatLng
  } | null>(null)
  const isMapMarkViewMode = Boolean(openedPublicMarkId || fullscreenPhoto)

  useEffect(() => {
    onMapMarkViewModeChange?.(isMapMarkViewMode)
  }, [isMapMarkViewMode, onMapMarkViewModeChange])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const page = await listPublicMapMarks('cookie', { limit: 300, offset: 0 })
        if (!cancelled) setPublicMapMarks(page.items)
      } catch {
        if (!cancelled) setPublicMapMarks([])
      }
    })()
    return () => { cancelled = true }
  }, [])

  const rideLines = useMemo(() => {
    const byRide = new Map<string, { pickup?: DriverMapPoint; dropoff?: DriverMapPoint }>()
    for (const pt of points) {
      if (!byRide.has(pt.rideId)) byRide.set(pt.rideId, {})
      const entry = byRide.get(pt.rideId)!
      if (pt.pointType === 'pickup') entry.pickup = pt
      else entry.dropoff = pt
    }
    return [...byRide.values()]
  }, [points])

  const defaultCenter: [number, number] = useMemo(() => {
    if (driverLocation) return [driverLocation.lat, driverLocation.lng]
    const first = points.find((p) => p.pointStatus !== 'done')
    if (first) return [first.latLng.lat, first.latLng.lng]
    if (points.length > 0) return [points[0].latLng.lat, points[0].latLng.lng]
    return getDefaultMapCenterTuple()
  }, [points, driverLocation])

  return (
    <MapContainer
      center={defaultCenter}
      zoom={13}
      style={{ width: '100%', height: '100%' }}
      zoomControl={false}
      attributionControl={false}
    >
      <style>{`@keyframes ping{75%,100%{transform:scale(2);opacity:0}}`}</style>
      <LocalizedTileLayer />
      <FitBoundsOnce points={points} driverLocation={driverLocation} mapInsetTop={mapInsetTop} />
      <FlyToSelected points={points} selectedPointId={selectedPointId} />
      {!isMapMarkViewMode && <LocateButton />}

      {/* Driver location */}
      {driverLocation && (
        <CircleMarker
          center={[driverLocation.lat, driverLocation.lng]}
          radius={8}
          pathOptions={{ color: '#fff', fillColor: '#2563EB', fillOpacity: 1, weight: 3 }}
        />
      )}

      {/* Dashed A→B lines per ride */}
      {rideLines.map(({ pickup, dropoff }) => {
        if (!pickup || !dropoff) return null
        const isAvailable = pickup.pointKind === 'available'
        const isDone = !isAvailable && pickup.pointStatus === 'done' && dropoff.pointStatus === 'done'
        const isHighlighted = selectedPointId === pickup.id || selectedPointId === dropoff.id
          || (!isAvailable && (nextPointId === pickup.id || nextPointId === dropoff.id))
        const lineColor = isAvailable
          ? isHighlighted ? '#D97706' : '#F59E0B'
          : isDone
            ? '#16A34A'
            : isHighlighted
              ? '#111827'
              : '#6B7280'
        return (
          <Polyline
            key={`line-${pickup.rideId}`}
            positions={[
              [pickup.latLng.lat, pickup.latLng.lng],
              [dropoff.latLng.lat, dropoff.latLng.lng],
            ]}
            pathOptions={{
              color: lineColor,
              weight: isHighlighted ? 2.5 : 1.5,
              dashArray: '7, 7',
              opacity: isAvailable ? (isHighlighted ? 0.85 : 0.55) : isDone ? 0.2 : isHighlighted ? 0.7 : 0.4,
            }}
          />
        )
      })}

      {/* Public map marks visible to drivers */}
      {publicMapMarks.map((mark) => (
        <Marker
          key={`public-map-mark-${mark.id}`}
          position={[mark.position.lat, mark.position.lng]}
          icon={makeMapMarkIcon(mark.color, 30)}
          eventHandlers={{
            popupopen: () => setOpenedPublicMarkId(mark.id),
            popupclose: () => setOpenedPublicMarkId((current) => (current === mark.id ? null : current)),
          }}
        >
          <Popup autoPan className="map-mark-popup">
            <div className="text-xs min-w-[min(220px,70vw)] max-w-[80vw]">
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
                    className="w-full h-auto max-h-[220px] object-cover"
                  />
                </button>
              )}
            </div>
          </Popup>
        </Marker>
      ))}

      {/* Point markers */}
      {points.map((pt) => {
        const preview = dragPreview?.pointId === pt.id ? dragPreview : null
        return (
          <Marker
            key={pt.id}
            position={preview ? [preview.latlng.lat, preview.latlng.lng] : [pt.latLng.lat, pt.latLng.lng]}
            icon={makePointIcon(pt, {
              isSelected: pt.id === selectedPointId,
              isNext: pt.id === nextPointId && pt.pointStatus !== 'done',
            })}
            draggable={pt.canEdit && pt.pointKind !== 'available'}
            eventHandlers={{
              click: () => {
                if (dragPreview) return
                onSelectPoint(pt)
              },
              dragend: (e) => {
                const m = e.target as L.Marker
                const pos = m.getLatLng()
                setDragPreview({
                  pointId: pt.id,
                  rideId: pt.rideId,
                  pointType: pt.pointType,
                  latlng: { lat: pos.lat, lng: pos.lng },
                })
              },
            }}
          />
        )
      })}

      {/* Drag preview confirm bar */}
      {dragPreview && (
        <div
          className="absolute left-4 right-4 z-[1100] bg-white rounded-card shadow-card p-4 space-y-3 md:max-w-md md:mx-auto"
          style={{ bottom: 'calc(var(--app-safe-area-bottom-total, 0px) + 24px)' }}
        >
          <p className="text-sm font-bold leading-snug">
            {t('driver.dragPreviewTitle', { defaultValue: 'Save new point position?' })}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setDragPreview(null)}
              className="flex-1 h-11 rounded-xl bg-surface text-sm font-bold"
            >
              {t('common.cancel', { defaultValue: 'Cancel' })}
            </button>
            <button
              type="button"
              onClick={() => {
                onPointDragEnd(dragPreview.rideId, dragPreview.pointType, dragPreview.latlng)
                setDragPreview(null)
              }}
              className="flex-1 h-11 rounded-xl bg-black text-white text-sm font-bold active:scale-[0.98] transition-transform"
            >
              {t('common.save', { defaultValue: 'Save' })}
            </button>
          </div>
        </div>
      )}

      {fullscreenPhoto && (
        <div
          className="fixed inset-0 z-[3200] bg-black/90 flex items-center justify-center p-4"
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
    </MapContainer>
  )
}
