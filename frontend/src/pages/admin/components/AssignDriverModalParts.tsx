import { useEffect, useRef } from 'react'
import L from 'leaflet'
import { Check, MapPin } from '@phosphor-icons/react'
import { MapContainer, Marker, Polyline, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import type { LatLng, RideRequest } from '../../../types'

export type ActivePoint = 'from' | 'to'

export interface RideDraft {
  requestId: string
  fromAddress: string
  fromLatLng: LatLng
  toAddress: string
  toLatLng: LatLng
  active: ActivePoint
  originalFromAddress: string
  originalFromLatLng: LatLng
  originalToAddress: string
  originalToLatLng: LatLng
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

export function isOverridden(draft: RideDraft): boolean {
  return (
    Math.abs(draft.fromLatLng.lat - draft.originalFromLatLng.lat) > 1e-6 ||
    Math.abs(draft.fromLatLng.lng - draft.originalFromLatLng.lng) > 1e-6 ||
    Math.abs(draft.toLatLng.lat - draft.originalToLatLng.lat) > 1e-6 ||
    Math.abs(draft.toLatLng.lng - draft.originalToLatLng.lng) > 1e-6 ||
    draft.fromAddress.trim() !== draft.originalFromAddress.trim() ||
    draft.toAddress.trim() !== draft.originalToAddress.trim()
  )
}

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

export function StepBadge({
  n,
  label,
  active,
  done,
}: {
  n: number
  label: string
  active: boolean
  done: boolean
}) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span
        className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0 transition-colors ${
          done ? 'bg-accent text-black' : active ? 'bg-black text-white' : 'bg-surface text-muted'
        }`}
      >
        {done ? <Check size={12} /> : n}
      </span>
      <span className={`text-xs font-semibold truncate ${active || done ? 'text-black' : 'text-muted'}`}>{label}</span>
    </div>
  )
}

export function RideDraftCard({
  index,
  request,
  draft,
  onSetActive,
  onMovePoint,
  onDragMarker,
  onChangeAddress,
  onReset,
}: {
  index: number
  request: RideRequest
  draft: RideDraft
  onSetActive: (active: ActivePoint) => void
  onMovePoint: (latlng: LatLng) => void
  onDragMarker: (point: ActivePoint, latlng: LatLng) => void
  onChangeAddress: (point: ActivePoint, value: string) => void
  onReset: () => void
}) {
  const edited = isOverridden(draft)
  return (
    <div className="bg-white rounded-card border border-border overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center gap-3">
        <span className="inline-flex items-center justify-center w-6 h-6 rounded-pill bg-surface text-[11px] font-bold flex-shrink-0">
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold truncate">{request.passengerName}</p>
        </div>
        {edited && (
          <button
            onClick={onReset}
            className="text-[10px] font-semibold px-2.5 py-1 rounded-pill bg-surface hover:bg-border transition-colors flex-shrink-0"
          >
            Сбросить
          </button>
        )}
      </div>

      <div className="px-4 pt-3">
        <div className="grid grid-cols-2 gap-2 p-1 bg-surface rounded-xl">
          <button
            onClick={() => onSetActive('from')}
            className={`py-1.5 rounded-lg text-xs font-bold transition-all inline-flex items-center justify-center gap-1.5 ${
              draft.active === 'from' ? 'bg-white shadow-sm text-black' : 'text-muted hover:text-black'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-point-a" />
            Откуда (A)
          </button>
          <button
            onClick={() => onSetActive('to')}
            className={`py-1.5 rounded-lg text-xs font-bold transition-all inline-flex items-center justify-center gap-1.5 ${
              draft.active === 'to' ? 'bg-white shadow-sm text-black' : 'text-muted hover:text-black'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-point-b" />
            Куда (B)
          </button>
        </div>
        <p className="text-[10px] text-muted mt-2 mb-2 px-1">Клик по карте перемещает активную точку. Маркер можно перетаскивать.</p>
      </div>

      <div className="px-4">
        <div className="h-80 lg:h-[26rem] rounded-xl overflow-hidden border border-border relative">
          <MapContainer
            center={[draft.fromLatLng.lat, draft.fromLatLng.lng]}
            zoom={13}
            style={{ width: '100%', height: '100%' }}
            zoomControl={true}
            attributionControl={false}
          >
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <FitBoundsOnce from={draft.fromLatLng} to={draft.toLatLng} />
            <MapClickHandler onPick={onMovePoint} />

            <Marker
              position={[draft.fromLatLng.lat, draft.fromLatLng.lng]}
              icon={draft.active === 'from' ? iconA : iconADim}
              draggable
              eventHandlers={{
                dragend(event) {
                  const m = event.target as L.Marker
                  const pos = m.getLatLng()
                  onDragMarker('from', { lat: pos.lat, lng: pos.lng })
                },
                click() {
                  onSetActive('from')
                },
              }}
            />
            <Marker
              position={[draft.toLatLng.lat, draft.toLatLng.lng]}
              icon={draft.active === 'to' ? iconB : iconBDim}
              draggable
              eventHandlers={{
                dragend(event) {
                  const m = event.target as L.Marker
                  const pos = m.getLatLng()
                  onDragMarker('to', { lat: pos.lat, lng: pos.lng })
                },
                click() {
                  onSetActive('to')
                },
              }}
            />
            <Polyline
              positions={[
                [draft.fromLatLng.lat, draft.fromLatLng.lng],
                [draft.toLatLng.lat, draft.toLatLng.lng],
              ]}
              pathOptions={{ color: '#000', weight: 2.5, dashArray: '8, 8', opacity: 0.7 }}
            />
          </MapContainer>

          {edited && (
            <span className="absolute top-2 left-2 z-[500] px-2 py-1 rounded-pill bg-amber-100 text-amber-800 text-[10px] font-bold shadow">
              Изменено
            </span>
          )}
        </div>
      </div>

      <div className="p-4 space-y-3">
        <AddressField
          color="point-a"
          label="Откуда"
          active={draft.active === 'from'}
          value={draft.fromAddress}
          latlng={draft.fromLatLng}
          onFocus={() => onSetActive('from')}
          onChange={(v) => onChangeAddress('from', v)}
        />
        <AddressField
          color="point-b"
          label="Куда"
          active={draft.active === 'to'}
          value={draft.toAddress}
          latlng={draft.toLatLng}
          onFocus={() => onSetActive('to')}
          onChange={(v) => onChangeAddress('to', v)}
        />
      </div>
    </div>
  )
}

function AddressField({
  color,
  label,
  active,
  value,
  latlng,
  onFocus,
  onChange,
}: {
  color: 'point-a' | 'point-b'
  label: string
  active: boolean
  value: string
  latlng: LatLng
  onFocus: () => void
  onChange: (value: string) => void
}) {
  return (
    <div
      className={`rounded-xl border-[1.5px] px-3 py-2 transition-colors ${
        active ? 'border-black bg-white' : 'border-border bg-surface/30'
      }`}
    >
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-muted mb-1">
        <span className={`w-1.5 h-1.5 rounded-full bg-${color}`} />
        {label}
      </div>
      <input value={value} onChange={(e) => onChange(e.target.value)} onFocus={onFocus} className="w-full text-sm font-medium outline-none bg-transparent" />
      <p className="text-[10px] text-muted font-mono mt-1 flex items-center gap-1">
        <MapPin size={9} />
        {latlng.lat.toFixed(5)}, {latlng.lng.toFixed(5)}
      </p>
    </div>
  )
}
