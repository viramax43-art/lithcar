import { useEffect, useMemo, useRef } from 'react'
import { CircleMarker, MapContainer, Marker, Polyline, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import { Crosshair } from '@phosphor-icons/react'

import type { DriverMapPoint, LatLng } from '../../../types'

interface DriverMapProps {
  points: DriverMapPoint[]
  selectedPointId: string | null
  nextPointId: string | null
  driverLocation: LatLng | null
  roadPolyline: LatLng[]
  onSelectPoint: (point: DriverMapPoint) => void
  onPickupDragEnd: (rideId: string, latlng: LatLng) => void
}

function makePointIcon(pt: DriverMapPoint, opts: { isSelected: boolean; isNext: boolean }): L.DivIcon {
  const { isSelected, isNext } = opts
  const isDone = pt.pointStatus === 'done'
  const isPickup = pt.pointType === 'pickup'

  // Driver flow color semantics:
  // - Blue: heading to pickup
  // - Red: heading to dropoff
  // - Green: completed point
  const bg = isDone ? '#16A34A' : isPickup ? '#2563EB' : '#DC2626'

  const sz = isDone ? 28 : isNext ? 44 : 36
  const label = pt.recommendedOrder != null ? String(pt.recommendedOrder) : isPickup ? 'A' : 'B'
  const fontSize = isDone ? 10 : isNext ? 16 : 13

  let shadow = '0 2px 8px rgba(0,0,0,0.3)'
  if (isSelected) shadow = `0 0 0 3px white, 0 0 0 6px ${bg}, 0 2px 12px rgba(0,0,0,0.4)`
  else if (isNext) shadow = `0 0 0 3px white, 0 0 0 5px ${bg}, 0 4px 16px rgba(0,0,0,0.35)`

  const pulse = isNext && !isDone
    ? `<div style="position:absolute;inset:-8px;border-radius:50%;background:${bg};opacity:0.2;animation:ping 1.5s cubic-bezier(0,0,0.2,1) infinite;"></div>`
    : ''

  return L.divIcon({
    className: '',
    html: `<div style="position:relative;width:${sz}px;height:${sz}px;">
      ${pulse}
      <div style="position:relative;width:${sz}px;height:${sz}px;border-radius:50%;background:${bg};color:white;display:flex;align-items:center;justify-content:center;font-size:${fontSize}px;font-weight:800;box-shadow:${shadow};opacity:${isDone ? 0.45 : 1};transition:transform 0.15s,box-shadow 0.15s;transform:${isSelected ? 'scale(1.1)' : 'scale(1)'};">${label}</div>
    </div>`,
    iconSize: [sz, sz],
    iconAnchor: [sz / 2, sz / 2],
  })
}

function FitBoundsOnce({ points, driverLocation }: { points: DriverMapPoint[]; driverLocation: LatLng | null }) {
  const map = useMap()
  const fitted = useRef(false)

  useEffect(() => {
    if (fitted.current) return
    const latlngs: [number, number][] = points.map((p) => [p.latLng.lat, p.latLng.lng])
    if (driverLocation) latlngs.push([driverLocation.lat, driverLocation.lng])
    if (latlngs.length === 0) return
    map.fitBounds(L.latLngBounds(latlngs), { padding: [70, 70], maxZoom: 15 })
    fitted.current = true
  }, [map, points, driverLocation])

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
      title="Моё местоположение"
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
  roadPolyline,
  onSelectPoint,
  onPickupDragEnd,
}: DriverMapProps) {
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
    return [54.687, 25.28]
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
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <FitBoundsOnce points={points} driverLocation={driverLocation} />
      <FlyToSelected points={points} selectedPointId={selectedPointId} />
      <LocateButton />

      {/* Driver location */}
      {driverLocation && (
        <CircleMarker
          center={[driverLocation.lat, driverLocation.lng]}
          radius={8}
          pathOptions={{ color: '#fff', fillColor: '#2563EB', fillOpacity: 1, weight: 3 }}
        />
      )}

      {/* Primary route by roads */}
      {roadPolyline.length > 1 && (
        <Polyline
          positions={roadPolyline.map((p) => [p.lat, p.lng])}
          pathOptions={{
            color: '#111827',
            weight: 4,
            opacity: 0.75,
          }}
        />
      )}

      {/* Fallback dashed A→B lines when road route is unavailable */}
      {roadPolyline.length <= 1 && rideLines.map(({ pickup, dropoff }) => {
        if (!pickup || !dropoff) return null
        const isDone = pickup.pointStatus === 'done' && dropoff.pointStatus === 'done'
        const isHighlighted = selectedPointId === pickup.id || selectedPointId === dropoff.id
          || nextPointId === pickup.id || nextPointId === dropoff.id
        return (
          <Polyline
            key={`line-${pickup.rideId}`}
            positions={[
              [pickup.latLng.lat, pickup.latLng.lng],
              [dropoff.latLng.lat, dropoff.latLng.lng],
            ]}
            pathOptions={{
              color: isDone ? '#16A34A' : isHighlighted ? '#111827' : '#6B7280',
              weight: isHighlighted ? 2.5 : 1.5,
              dashArray: '7, 7',
              opacity: isDone ? 0.2 : isHighlighted ? 0.7 : 0.4,
            }}
          />
        )
      })}

      {/* Point markers */}
      {points.map((pt) => (
        <Marker
          key={pt.id}
          position={[pt.latLng.lat, pt.latLng.lng]}
          icon={makePointIcon(pt, {
            isSelected: pt.id === selectedPointId,
            isNext: pt.id === nextPointId,
          })}
          draggable={pt.canEdit}
          eventHandlers={{
            click: () => onSelectPoint(pt),
            dragend: (e) => {
              const m = e.target as L.Marker
              const pos = m.getLatLng()
              onPickupDragEnd(pt.rideId, { lat: pos.lat, lng: pos.lng })
            },
          }}
        />
      ))}
    </MapContainer>
  )
}
