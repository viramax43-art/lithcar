import { useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, Marker, Polyline, Popup, useMap } from 'react-leaflet'
import LocalizedTileLayer from '../../../components/LocalizedTileLayer'
import L from 'leaflet'
import { X } from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'

import { formatRideTime } from '../../../i18n/dateTime'
import { listPublicMapMarks } from '../../../lib/backend'
import { makeMapMarkIcon } from '../../../lib/mapMarkIcons'
import { getDefaultMapCenterTuple } from '../../../lib/mapRegion'
import type { DriverMapPoint, LatLng, MapMark, PassengerLiveLocation } from '../../../types'

interface DriverMapProps {
  points: DriverMapPoint[]
  selectedPointId: string | null
  nextPointId: string | null
  driverLocation: LatLng | null
  driverHeading?: number | null
  driverLabel?: string
  passengerLocations?: PassengerLiveLocation[]
  mapInsetTop?: number
  /** Increment to re-center the map on the driver (locate button). */
  locateTick?: number
  onSelectPoint: (point: DriverMapPoint) => void
  onPointDragEnd: (rideId: string, pointType: 'pickup' | 'dropoff', latlng: LatLng) => void
  onMapMarkViewModeChange?: (isViewing: boolean) => void
}

function makePassengerLiveIcon(name: string): L.DivIcon {
  const initial = (name.trim()[0] ?? 'P').toUpperCase()
  return L.divIcon({
    className: '',
    html: `<div style="position:relative;width:40px;height:48px;display:flex;flex-direction:column;align-items:center;">
      <div style="width:34px;height:34px;border-radius:50%;background:#111827;color:#fff;border:3px solid #fff;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;box-shadow:0 2px 10px rgba(0,0,0,0.28);font-family:Inter,system-ui,sans-serif;">${initial}</div>
      <div style="margin-top:2px;width:10px;height:10px;border-radius:50%;background:#2563EB;border:2px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,0.25);"></div>
    </div>`,
    iconSize: [40, 48],
    iconAnchor: [20, 42],
  })
}

function makeDriverIcon(label: string, heading: number | null | undefined): L.DivIcon {
  const initial = (label.trim()[0] ?? '?').toUpperCase()
  const rotation = heading != null && Number.isFinite(heading) ? heading : 0
  const cone = heading != null && Number.isFinite(heading)
    ? `<div style="position:absolute;left:50%;bottom:18px;width:0;height:0;border-left:14px solid transparent;border-right:14px solid transparent;border-bottom:28px solid rgba(37,99,235,0.28);transform:translateX(-50%) rotate(${rotation}deg);transform-origin:50% 100%;"></div>`
    : ''

  return L.divIcon({
    className: '',
    html: `<div style="position:relative;width:48px;height:52px;display:flex;align-items:flex-end;justify-content:center;">
      ${cone}
      <div style="position:relative;width:40px;height:40px;border-radius:50%;background:#2563EB;color:#fff;border:3px solid #fff;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:800;box-shadow:0 2px 10px rgba(0,0,0,0.28);font-family:Inter,system-ui,sans-serif;">${initial}</div>
    </div>`,
    iconSize: [48, 52],
    iconAnchor: [24, 26],
  })
}

function makePointIcon(pt: DriverMapPoint, opts: { isSelected: boolean; isNext: boolean }): L.DivIcon {
  const { isSelected, isNext } = opts
  const isDone = pt.pointStatus === 'done'
  const isPickup = pt.pointType === 'pickup'
  const isAvailable = pt.pointKind === 'available'

  // Like passenger: start + destination both visible.
  // Free: amber A (with time) / blue B (no time). Yours: red pickup / blue dropoff.
  const bg = isDone
    ? '#16A34A'
    : isAvailable
      ? (isPickup ? '#F59E0B' : '#3B82F6')
      : isPickup
        ? '#EF4444'
        : '#3B82F6'

  const sz = isDone ? 28 : isNext ? 44 : 36
  const label = isAvailable
    ? isPickup ? 'A' : 'B'
    : pt.passengerNumber != null
      ? String(pt.passengerNumber)
      : isPickup ? 'A' : 'B'
  const fontSize = isDone ? 10 : isNext ? 16 : 13

  let shadow = '0 2px 8px rgba(0,0,0,0.3)'
  if (isSelected) shadow = `0 0 0 3px white, 0 0 0 6px ${bg}, 0 2px 12px rgba(0,0,0,0.4)`
  else if (isNext) shadow = `0 0 0 3px white, 0 0 0 5px ${bg}, 0 4px 16px rgba(0,0,0,0.35)`

  const pulse = isNext && !isDone && !isAvailable
    ? `<div style="position:absolute;inset:-8px;border-radius:50%;background:${bg};opacity:0.2;animation:ping 1.5s cubic-bezier(0,0,0.2,1) infinite;"></div>`
    : ''

  const markerOpacity = isDone ? 0.95 : 1
  // Departure time only on pickup — same clock on B confuses free futures.
  const timeLabel = isPickup ? formatRideTime(pt) : ''
  const timeFont = isDone ? 9 : isNext ? 11 : 10
  const totalW = Math.max(sz, 42)
  const totalH = timeLabel ? sz + 18 : sz
  const timeHtml = timeLabel
    ? `<div style="margin-top:3px;padding:2px 6px;border-radius:6px;background:#fff;color:#111827;font-size:${timeFont}px;font-weight:800;line-height:1;white-space:nowrap;box-shadow:0 1px 5px rgba(0,0,0,0.22);border:1px solid rgba(0,0,0,0.08);font-family:Inter,system-ui,sans-serif;">${timeLabel}</div>`
    : ''

  return L.divIcon({
    className: '',
    html: `<div style="position:relative;display:flex;flex-direction:column;align-items:center;width:${totalW}px;">
      ${pulse}
      <div style="position:relative;width:${sz}px;height:${sz}px;border-radius:50%;background:${bg};color:white;display:flex;align-items:center;justify-content:center;font-size:${fontSize}px;font-weight:800;box-shadow:${shadow};opacity:${markerOpacity};transition:transform 0.15s,box-shadow 0.15s;transform:${isSelected ? 'scale(1.1)' : 'scale(1)'};">${label}</div>
      ${timeHtml}
    </div>`,
    iconSize: [totalW, totalH],
    iconAnchor: [totalW / 2, sz / 2],
  })
}

function CenterOnDriver({
  driverLocation,
  mapInsetTop = 108,
  locateTick = 0,
}: {
  driverLocation: LatLng | null
  mapInsetTop?: number
  locateTick?: number
}) {
  const map = useMap()
  const centered = useRef(false)
  const lastLocateTick = useRef(0)

  useEffect(() => {
    if (centered.current || !driverLocation) return
    map.setView([driverLocation.lat, driverLocation.lng], 15, { animate: false })
    map.panBy([0, mapInsetTop / 4])
    centered.current = true
  }, [map, driverLocation, mapInsetTop])

  useEffect(() => {
    if (!driverLocation || locateTick <= 0 || locateTick === lastLocateTick.current) return
    lastLocateTick.current = locateTick
    map.flyTo([driverLocation.lat, driverLocation.lng], Math.max(map.getZoom(), 15), { duration: 0.45 })
  }, [map, driverLocation, locateTick])

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

export default function DriverMap({
  points,
  selectedPointId,
  nextPointId,
  driverLocation,
  driverHeading,
  driverLabel = '',
  passengerLocations = [],
  mapInsetTop,
  locateTick = 0,
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

  const directionLines = useMemo(() => {
    if (!driverLocation) return []
    return rideLines
      .map(({ pickup, dropoff }) => {
        if (!pickup || pickup.pointStatus === 'done') return null
        // Driver → pickup leg. The A→B leg itself is drawn by `rideLines` below,
        // including for free futures (available points ship both pickup and dropoff).
        const target = pickup
        if (target.pointStatus === 'done') return null
        const isAvailable = pickup.pointKind === 'available'
        const isHighlighted = selectedPointId === pickup.id || selectedPointId === dropoff?.id
        return {
          key: `dir-${pickup.rideId}`,
          positions: [
            [driverLocation.lat, driverLocation.lng],
            [target.latLng.lat, target.latLng.lng],
          ] as [number, number][],
          color: isAvailable ? '#F59E0B' : '#EF4444',
          opacity: isHighlighted ? 0.75 : 0.35,
        }
      })
      .filter(Boolean) as Array<{
        key: string
        positions: [number, number][]
        color: string
        opacity: number
      }>
  }, [driverLocation, rideLines, selectedPointId])

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
      <CenterOnDriver
        driverLocation={driverLocation}
        mapInsetTop={mapInsetTop}
        locateTick={locateTick}
      />
      <FlyToSelected points={points} selectedPointId={selectedPointId} />

      {/* Lines from driver to nearby orders — helps compare direction vs proximity */}
      {directionLines.map((line) => (
        <Polyline
          key={line.key}
          positions={line.positions}
          pathOptions={{
            color: line.color,
            weight: 1.5,
            dashArray: '4, 8',
            opacity: line.opacity,
          }}
        />
      ))}

      {/* Driver location with heading cone */}
      {driverLocation && (
        <Marker
          position={[driverLocation.lat, driverLocation.lng]}
          icon={makeDriverIcon(driverLabel, driverHeading)}
          zIndexOffset={1000}
        />
      )}

      {/* Passenger live GPS from server JSON */}
      {passengerLocations.map((item) => (
        <Marker
          key={`passenger-live-${item.rideId}`}
          position={[item.latLng.lat, item.latLng.lng]}
          icon={makePassengerLiveIcon(item.passengerName)}
          zIndexOffset={900}
        />
      ))}

      {/* Dashed A→B — free futures and assigned rides (same idea as passenger map) */}
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
              opacity: isAvailable
                ? (isHighlighted ? 0.85 : 0.55)
                : isDone
                  ? 0.2
                  : isHighlighted
                    ? 0.7
                    : 0.4,
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
          /*
            Driver may only move the pickup point (A) — the backend asks the passenger
            to confirm that change. The destination (B) belongs to the passenger request
            and is never draggable in the driver shell.
          */
          <Marker
            key={pt.id}
            position={preview ? [preview.latlng.lat, preview.latlng.lng] : [pt.latLng.lat, pt.latLng.lng]}
            icon={makePointIcon(pt, {
              isSelected: pt.id === selectedPointId,
              isNext: pt.id === nextPointId && pt.pointStatus !== 'done',
            })}
            draggable={pt.canEdit && pt.pointKind !== 'available' && pt.pointType === 'pickup'}
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
