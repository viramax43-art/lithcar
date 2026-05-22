import { useCallback, useRef, useState } from 'react'
import L from 'leaflet'
import { Calendar, Car, Clock, ArrowSquareOut, Crosshair, MagnifyingGlass, X } from '@phosphor-icons/react'
import { MapContainer, Marker, Polygon, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet'

import type { Driver, LatLng, RideRequest, ServiceZone } from '../../../types'
import { searchPlaces, type NominatimSearchResult } from '../../../lib/geocode'
import { STATUS_CONFIG } from '../constants'
import { showOnMapHref } from '../../../lib/navigation'

const VILNIUS_CENTER: [number, number] = [54.6872, 25.2797]

interface AdminMapProps {
  requests: RideRequest[]
  serviceZones: ServiceZone[]
  drivers: Driver[]
  isDrawing: boolean
  drawingPoints: LatLng[]
  newZoneColor: string
  selectedReqId: string | null
  onSelectRequest: (requestId: string | null) => void
  onSelectDriver: (driverId: string) => void
  onOpenAssignModal: (requestIds: string[]) => void
  onDrawPoint: (latlng: LatLng) => void
}

function DrawingClickHandler({ onPoint }: { onPoint: (latlng: LatLng) => void }) {
  useMapEvents({
    click(event) {
      onPoint({ lat: event.latlng.lat, lng: event.latlng.lng })
    },
  })
  return null
}

function FlyToHelper({ target }: { target: LatLng | null }) {
  const map = useMap()
  if (target) {
    map.flyTo([target.lat, target.lng], Math.max(map.getZoom(), 15), { duration: 0.6 })
  }
  return null
}

function makeIcon(className: string, label?: string): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `<div class="${className}">${label ?? ''}</div>`,
    iconSize: className.includes('-sm') ? [14, 14] : [36, 36],
    iconAnchor: className.includes('-sm') ? [7, 7] : [18, 18],
  })
}

export default function AdminMap({
  requests,
  serviceZones,
  drivers,
  isDrawing,
  drawingPoints,
  newZoneColor,
  selectedReqId,
  onSelectRequest,
  onSelectDriver,
  onOpenAssignModal,
  onDrawPoint,
}: AdminMapProps) {
  const mapRequests = requests.filter((request) => request.status !== 'completed')
  const selectedReq = mapRequests.find((request) => request.id === selectedReqId) ?? null
  const assignedDriver = selectedReq?.driverId
    ? drivers.find((d) => d.id === selectedReq.driverId) ?? null
    : null
  const status = selectedReq ? STATUS_CONFIG[selectedReq.status] ?? STATUS_CONFIG.pending : null

  const dt = selectedReq ? new Date(selectedReq.dateTime) : null
  const dateStr = dt
    ? dt.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
    : ''
  const timeStr = dt ? dt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : ''

  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<NominatimSearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [flyTarget, setFlyTarget] = useState<LatLng | null>(null)
  const [isLocating, setIsLocating] = useState(false)
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>()
  const searchAbort = useRef<AbortController | null>(null)

  const handleSearchInput = useCallback((query: string) => {
    setSearchQuery(query)
    if (searchTimeout.current) clearTimeout(searchTimeout.current)
    if (searchAbort.current) { searchAbort.current.abort(); searchAbort.current = null }
    if (query.length < 3) { setSearchResults([]); setIsSearching(false); return }
    searchTimeout.current = setTimeout(async () => {
      setIsSearching(true)
      const controller = new AbortController()
      searchAbort.current = controller
      try {
        const data = await searchPlaces(query, controller.signal)
        setSearchResults(data)
      } catch { setSearchResults([]) }
      finally { setIsSearching(false) }
    }, 500)
  }, [])

  const handleSelectResult = useCallback((result: NominatimSearchResult) => {
    const latlng: LatLng = { lat: parseFloat(result.lat), lng: parseFloat(result.lon) }
    setFlyTarget(latlng)
    setTimeout(() => setFlyTarget(null), 1000)
    setSearchOpen(false)
    setSearchQuery('')
    setSearchResults([])
  }, [])

  const handleLocateMe = useCallback(() => {
    if (!navigator.geolocation) return
    setIsLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsLocating(false)
        setFlyTarget({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setTimeout(() => setFlyTarget(null), 1000)
      },
      () => { setIsLocating(false) },
      { enableHighAccuracy: true, timeout: 8000 },
    )
  }, [])

  return (
    <main className="flex-1 relative">
      {/* Search + Geolocation controls */}
      <div className="absolute top-4 left-4 z-[1000] flex items-center gap-2">
        {searchOpen ? (
          <div className="bg-white rounded-card shadow-card flex flex-col w-80 max-h-[50vh] overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
              <MagnifyingGlass size={16} className="text-muted flex-shrink-0" />
              <input
                autoFocus
                value={searchQuery}
                onChange={(e) => handleSearchInput(e.target.value)}
                placeholder="Поиск адреса…"
                className="flex-1 text-sm outline-none bg-transparent min-w-0"
              />
              <button onClick={() => { setSearchOpen(false); setSearchQuery(''); setSearchResults([]) }} className="p-1 hover:bg-surface rounded-lg">
                <X size={14} />
              </button>
            </div>
            <div className="overflow-y-auto max-h-60">
              {isSearching && <p className="px-3 py-2 text-xs text-muted">Ищем…</p>}
              {searchResults.map((r) => (
                <button
                  key={r.place_id}
                  onClick={() => handleSelectResult(r)}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-surface transition-colors border-b border-border/30 last:border-b-0 truncate"
                >
                  {r.display_name}
                </button>
              ))}
              {!isSearching && searchQuery.length >= 3 && searchResults.length === 0 && (
                <p className="px-3 py-2 text-xs text-muted">Ничего не найдено.</p>
              )}
            </div>
          </div>
        ) : (
          <button
            onClick={() => setSearchOpen(true)}
            className="w-10 h-10 bg-white rounded-xl shadow-card flex items-center justify-center hover:bg-surface transition-colors"
            title="Поиск адреса"
          >
            <MagnifyingGlass size={18} weight="bold" />
          </button>
        )}
        <button
          onClick={handleLocateMe}
          disabled={isLocating}
          className="w-10 h-10 bg-white rounded-xl shadow-card flex items-center justify-center hover:bg-surface transition-colors disabled:opacity-60"
          title="Моё местоположение"
        >
          {isLocating ? <span className="w-4 h-4 rounded-full border-[2px] border-border border-t-black animate-spin" /> : <Crosshair size={18} weight="bold" />}
        </button>
      </div>

      <MapContainer center={VILNIUS_CENTER} zoom={12} style={{ width: '100%', height: '100%' }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FlyToHelper target={flyTarget} />

        {mapRequests.map((request) => {
          const highlighted = request.id === selectedReqId
          return (
            <div key={request.id}>
              <Marker
                position={[request.from.latlng.lat, request.from.latlng.lng]}
                icon={makeIcon(highlighted ? 'marker-a' : 'marker-a-sm', highlighted ? 'A' : undefined)}
                eventHandlers={{ click: () => onSelectRequest(request.id) }}
              />
              <Marker
                position={[request.to.latlng.lat, request.to.latlng.lng]}
                icon={makeIcon(highlighted ? 'marker-b' : 'marker-b-sm', highlighted ? 'B' : undefined)}
                eventHandlers={{ click: () => onSelectRequest(request.id) }}
              />
              <Polyline
                positions={[
                  [request.from.latlng.lat, request.from.latlng.lng],
                  [request.to.latlng.lat, request.to.latlng.lng],
                ]}
                pathOptions={{
                  color: highlighted ? '#000' : '#858585',
                  dashArray: '8, 8',
                  weight: highlighted ? 3 : 2,
                  opacity: highlighted ? 0.9 : 0.5,
                }}
              />
            </div>
          )
        })}

        {serviceZones.map((zone) => (
          <Polygon
            key={zone.id}
            positions={zone.polygon.map((point) => [point.lat, point.lng] as [number, number])}
            pathOptions={{
              color: zone.color,
              fillColor: zone.color,
              fillOpacity: zone.isActive ? 0.12 : 0.04,
              opacity: zone.isActive ? 0.8 : 0.3,
            }}
          />
        ))}

        {isDrawing && drawingPoints.length >= 2 && (
          <Polygon
            positions={drawingPoints.map((point) => [point.lat, point.lng] as [number, number])}
            pathOptions={{
              color: newZoneColor,
              fillColor: newZoneColor,
              fillOpacity: 0.15,
              dashArray: '8, 4',
            }}
          />
        )}
        {isDrawing && <DrawingClickHandler onPoint={onDrawPoint} />}

        {drivers
          .filter((driver) => driver.isOnline && driver.currentLocation)
          .map((driver) => (
            <Marker
              key={driver.id}
              position={[driver.currentLocation!.lat, driver.currentLocation!.lng]}
              icon={L.divIcon({
                className: '',
                html: `<div class="marker-driver" title="${driver.name}"></div>`,
                iconSize: [24, 24],
                iconAnchor: [12, 12],
              })}
              eventHandlers={{ click: () => onSelectDriver(driver.id) }}
            >
              <Tooltip
                permanent
                direction="top"
                offset={[0, -10]}
                className="marker-driver-label"
              >
                {driver.name}
              </Tooltip>
            </Marker>
          ))}
      </MapContainer>

      {/* Drawing hint banner */}
      {isDrawing && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] px-4 py-2 rounded-pill bg-black text-white text-xs font-semibold shadow-card animate-fade-in">
          Кликайте по карте, чтобы добавить вершины зоны ({drawingPoints.length})
        </div>
      )}

      {selectedReq && status && (
        <div className="absolute top-4 right-4 w-[340px] bg-white rounded-card shadow-card z-[1000] animate-slide-up overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold truncate">{selectedReq.passengerName}</p>
            </div>
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded-pill flex-shrink-0"
              style={{ color: status.color, background: status.bg }}
            >
              {status.label}
            </span>
            <button
              onClick={() => onSelectRequest(null)}
              className="p-1.5 hover:bg-surface rounded-xl flex-shrink-0 transition-colors -my-1 -mr-1"
            >
              <X size={14} />
            </button>
          </div>

          <div className="px-4 py-3 space-y-3">
            <div className="flex gap-3">
              <div className="flex flex-col items-center pt-1.5 flex-shrink-0">
                <div className="w-2.5 h-2.5 rounded-full bg-point-a" />
                <div className="w-px flex-1 bg-border my-1 min-h-3" />
                <div className="w-2.5 h-2.5 rounded-full bg-point-b" />
              </div>
              <div className="flex-1 min-w-0 text-xs space-y-2.5">
                <a
                  href={showOnMapHref(selectedReq.from.latlng, 'Подача')}
                  target="_blank"
                  rel="noreferrer"
                  className="block group"
                  onClick={(e) => e.stopPropagation()}
                >
                  <p className="text-[10px] font-semibold text-muted uppercase tracking-wider">Откуда</p>
                  <p className="font-medium group-hover:underline inline-flex items-center gap-1">
                    {selectedReq.from.address}
                    <ArrowSquareOut size={10} className="opacity-50 group-hover:opacity-100" />
                  </p>
                </a>
                <a
                  href={showOnMapHref(selectedReq.to.latlng, 'Конечная')}
                  target="_blank"
                  rel="noreferrer"
                  className="block group"
                  onClick={(e) => e.stopPropagation()}
                >
                  <p className="text-[10px] font-semibold text-muted uppercase tracking-wider">Куда</p>
                  <p className="font-medium group-hover:underline inline-flex items-center gap-1">
                    {selectedReq.to.address}
                    <ArrowSquareOut size={10} className="opacity-50 group-hover:opacity-100" />
                  </p>
                </a>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2 border-t border-border text-[11px] text-muted">
              <div className="flex items-center gap-1.5">
                <Calendar size={12} />
                <span>{dateStr}</span>
              </div>
              <div className="w-px h-3 bg-border" />
              <div className="flex items-center gap-1.5">
                <Clock size={12} />
                <span>{timeStr}</span>
              </div>
            </div>

            {assignedDriver && (
              <div className="flex items-center gap-2.5 pt-2 border-t border-border">
                <div className="w-8 h-8 rounded-xl bg-surface flex items-center justify-center flex-shrink-0">
                  <Car size={14} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold truncate">{assignedDriver.name}</p>
                  <p className="text-[10px] text-muted truncate">
                    {assignedDriver.carModel} · {assignedDriver.carPlate}
                  </p>
                </div>
              </div>
            )}
          </div>

          {!selectedReq.driverId && (
            <div className="px-4 pb-4">
              <button
                onClick={() => onOpenAssignModal([selectedReq.id])}
                className="w-full py-2.5 bg-black text-white rounded-xl text-xs font-bold transition-all active:scale-[0.97]"
              >
                Назначить водителя
              </button>
            </div>
          )}
        </div>
      )}
    </main>
  )
}
