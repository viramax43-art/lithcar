import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import { Calendar, Car, CaretLeft, Clock, ArrowSquareOut, Crosshair, Lightning, MagnifyingGlass, X } from '@phosphor-icons/react'
import { MapContainer, Marker, Polygon, Polyline, TileLayer, Tooltip, ZoomControl, useMap, useMapEvents } from 'react-leaflet'

import type { Driver, LatLng, RideRequest, RideStatus, ServiceZone } from '../../../types'
import { searchPlaces, type NominatimSearchResult } from '../../../lib/geocode'
import { STATUS_CONFIG } from '../constants'
import { showOnMapHref } from '../../../lib/navigation'
import MarkerClusterGroup from './MarkerClusterGroup'
import { optimizeRoute, type OptimizedRoute } from '../utils/routeOptimizer'

const VILNIUS_CENTER: [number, number] = [54.6872, 25.2797]

const toDateInputValue = (value: Date): string =>
  `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`

const toTimeInputValue = (value: Date): string =>
  `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`

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
  sidebarCollapsed: boolean
  onToggleSidebar: () => void
  filterDate: string
  filterDateEnd: string
  filterTime: string
  filterTimeEnd: string
  onFilterDateChange: (v: string) => void
  onFilterDateEndChange: (v: string) => void
  onFilterTimeChange: (v: string) => void
  onFilterTimeEndChange: (v: string) => void
}

/** Map ride status to marker color class */
function getMarkerClass(status: RideStatus): string {
  switch (status) {
    case 'en_route_to_pickup':
    case 'awaiting_passenger':
      return 'marker-ride-red'
    case 'in_progress':
      return 'marker-ride-blue'
    case 'completed':
      return 'marker-ride-green'
    case 'pending':
    case 'grouped':
    case 'assigned':
    default:
      return 'marker-ride-gray'
  }
}

function getMarkerSize(status: RideStatus): number {
  if (status === 'completed') return 28
  if (status === 'en_route_to_pickup' || status === 'awaiting_passenger' || status === 'in_progress') return 28
  return 22
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

function MapInvalidator({ sidebarCollapsed }: { sidebarCollapsed: boolean }) {
  const map = useMap()
  useEffect(() => {
    const timeout = setTimeout(() => {
      map.invalidateSize({ animate: false })
    }, 300)
    return () => clearTimeout(timeout)
  }, [sidebarCollapsed, map])
  return null
}

function makeIcon(className: string, label?: string): L.DivIcon {
  const size = className.includes('-sm') ? 14 : className.includes('marker-ride') ? 28 : 36
  return L.divIcon({
    className: '',
    html: `<div class="${className}">${label ?? ''}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
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
  sidebarCollapsed,
  onToggleSidebar,
  filterDate,
  filterDateEnd,
  filterTime,
  filterTimeEnd,
  onFilterDateChange,
  onFilterDateEndChange,
  onFilterTimeChange,
  onFilterTimeEndChange,
}: AdminMapProps) {
  // --- Date/time filtering ---
  const filteredRequests = useMemo(() => {
    return requests.filter((req) => {
      const reqDate = new Date(req.dateTime)
      // Date filter
      if (filterDate) {
        const startDate = new Date(filterDate + 'T00:00:00')
        if (filterDateEnd) {
          const endDate = new Date(filterDateEnd + 'T23:59:59')
          if (reqDate < startDate || reqDate > endDate) return false
        } else {
          const endOfDay = new Date(filterDate + 'T23:59:59')
          if (reqDate < startDate || reqDate > endOfDay) return false
        }
      }
      // Time filter
      if (filterTime) {
        const [startH, startM] = filterTime.split(':').map(Number)
        const reqMinutes = reqDate.getHours() * 60 + reqDate.getMinutes()
        const startMinutes = startH * 60 + startM
        if (filterTimeEnd) {
          const [endH, endM] = filterTimeEnd.split(':').map(Number)
          const endMinutes = endH * 60 + endM
          if (reqMinutes < startMinutes || reqMinutes > endMinutes) return false
        } else {
          // Show requests within 30 min window from start
          if (reqMinutes < startMinutes || reqMinutes > startMinutes + 30) return false
        }
      }
      return true
    })
  }, [requests, filterDate, filterDateEnd, filterTime, filterTimeEnd])

  // Separate completed (green history) from active
  const activeRequests = useMemo(() => filteredRequests.filter((r) => r.status !== 'completed'), [filteredRequests])
  const completedRequests = useMemo(() => filteredRequests.filter((r) => r.status === 'completed'), [filteredRequests])

  const selectedReq = filteredRequests.find((request) => request.id === selectedReqId) ?? null
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
  const [showRoutePanel, setShowRoutePanel] = useState(false)
  const [optimizedRoute, setOptimizedRoute] = useState<OptimizedRoute | null>(null)
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>()
  const searchAbort = useRef<AbortController | null>(null)

  // Build cluster markers for active requests
  const clusterMarkers = useMemo(() => {
    const markers: Array<{
      id: string
      position: [number, number]
      icon: L.DivIcon
      onClick?: () => void
      tooltipText?: string
    }> = []

    activeRequests.forEach((req) => {
      const markerClass = getMarkerClass(req.status)
      const size = getMarkerSize(req.status)
      const icon = L.divIcon({
        className: '',
        html: `<div class="${markerClass}"></div>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
      })
      // Pickup point
      markers.push({
        id: `${req.id}-from`,
        position: [req.from.latlng.lat, req.from.latlng.lng],
        icon,
        onClick: () => onSelectRequest(req.id),
        tooltipText: `№${req.rideNumber} · ${req.passengerName} → ${req.from.address}`,
      })
    })

    return markers
  }, [activeRequests, onSelectRequest])

  // Completed (green history) markers — always shown as green
  const completedMarkers = useMemo(() => {
    return completedRequests.map((req) => ({
      id: `${req.id}-done`,
      position: [req.to.latlng.lat, req.to.latlng.lng] as [number, number],
      icon: L.divIcon({
        className: '',
        html: `<div class="marker-ride-green"></div>`,
        iconSize: [28, 28] as [number, number],
        iconAnchor: [14, 14] as [number, number],
      }),
      onClick: () => onSelectRequest(req.id),
      tooltipText: `✓ №${req.rideNumber} · ${req.passengerName} → ${req.to.address}`,
    }))
  }, [completedRequests, onSelectRequest])

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

  const handleOptimizeRoute = useCallback(async () => {
    const pendingRequests = activeRequests.filter((r) => !r.driverId || r.status === 'assigned')
    if (pendingRequests.length < 2) {
      setOptimizedRoute(null)
      setShowRoutePanel(true)
      return
    }
    const driverLoc = drivers.find((d) => d.isOnline && d.currentLocation)?.currentLocation
    const result = await optimizeRoute(pendingRequests, driverLoc)
    setOptimizedRoute(result)
    setShowRoutePanel(true)
  }, [activeRequests, drivers])

  const hasAnyFilter = Boolean(filterDate || filterDateEnd || filterTime || filterTimeEnd)

  const applyTodayWholeDay = useCallback(() => {
    const today = toDateInputValue(new Date())
    onFilterDateChange(today)
    onFilterDateEndChange(today)
    onFilterTimeChange('00:00')
    onFilterTimeEndChange('23:59')
  }, [onFilterDateChange, onFilterDateEndChange, onFilterTimeChange, onFilterTimeEndChange])

  const applyTodayTimeRange = useCallback((start: string, end: string) => {
    const today = toDateInputValue(new Date())
    onFilterDateChange(today)
    onFilterDateEndChange(today)
    onFilterTimeChange(start)
    onFilterTimeEndChange(end)
  }, [onFilterDateChange, onFilterDateEndChange, onFilterTimeChange, onFilterTimeEndChange])

  const applyNowPlusTwoHours = useCallback(() => {
    const now = new Date()
    const twoHoursLater = new Date(now.getTime() + 2 * 60 * 60 * 1000)
    const today = toDateInputValue(now)
    onFilterDateChange(today)
    onFilterDateEndChange(today)
    onFilterTimeChange(toTimeInputValue(now))
    onFilterTimeEndChange(toTimeInputValue(twoHoursLater))
  }, [onFilterDateChange, onFilterDateEndChange, onFilterTimeChange, onFilterTimeEndChange])

  return (
    <main className="flex-1 relative">
      {/* === Date/Time Filter Bar === */}
      <div className="admin-map-filter-bar absolute top-4 left-1/2 -translate-x-1/2 z-[1000] w-[min(860px,calc(100vw-24px))] bg-white rounded-card shadow-card px-3 py-3 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Calendar size={16} className="text-muted flex-shrink-0" />
            <span className="text-[11px] font-semibold text-muted whitespace-nowrap">Фильтр периода</span>
            <span className="text-[11px] text-muted/70 whitespace-nowrap">· {filteredRequests.length} заявок</span>
          </div>
          {hasAnyFilter && (
            <button
              onClick={() => { onFilterDateChange(''); onFilterDateEndChange(''); onFilterTimeChange(''); onFilterTimeEndChange('') }}
              className="h-8 px-3 inline-flex items-center gap-1.5 text-xs font-semibold hover:bg-surface rounded-lg transition-colors touch-none"
              title="Сбросить фильтр"
            >
              <X size={13} />
              Сброс
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <label className="h-10 px-3 rounded-xl border border-border bg-surface/50 flex items-center gap-2">
            <span className="text-[11px] text-muted whitespace-nowrap">Дата от</span>
            <input
              type="date"
              value={filterDate}
              onChange={(e) => onFilterDateChange(e.target.value)}
              className="w-full text-sm bg-transparent outline-none border-none touch-none"
              title="Дата начала"
            />
          </label>
          <label className="h-10 px-3 rounded-xl border border-border bg-surface/50 flex items-center gap-2">
            <span className="text-[11px] text-muted whitespace-nowrap">Дата до</span>
            <input
              type="date"
              value={filterDateEnd}
              onChange={(e) => onFilterDateEndChange(e.target.value)}
              className="w-full text-sm bg-transparent outline-none border-none touch-none"
              title="Дата конца"
            />
          </label>
          <label className="h-10 px-3 rounded-xl border border-border bg-surface/50 flex items-center gap-2">
            <Clock size={15} className="text-muted flex-shrink-0" />
            <span className="text-[11px] text-muted whitespace-nowrap">Время от</span>
            <input
              type="time"
              value={filterTime}
              onChange={(e) => onFilterTimeChange(e.target.value)}
              className="w-full text-sm bg-transparent outline-none border-none touch-none"
              title="Время от"
            />
          </label>
          <label className="h-10 px-3 rounded-xl border border-border bg-surface/50 flex items-center gap-2">
            <Clock size={15} className="text-muted flex-shrink-0" />
            <span className="text-[11px] text-muted whitespace-nowrap">Время до</span>
            <input
              type="time"
              value={filterTimeEnd}
              onChange={(e) => onFilterTimeEndChange(e.target.value)}
              className="w-full text-sm bg-transparent outline-none border-none touch-none"
              title="Время до"
            />
          </label>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={applyTodayWholeDay}
            className="h-8 px-3 rounded-lg border border-border text-xs font-semibold hover:bg-surface transition-colors touch-none"
          >
            Сегодня 00:00-23:59
          </button>
          <button
            onClick={applyNowPlusTwoHours}
            className="h-8 px-3 rounded-lg border border-border text-xs font-semibold hover:bg-surface transition-colors touch-none"
          >
            Сейчас +2 часа
          </button>
          <button
            onClick={() => applyTodayTimeRange('06:00', '12:00')}
            className="h-8 px-3 rounded-lg border border-border text-xs font-semibold hover:bg-surface transition-colors touch-none"
          >
            Утро
          </button>
          <button
            onClick={() => applyTodayTimeRange('12:00', '18:00')}
            className="h-8 px-3 rounded-lg border border-border text-xs font-semibold hover:bg-surface transition-colors touch-none"
          >
            День
          </button>
          <button
            onClick={() => applyTodayTimeRange('18:00', '23:59')}
            className="h-8 px-3 rounded-lg border border-border text-xs font-semibold hover:bg-surface transition-colors touch-none"
          >
            Вечер
          </button>
        </div>
      </div>

      {/* Search + Geolocation + Optimize controls */}
      <div className="admin-map-controls absolute top-[164px] md:top-[132px] left-4 z-[1000] flex flex-col gap-2">
        <div className="flex items-center gap-2">
          {searchOpen ? (
            <div className="bg-white rounded-card shadow-card flex flex-col w-80 max-w-[calc(100vw-32px)] max-h-[50vh] overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-3 border-b border-border">
                <MagnifyingGlass size={16} className="text-muted flex-shrink-0" />
                <input
                  autoFocus
                  value={searchQuery}
                  onChange={(e) => handleSearchInput(e.target.value)}
                  placeholder="Поиск адреса…"
                  className="flex-1 text-sm outline-none bg-transparent min-w-0 h-6"
                />
                <button onClick={() => { setSearchOpen(false); setSearchQuery(''); setSearchResults([]) }} className="w-8 h-8 flex items-center justify-center hover:bg-surface rounded-lg touch-none">
                  <X size={16} />
                </button>
              </div>
              <div className="overflow-y-auto max-h-60 scroll-smooth-y">
                {isSearching && <p className="px-3 py-3 text-xs text-muted">Ищем…</p>}
                {searchResults.map((r) => (
                  <button
                    key={r.place_id}
                    onClick={() => handleSelectResult(r)}
                    className="w-full px-3 py-3 text-left text-sm hover:bg-surface transition-colors border-b border-border/30 last:border-b-0 truncate touch-none"
                  >
                    {r.display_name}
                  </button>
                ))}
                {!isSearching && searchQuery.length >= 3 && searchResults.length === 0 && (
                  <p className="px-3 py-3 text-xs text-muted">Ничего не найдено.</p>
                )}
              </div>
            </div>
          ) : (
            <button
              onClick={() => setSearchOpen(true)}
              className="w-11 h-11 bg-white rounded-xl shadow-card flex items-center justify-center hover:bg-surface transition-colors touch-none"
              title="Поиск адреса"
            >
              <MagnifyingGlass size={18} weight="bold" />
            </button>
          )}
          <button
            onClick={handleLocateMe}
            disabled={isLocating}
            className="w-11 h-11 bg-white rounded-xl shadow-card flex items-center justify-center hover:bg-surface transition-colors disabled:opacity-60 touch-none"
            title="Моё местоположение"
          >
            {isLocating ? <span className="w-4 h-4 rounded-full border-[2px] border-border border-t-black animate-spin" /> : <Crosshair size={18} weight="bold" />}
          </button>
          <button
            onClick={() => void handleOptimizeRoute()}
            className="h-11 px-4 bg-white rounded-xl shadow-card flex items-center gap-2 hover:bg-surface transition-colors touch-none"
            title="Оптимизировать маршрут"
          >
            <Lightning size={16} weight="bold" className="text-amber-500" />
            <span className="text-xs font-bold">Оптимизация</span>
          </button>
        </div>

        {/* Legend */}
        <div className="admin-legend-bar flex items-center gap-3 bg-white/90 backdrop-blur-sm rounded-xl px-3 py-2 shadow-sm">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-[#EF4444]" />
            <span className="text-[10px] text-muted">Едет</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-[#3B82F6]" />
            <span className="text-[10px] text-muted">Везёт</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-[#22C55E]" />
            <span className="text-[10px] text-muted">Готово</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-[#F59E0B]" />
            <span className="text-[10px] text-muted">Ожид.</span>
          </div>
        </div>
      </div>

      {/* Sidebar toggle when collapsed */}
      {sidebarCollapsed && (
        <button
          onClick={onToggleSidebar}
          className="absolute top-1/2 left-2 -translate-y-1/2 z-[1000] w-10 h-10 bg-white border border-border rounded-full shadow-card flex items-center justify-center hover:bg-surface transition-colors touch-none"
          title="Развернуть панель"
        >
          <CaretLeft size={16} weight="bold" className="rotate-180" />
        </button>
      )}

      <MapContainer center={VILNIUS_CENTER} zoom={12} zoomControl={false} style={{ width: '100%', height: '100%' }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ZoomControl position="bottomright" />
        <FlyToHelper target={flyTarget} />
        <MapInvalidator sidebarCollapsed={sidebarCollapsed} />

        {/* Clustered active ride markers */}
        <MarkerClusterGroup markers={clusterMarkers} />

        {/* Clustered completed (green history) markers */}
        <MarkerClusterGroup markers={completedMarkers} />

        {/* Destination markers + route lines for active non-completed rides */}
        {activeRequests.map((request) => {
          const highlighted = request.id === selectedReqId
          return (
            <div key={request.id}>
              <Marker
                position={[request.to.latlng.lat, request.to.latlng.lng]}
                icon={makeIcon(highlighted ? 'marker-b' : 'marker-b-sm', highlighted ? 'B' : undefined)}
                eventHandlers={{ click: () => onSelectRequest(request.id) }}
              />
              {highlighted && (
                <Polyline
                  positions={[
                    [request.from.latlng.lat, request.from.latlng.lng],
                    [request.to.latlng.lat, request.to.latlng.lng],
                  ]}
                  pathOptions={{
                    color: '#000',
                    dashArray: '8, 8',
                    weight: 3,
                    opacity: 0.9,
                  }}
                />
              )}
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
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-[1000] px-4 py-2 rounded-pill bg-black text-white text-xs font-semibold shadow-card animate-fade-in">
          Кликайте по карте, чтобы добавить вершины зоны ({drawingPoints.length})
        </div>
      )}

      {/* Route Optimization Panel */}
      {showRoutePanel && (
        <div className="admin-map-route-panel absolute bottom-4 left-4 w-[380px] max-h-[50vh] bg-white rounded-card shadow-card z-[1000] animate-slide-up overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-2">
              <Lightning size={16} weight="bold" className="text-amber-500" />
              <span className="text-sm font-bold">Рекомендация маршрута</span>
            </div>
            <button onClick={() => setShowRoutePanel(false)} className="p-1.5 hover:bg-surface rounded-xl transition-colors">
              <X size={14} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {!optimizedRoute || optimizedRoute.steps.length === 0 ? (
              <p className="text-xs text-muted">Недостаточно заявок без водителя для оптимизации (нужно минимум 2).</p>
            ) : (
              <>
                <p className="text-xs text-muted">{optimizedRoute.explanation}</p>
                <div className="text-[11px] flex items-center gap-3">
                  <span className="font-semibold">Общий путь: {optimizedRoute.totalDistanceKm.toFixed(1)} км</span>
                  {optimizedRoute.savedDistanceKm > 0.5 && (
                    <span className="text-green-600 font-semibold">Экономия: ~{optimizedRoute.savedDistanceKm.toFixed(1)} км</span>
                  )}
                </div>
                <div className="space-y-1.5">
                  {optimizedRoute.steps.map((step, idx) => (
                    <div key={`${step.requestId}-${step.type}-${idx}`} className="flex items-start gap-2.5">
                      <div className="flex flex-col items-center pt-0.5 flex-shrink-0">
                        <span className={`w-5 h-5 rounded-full text-white text-[10px] font-bold flex items-center justify-center ${step.type === 'pickup' ? 'bg-red-500' : 'bg-blue-500'}`}>
                          {idx + 1}
                        </span>
                        {idx < optimizedRoute.steps.length - 1 && <div className="w-px h-3 bg-border mt-0.5" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-semibold text-muted uppercase">
                          {step.type === 'pickup' ? 'Забрать' : 'Высадить'}: {step.passengerName}
                        </p>
                        <p className="text-xs truncate">{step.address}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => {
                    const reqIds = [...new Set(optimizedRoute.steps.map((s) => s.requestId))]
                    onOpenAssignModal(reqIds)
                    setShowRoutePanel(false)
                  }}
                  className="w-full py-2.5 bg-black text-white rounded-xl text-xs font-bold transition-all active:scale-[0.97] mt-2"
                >
                  Назначить водителя на группу
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Selected request detail card */}
      {selectedReq && status && (
        <div className="admin-map-detail-card absolute top-16 right-4 w-[340px] bg-white rounded-card shadow-card z-[1000] animate-slide-up overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold truncate">{selectedReq.passengerName}</p>
              <p className="text-[11px] text-muted mt-0.5">Поездка №{selectedReq.rideNumber}</p>
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
