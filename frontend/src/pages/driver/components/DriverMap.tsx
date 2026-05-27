import { useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet'
import L from 'leaflet'
import { ArrowsOut, ArrowsIn, Crosshair } from '@phosphor-icons/react'

import type { DriverCabinetRide, LatLng } from '../../../types'

interface DriverMapProps {
  rides: DriverCabinetRide[]
  selectedRideId: string | null
  onSelectRide: (id: string) => void
  onMarkerDragEnd: (rideId: string, latlng: LatLng) => void
}

function pickupIcon(index: number, ride: DriverCabinetRide): L.DivIcon {
  const notNotified = ride.pickupChangedByDriver && !ride.pickupNotifiedAt
  const needsConfirm = ride.pickupChangedByDriver && !!ride.pickupNotifiedAt && !ride.pickupConfirmedAt
  const confirmed = ride.pickupChangedByDriver && !!ride.pickupConfirmedAt
  const cls = confirmed ? 'marker-pickup confirmed' : (needsConfirm || notNotified) ? 'marker-pickup pending-confirm' : 'marker-pickup'
  return L.divIcon({
    className: '',
    html: `<div class="${cls}">${index + 1}</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  })
}

const iconB = L.divIcon({
  className: '',
  html: '<div class="marker-b-sm"></div>',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
})

function FitBounds({ rides, selectedRideId }: { rides: DriverCabinetRide[]; selectedRideId: string | null }) {
  const map = useMap()
  const hasFittedRef = useRef(false)

  useEffect(() => {
    if (hasFittedRef.current) return
    if (rides.length === 0) return

    const points: [number, number][] = []
    for (const r of rides) {
      points.push([r.fromLatLng.lat, r.fromLatLng.lng])
      points.push([r.toLatLng.lat, r.toLatLng.lng])
    }
    if (points.length > 0) {
      const bounds = L.latLngBounds(points)
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 })
      hasFittedRef.current = true
    }
  }, [map, rides])

  useEffect(() => {
    if (!selectedRideId) return
    const ride = rides.find((r) => r.id === selectedRideId)
    if (!ride) return
    map.flyTo([ride.fromLatLng.lat, ride.fromLatLng.lng], 15, { duration: 0.5 })
  }, [map, rides, selectedRideId])

  return null
}

function LocateMe() {
  const map = useMap()
  const handleLocate = () => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        map.flyTo([pos.coords.latitude, pos.coords.longitude], 15, { duration: 0.5 })
      },
      () => {},
      { enableHighAccuracy: true, timeout: 8000 },
    )
  }
  return (
    <button
      onClick={handleLocate}
      className="absolute bottom-3 left-3 z-[1000] w-10 h-10 bg-white rounded-xl shadow-card flex items-center justify-center active:scale-95 transition-transform touch-none"
      title="Моё местоположение"
    >
      <Crosshair size={18} weight="bold" />
    </button>
  )
}

export default function DriverMap({ rides, selectedRideId, onSelectRide, onMarkerDragEnd }: DriverMapProps) {
  const [isFullscreen, setIsFullscreen] = useState(false)
  const activeRides = useMemo(
    () => rides.filter((r) => r.status !== 'completed'),
    [rides],
  )

  const defaultCenter: [number, number] = useMemo(() => {
    if (activeRides.length > 0) {
      return [activeRides[0].fromLatLng.lat, activeRides[0].fromLatLng.lng]
    }
    return [54.687, 25.28]
  }, [activeRides])

  if (activeRides.length === 0) {
    return (
      <div className="h-48 bg-surface flex items-center justify-center rounded-card">
        <p className="text-xs text-muted">Нет активных поездок для отображения на карте</p>
      </div>
    )
  }

  return (
    <div className={`w-full rounded-card overflow-hidden shadow-card relative transition-all duration-300 ${
      isFullscreen ? 'driver-map-fullscreen' : 'h-[50vh] min-h-[280px] max-h-[420px]'
    }`}>
      <MapContainer
        center={defaultCenter}
        zoom={13}
        style={{ width: '100%', height: '100%' }}
        zoomControl={false}
        attributionControl={false}
      >
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <FitBounds rides={activeRides} selectedRideId={selectedRideId} />
        <LocateMe />

        {activeRides.map((ride, idx) => {
          const canDrag = ride.status === 'assigned' || ride.status === 'en_route_to_pickup'
          return (
            <Marker
              key={`pickup-${ride.id}`}
              position={[ride.fromLatLng.lat, ride.fromLatLng.lng]}
              icon={pickupIcon(idx, ride)}
              draggable={canDrag}
              eventHandlers={{
                click: () => onSelectRide(ride.id),
                dragend: (e) => {
                  const marker = e.target as L.Marker
                  const pos = marker.getLatLng()
                  onMarkerDragEnd(ride.id, { lat: pos.lat, lng: pos.lng })
                },
              }}
            />
          )
        })}

        {activeRides.map((ride) => (
          <Marker
            key={`dest-${ride.id}`}
            position={[ride.toLatLng.lat, ride.toLatLng.lng]}
            icon={iconB}
          />
        ))}

        {activeRides.map((ride) => (
          <Polyline
            key={`line-${ride.id}`}
            positions={[
              [ride.fromLatLng.lat, ride.fromLatLng.lng],
              [ride.toLatLng.lat, ride.toLatLng.lng],
            ]}
            pathOptions={{
              color: selectedRideId === ride.id ? '#000' : '#888',
              weight: selectedRideId === ride.id ? 3 : 2,
              dashArray: '8, 8',
              opacity: selectedRideId === ride.id ? 0.8 : 0.4,
            }}
          />
        ))}
      </MapContainer>

      {/* Fullscreen toggle */}
      <button
        onClick={() => setIsFullscreen((v) => !v)}
        className="absolute top-3 right-3 z-[1000] w-10 h-10 bg-white rounded-xl shadow-card flex items-center justify-center active:scale-95 transition-transform touch-none"
        title={isFullscreen ? 'Свернуть карту' : 'Развернуть карту'}
      >
        {isFullscreen ? <ArrowsIn size={18} weight="bold" /> : <ArrowsOut size={18} weight="bold" />}
      </button>

      {/* Drag hint on first visit */}
      {activeRides.some((r) => r.status === 'assigned' || r.status === 'en_route_to_pickup') && !isFullscreen && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-[1000] px-3 py-1.5 rounded-pill bg-black/75 text-white text-[10px] font-semibold pointer-events-none">
          Перетаскивайте маркеры для изменения точки подачи
        </div>
      )}
    </div>
  )
}
