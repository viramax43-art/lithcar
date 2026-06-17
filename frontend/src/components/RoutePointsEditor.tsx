import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import { MapContainer, Marker, Polyline, useMap, useMapEvents } from 'react-leaflet'
import LocalizedTileLayer from './LocalizedTileLayer'
import { useTranslation } from 'react-i18next'
import type { LatLng } from '../types'
import { reverseGeocode } from '../lib/geocode'

export type RouteActivePoint = 'from' | 'to'

export interface RoutePointsValue {
  fromAddress: string
  fromLatLng: LatLng
  toAddress: string
  toLatLng: LatLng
}

const iconA = L.divIcon({
  className: '',
  html: '<div class="marker-a">A</div>',
  iconSize: [36, 36],
  iconAnchor: [18, 18],
})
const iconB = L.divIcon({
  className: '',
  html: '<div class="marker-b">B</div>',
  iconSize: [36, 36],
  iconAnchor: [18, 18],
})
const iconADim = L.divIcon({
  className: '',
  html: '<div class="marker-a-sm"></div>',
  iconSize: [16, 16],
  iconAnchor: [8, 8],
})
const iconBDim = L.divIcon({
  className: '',
  html: '<div class="marker-b-sm"></div>',
  iconSize: [16, 16],
  iconAnchor: [8, 8],
})

function FitBoundsOnce({ from, to }: { from: LatLng; to: LatLng }) {
  const map = useMap()
  const did = useRef(false)
  useEffect(() => {
    if (did.current) return
    const bounds = L.latLngBounds([from.lat, from.lng], [to.lat, to.lng])
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 })
    did.current = true
  }, [from.lat, from.lng, to.lat, to.lng, map])
  return null
}

function MapClickHandler({ onPick }: { onPick: (latlng: LatLng) => void }) {
  useMapEvents({
    click(event) {
      onPick({ lat: event.latlng.lat, lng: event.latlng.lng })
    },
  })
  return null
}

interface RoutePointsEditorProps {
  value: RoutePointsValue
  onChange: (value: RoutePointsValue) => void
  mapHeightClassName?: string
}

export default function RoutePointsEditor({
  value,
  onChange,
  mapHeightClassName = 'h-56',
}: RoutePointsEditorProps) {
  const { t } = useTranslation()
  const [active, setActive] = useState<RouteActivePoint>('from')

  const movePoint = async (point: RouteActivePoint, latlng: LatLng) => {
    const next = { ...value }
    if (point === 'from') next.fromLatLng = latlng
    else next.toLatLng = latlng
    onChange(next)
    try {
      const address = await reverseGeocode(latlng)
      if (!address) return
      if (point === 'from') next.fromAddress = address
      else next.toAddress = address
      onChange({ ...next })
    } catch {
      // keep coordinates even if geocode fails
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 p-1 bg-surface rounded-xl">
        <button
          type="button"
          onClick={() => setActive('from')}
          className={`py-1.5 rounded-lg text-xs font-bold transition-all inline-flex items-center justify-center gap-1.5 ${
            active === 'from' ? 'bg-white shadow-sm text-black' : 'text-muted hover:text-black'
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-point-a" />
          {t('driver.fromPointA', { defaultValue: 'Point A' })}
        </button>
        <button
          type="button"
          onClick={() => setActive('to')}
          className={`py-1.5 rounded-lg text-xs font-bold transition-all inline-flex items-center justify-center gap-1.5 ${
            active === 'to' ? 'bg-white shadow-sm text-black' : 'text-muted hover:text-black'
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-point-b" />
          {t('driver.toPointB', { defaultValue: 'Point B' })}
        </button>
      </div>

      <div className={`${mapHeightClassName} rounded-xl overflow-hidden border border-border`}>
        <MapContainer
          center={[value.fromLatLng.lat, value.fromLatLng.lng]}
          zoom={13}
          style={{ width: '100%', height: '100%' }}
          zoomControl={false}
          attributionControl={false}
        >
          <LocalizedTileLayer />
          <FitBoundsOnce from={value.fromLatLng} to={value.toLatLng} />
          <MapClickHandler onPick={(latlng) => void movePoint(active, latlng)} />
          <Marker
            position={[value.fromLatLng.lat, value.fromLatLng.lng]}
            icon={active === 'from' ? iconA : iconADim}
            draggable
            eventHandlers={{
              dragend(event) {
                const marker = event.target as L.Marker
                const pos = marker.getLatLng()
                void movePoint('from', { lat: pos.lat, lng: pos.lng })
              },
              click() {
                setActive('from')
              },
            }}
          />
          <Marker
            position={[value.toLatLng.lat, value.toLatLng.lng]}
            icon={active === 'to' ? iconB : iconBDim}
            draggable
            eventHandlers={{
              dragend(event) {
                const marker = event.target as L.Marker
                const pos = marker.getLatLng()
                void movePoint('to', { lat: pos.lat, lng: pos.lng })
              },
              click() {
                setActive('to')
              },
            }}
          />
          <Polyline
            positions={[
              [value.fromLatLng.lat, value.fromLatLng.lng],
              [value.toLatLng.lat, value.toLatLng.lng],
            ]}
            pathOptions={{ color: '#000', weight: 2.5, dashArray: '8, 8', opacity: 0.7 }}
          />
        </MapContainer>
      </div>

      <label className="block space-y-1.5">
        <span className="text-xs font-semibold text-muted">
          {t('passenger.fromLabel', { defaultValue: 'Pickup' })}
        </span>
        <input
          type="text"
          value={value.fromAddress}
          onChange={(e) => onChange({ ...value, fromAddress: e.target.value })}
          className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-black/10"
        />
      </label>

      <label className="block space-y-1.5">
        <span className="text-xs font-semibold text-muted">
          {t('passenger.toLabel', { defaultValue: 'Destination' })}
        </span>
        <input
          type="text"
          value={value.toAddress}
          onChange={(e) => onChange({ ...value, toAddress: e.target.value })}
          className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-black/10"
        />
      </label>
    </div>
  )
}
