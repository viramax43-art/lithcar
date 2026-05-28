import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import { Calendar, Car, CaretLeft, Clock, ArrowSquareOut, Crosshair, FloppyDisk, Lightning, MagnifyingGlass, PenNib, Trash, X } from '@phosphor-icons/react'
import { MapContainer, Marker, Pane, Polygon, Polyline, Popup, TileLayer, Tooltip, ZoomControl, useMap, useMapEvents } from 'react-leaflet'

import type { Driver, LatLng, MapDrawing, RideRequest, RideStatus, ServiceZone } from '../../../types'
import { searchPlaces, type NominatimSearchResult } from '../../../lib/geocode'
import { getRoadRoutePolyline } from '../../../lib/osrm'
import { createMapDrawing, deleteMapDrawing, listMapDrawings } from '../../../lib/backend'
import { MAP_COLOR_GROUPS, STATUS_CONFIG, type MapColorGroupKey } from '../constants'
import { showOnMapHref } from '../../../lib/navigation'
import MarkerClusterGroup from './MarkerClusterGroup'
import { buildSimilarTripGroups, type SimilarTripGroup } from '../utils/similarTrips'

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
  slotIntervalMinutes?: number
  enabledColors: Set<MapColorGroupKey>
  onToggleColor: (key: MapColorGroupKey) => void
}

/** Map ride status to CSS class */
function getMarkerClass(status: RideStatus): string {
  for (const group of MAP_COLOR_GROUPS) {
    if (group.statuses.includes(status)) return group.cssClass
  }
  return 'marker-ride-gray'
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

function MarkerBrushHandler({
  enabled,
  onPoint,
}: {
  enabled: boolean
  onPoint: (latlng: LatLng) => void
}) {
  const isPaintingRef = useRef(false)
  const lastPointRef = useRef<LatLng | null>(null)
  const minDelta = 0.00006

  useMapEvents({
    mousedown(event) {
      if (!enabled) return
      const p = { lat: event.latlng.lat, lng: event.latlng.lng }
      isPaintingRef.current = true
      lastPointRef.current = p
      onPoint(p)
    },
    mousemove(event) {
      if (!enabled || !isPaintingRef.current) return
      const p = { lat: event.latlng.lat, lng: event.latlng.lng }
      const prev = lastPointRef.current
      if (!prev || Math.abs(prev.lat - p.lat) > minDelta || Math.abs(prev.lng - p.lng) > minDelta) {
        lastPointRef.current = p
        onPoint(p)
      }
    },
    mouseup() {
      isPaintingRef.current = false
      lastPointRef.current = null
    },
    mouseout() {
      isPaintingRef.current = false
      lastPointRef.current = null
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
  slotIntervalMinutes,
  enabledColors,
  onToggleColor,
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
  const enabledStatuses = useMemo(
    () => new Set(MAP_COLOR_GROUPS.filter((g) => enabledColors.has(g.key)).flatMap((g) => g.statuses)),
    [enabledColors],
  )
  const visibleRequests = useMemo(
    () => filteredRequests.filter((r) => enabledStatuses.has(r.status)),
    [filteredRequests, enabledStatuses],
  )
  const visibleActiveRequests = useMemo(
    () => activeRequests.filter((r) => enabledStatuses.has(r.status)),
    [activeRequests, enabledStatuses],
  )
  const visibleCompletedRequests = useMemo(
    () => completedRequests.filter((r) => enabledStatuses.has(r.status)),
    [completedRequests, enabledStatuses],
  )

  const selectedReq = visibleRequests.find((request) => request.id === selectedReqId) ?? null
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
  const [showSimilarPanel, setShowSimilarPanel] = useState(false)
  const [isFindingSimilar, setIsFindingSimilar] = useState(false)
  const [similarError, setSimilarError] = useState<string | null>(null)
  const [similarGroups, setSimilarGroups] = useState<SimilarTripGroup[]>([])
  const [selectedSimilarGroupId, setSelectedSimilarGroupId] = useState<string | null>(null)
  const [selectedSimilarStepKey, setSelectedSimilarStepKey] = useState<string | null>(null)
  const [selectedSimilarRoadPolyline, setSelectedSimilarRoadPolyline] = useState<LatLng[] | null>(null)
  const [similarRoadError, setSimilarRoadError] = useState<string | null>(null)
  const [mapDrawings, setMapDrawings] = useState<MapDrawing[]>([])
  const [isLoadingMapDrawings, setIsLoadingMapDrawings] = useState(false)
  const [isMarkerDrawing, setIsMarkerDrawing] = useState(false)
  const [markerDrawingPoints, setMarkerDrawingPoints] = useState<LatLng[]>([])
  const [markerColor, setMarkerColor] = useState('#DC2626')
  const [markerTitle, setMarkerTitle] = useState('')
  const [isSavingMarkerDrawing, setIsSavingMarkerDrawing] = useState(false)
  const [mapDrawingError, setMapDrawingError] = useState<string | null>(null)
  const [selectedDrawingId, setSelectedDrawingId] = useState<string | null>(null)
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>()
  const searchAbort = useRef<AbortController | null>(null)
  const selectedSimilarGroup = useMemo(
    () => similarGroups.find((g) => g.id === selectedSimilarGroupId) ?? null,
    [similarGroups, selectedSimilarGroupId],
  )
  const isRoutePreviewMode = Boolean(
    selectedSimilarGroup && selectedSimilarRoadPolyline && selectedSimilarRoadPolyline.length > 1,
  )

  const loadMapDrawings = useCallback(async () => {
    setIsLoadingMapDrawings(true)
    try {
      const page = await listMapDrawings({ limit: 400, offset: 0 })
      setMapDrawings(page.items)
      setMapDrawingError(null)
    } catch (error) {
      setMapDrawingError(error instanceof Error ? error.message : 'Не удалось загрузить рисунки.')
    } finally {
      setIsLoadingMapDrawings(false)
    }
  }, [])

  useEffect(() => {
    void loadMapDrawings()
  }, [loadMapDrawings])

  const handleSaveMarkerDrawing = useCallback(async () => {
    if (markerDrawingPoints.length < 2 || isSavingMarkerDrawing) return
    setIsSavingMarkerDrawing(true)
    try {
      const drawing = await createMapDrawing({
        title: markerTitle.trim() || `Рисунок ${new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`,
        color: markerColor,
        strokeWidth: 4,
        points: markerDrawingPoints,
      })
      setMapDrawings((prev) => [drawing, ...prev])
      setSelectedDrawingId(drawing.id)
      setMarkerDrawingPoints([])
      setMarkerTitle('')
      setIsMarkerDrawing(false)
      setMapDrawingError(null)
    } catch (error) {
      setMapDrawingError(error instanceof Error ? error.message : 'Не удалось сохранить рисунок.')
    } finally {
      setIsSavingMarkerDrawing(false)
    }
  }, [isSavingMarkerDrawing, markerColor, markerDrawingPoints, markerTitle])

  const handleDeleteDrawing = useCallback(async (drawingId: string) => {
    try {
      await deleteMapDrawing(drawingId)
      setMapDrawings((prev) => prev.filter((drawing) => drawing.id !== drawingId))
      if (selectedDrawingId === drawingId) setSelectedDrawingId(null)
    } catch (error) {
      setMapDrawingError(error instanceof Error ? error.message : 'Не удалось удалить рисунок.')
    }
  }, [selectedDrawingId])

  useEffect(() => {
    let cancelled = false
    const loadRoadPolyline = async () => {
      if (!selectedSimilarGroup || selectedSimilarGroup.steps.length < 2) {
        setSelectedSimilarRoadPolyline(null)
        setSimilarRoadError(null)
        return
      }
      try {
        const road = await getRoadRoutePolyline(selectedSimilarGroup.steps.map((s) => s.location))
        if (!cancelled) {
          setSelectedSimilarRoadPolyline(road)
          setSimilarRoadError(null)
        }
      } catch (error) {
        if (!cancelled) {
          setSelectedSimilarRoadPolyline(null)
          setSimilarRoadError(error instanceof Error ? error.message : 'Не удалось построить маршрут по дорогам.')
        }
      }
    }
    void loadRoadPolyline()
    return () => {
      cancelled = true
    }
  }, [selectedSimilarGroup])

  // Build cluster markers grouped by color
  type ClusterMarker = { id: string; position: [number, number]; icon: L.DivIcon; onClick?: () => void; tooltipText?: string }
  const clusterMarkersByColor = useMemo(() => {
    const groups: Record<MapColorGroupKey, ClusterMarker[]> = { amber: [], red: [], blue: [], green: [] }

    visibleActiveRequests.forEach((req) => {
      const group = MAP_COLOR_GROUPS.find((g) => g.statuses.includes(req.status))
      if (!group) return
      const size = getMarkerSize(req.status)
      const icon = L.divIcon({
        className: '',
        html: `<div class="${group.cssClass}"></div>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
      })
      groups[group.key].push({
        id: `${req.id}-from`,
        position: [req.from.latlng.lat, req.from.latlng.lng],
        icon,
        onClick: () => onSelectRequest(req.id),
        tooltipText: `№${req.rideNumber} · ${req.passengerName} → ${req.from.address}`,
      })
    })

    return groups
  }, [visibleActiveRequests, onSelectRequest])

  // Completed destination markers (green history)
  const completedDestinationMarkers = useMemo(() => {
    return visibleCompletedRequests.map((req) => ({
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
  }, [visibleCompletedRequests, onSelectRequest])

  // Completed pickup markers (point A) — green for finished routes
  const completedPickupMarkers = useMemo(() => {
    return visibleCompletedRequests.map((req) => ({
      id: `${req.id}-done-from`,
      position: [req.from.latlng.lat, req.from.latlng.lng] as [number, number],
      icon: L.divIcon({
        className: '',
        html: `<div class="marker-green-sm"></div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      }),
      onClick: () => onSelectRequest(req.id),
      tooltipText: `A · №${req.rideNumber} · ${req.passengerName} → ${req.from.address}`,
    }))
  }, [visibleCompletedRequests, onSelectRequest])

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

  const handleFindSimilarTrips = useCallback(async () => {
    const candidates = visibleActiveRequests.filter((r) => !r.driverId || r.status === 'pending' || r.status === 'grouped' || r.status === 'assigned')
    setShowSimilarPanel(true)
    if (candidates.length < 2) {
      setSimilarGroups([])
      setSelectedSimilarGroupId(null)
      setSelectedSimilarRoadPolyline(null)
      setSimilarError('Недостаточно заявок для поиска похожих поездок (нужно минимум 2).')
      return
    }
    setIsFindingSimilar(true)
    setSimilarError(null)
    try {
      const slotStep = !slotIntervalMinutes || slotIntervalMinutes <= 0 ? 30 : slotIntervalMinutes
      const groups = await buildSimilarTripGroups(candidates, slotStep)
      setSimilarGroups(groups)
      setSelectedSimilarGroupId(groups[0]?.id ?? null)
      setSelectedSimilarStepKey(null)
      setSelectedSimilarRoadPolyline(null)
      if (groups.length === 0) {
        setSimilarError('Похожих и действительно выгодных групп не найдено в текущем фильтре.')
      }
    } catch (error) {
      setSimilarGroups([])
      setSelectedSimilarGroupId(null)
      setSelectedSimilarStepKey(null)
      setSelectedSimilarRoadPolyline(null)
      setSimilarError(
        error instanceof Error
          ? error.message
          : 'Сейчас не получается подобрать похожие поездки.',
      )
    } finally {
      setIsFindingSimilar(false)
    }
  }, [visibleActiveRequests, slotIntervalMinutes])

  const hasAnyFilter = Boolean(filterDate || filterDateEnd || filterTime || filterTimeEnd)

  const timeSlotStepMinutes = useMemo(() => {
    if (!slotIntervalMinutes || slotIntervalMinutes <= 0) return 30
    return slotIntervalMinutes
  }, [slotIntervalMinutes])

  const dayOptions = useMemo(() => {
    const now = new Date()
    const tomorrow = new Date(now)
    tomorrow.setDate(now.getDate() + 1)
    const dayAfterTomorrow = new Date(now)
    dayAfterTomorrow.setDate(now.getDate() + 2)
    return {
      today: toDateInputValue(now),
      tomorrow: toDateInputValue(tomorrow),
      dayAfterTomorrow: toDateInputValue(dayAfterTomorrow),
    }
  }, [])

  const applySingleDay = useCallback((dayValue: string) => {
    onFilterDateChange(dayValue)
    onFilterDateEndChange(dayValue)
  }, [onFilterDateChange, onFilterDateEndChange])

  const showAllTrips = useCallback(() => {
    onFilterDateChange('')
    onFilterDateEndChange('')
    onFilterTimeChange('')
    onFilterTimeEndChange('')
  }, [onFilterDateChange, onFilterDateEndChange, onFilterTimeChange, onFilterTimeEndChange])

  const timeSlots = useMemo(() => {
    const toLabel = (totalMinutes: number): string => {
      const normalized = Math.max(0, Math.min(totalMinutes, 24 * 60))
      const hours = String(Math.floor(normalized / 60)).padStart(2, '0')
      const minutes = String(normalized % 60).padStart(2, '0')
      return `${hours}:${minutes}`
    }

    const slots: Array<{ value: string; start: string; end: string; label: string }> = []
    for (let from = 0; from < 24 * 60; from += timeSlotStepMinutes) {
      const to = Math.min(from + timeSlotStepMinutes, 24 * 60)
      const start = toLabel(from)
      const end = toLabel(to)
      slots.push({
        value: `${start}-${end}`,
        start,
        end,
        label: `${start} - ${end}`,
      })
    }
    return slots
  }, [timeSlotStepMinutes])

  const selectedTimeSlotValue = useMemo(() => {
    if (!filterTime && !filterTimeEnd) return 'all'
    if (filterTime === '00:00' && filterTimeEnd === '23:59') return 'full-day'
    const matched = timeSlots.find((slot) => slot.start === filterTime && slot.end === filterTimeEnd)
    return matched ? matched.value : 'custom'
  }, [filterTime, filterTimeEnd, timeSlots])

  return (
    <main className="flex-1 relative">
      {/* === Date/Time Filter Bar === */}
      <div className="admin-map-filter-bar absolute top-4 left-1/2 -translate-x-1/2 z-[1020] w-[min(860px,calc(100vw-24px))] bg-white rounded-card shadow-card px-3 py-3 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Calendar size={16} className="text-muted flex-shrink-0" />
            <span className="text-[11px] font-semibold text-muted whitespace-nowrap">Фильтр периода</span>
            <span className="text-[11px] text-muted/70 whitespace-nowrap">· {visibleRequests.length} заявок</span>
          </div>
          {hasAnyFilter ? <span className="text-[11px] text-muted">Фильтр активен</span> : <span className="text-[11px] text-muted">Показываем всё</span>}
        </div>

        <div className="grid grid-cols-1 gap-2">
          <label className="h-10 px-3 rounded-xl border border-border bg-surface/50 flex items-center gap-2">
            <Clock size={15} className="text-muted flex-shrink-0" />
            <span className="text-[11px] text-muted whitespace-nowrap">Таймслот</span>
            <select
              value={selectedTimeSlotValue}
              onChange={(event) => {
                const value = event.target.value
                if (value === 'all') {
                  onFilterTimeChange('')
                  onFilterTimeEndChange('')
                  return
                }
                if (value === 'full-day') {
                  onFilterTimeChange('00:00')
                  onFilterTimeEndChange('23:59')
                  return
                }
                const selectedSlot = timeSlots.find((slot) => slot.value === value)
                if (!selectedSlot) return
                onFilterTimeChange(selectedSlot.start)
                onFilterTimeEndChange(selectedSlot.end)
              }}
              className="w-full text-sm bg-transparent outline-none border-none touch-none"
              title="Таймслот"
            >
              <option value="all">Все время</option>
              <option value="full-day">Весь день (00:00-23:59)</option>
              {selectedTimeSlotValue === 'custom' && <option value="custom">Произвольный диапазон</option>}
              {timeSlots.map((slot) => (
                <option key={slot.value} value={slot.value}>
                  {slot.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => applySingleDay(dayOptions.today)}
            className={`h-8 px-3 rounded-lg border text-xs font-semibold transition-colors touch-none ${
              filterDate === dayOptions.today && filterDateEnd === dayOptions.today
                ? 'border-black bg-black text-white'
                : 'border-border hover:bg-surface'
            }`}
          >
            Сегодня
          </button>
          <button
            onClick={() => applySingleDay(dayOptions.tomorrow)}
            className={`h-8 px-3 rounded-lg border text-xs font-semibold transition-colors touch-none ${
              filterDate === dayOptions.tomorrow && filterDateEnd === dayOptions.tomorrow
                ? 'border-black bg-black text-white'
                : 'border-border hover:bg-surface'
            }`}
          >
            Завтра
          </button>
          <button
            onClick={() => applySingleDay(dayOptions.dayAfterTomorrow)}
            className={`h-8 px-3 rounded-lg border text-xs font-semibold transition-colors touch-none ${
              filterDate === dayOptions.dayAfterTomorrow && filterDateEnd === dayOptions.dayAfterTomorrow
                ? 'border-black bg-black text-white'
                : 'border-border hover:bg-surface'
            }`}
          >
            Послезавтра
          </button>
          <button
            onClick={showAllTrips}
            className="h-8 px-3 rounded-lg border border-border text-xs font-semibold hover:bg-surface transition-colors touch-none"
          >
            Все поездки
          </button>
        </div>

        {/* Color (status) filter */}
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5 border-t border-border/40">
          <span className="text-[10px] font-semibold text-muted uppercase tracking-wider mr-0.5">Цвет:</span>
          {MAP_COLOR_GROUPS.map((group) => {
            const active = enabledColors.has(group.key)
            return (
              <button
                key={group.key}
                onClick={() => onToggleColor(group.key)}
                className={`h-7 pl-1.5 pr-2.5 rounded-lg border text-xs font-semibold transition-colors touch-none flex items-center gap-1.5 ${
                  active ? 'border-transparent text-white' : 'border-border text-muted bg-white'
                }`}
                style={active ? { backgroundColor: group.hex, borderColor: group.hex } : {}}
                title={group.label}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0 border border-white/50"
                  style={{ backgroundColor: active ? '#fff' : group.hex }}
                />
                {group.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Search + Geolocation + Optimize controls + Drawing panel (single left column) */}
      <div className="admin-map-controls absolute top-[200px] left-4 z-[1000] flex flex-col gap-2 max-w-[min(380px,calc(100vw-32px))]">
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
            onClick={() => void handleFindSimilarTrips()}
            className="h-11 px-4 bg-white rounded-xl shadow-card flex items-center gap-2 hover:bg-surface transition-colors touch-none"
            title="Подобрать похожие поездки"
          >
            <Lightning size={16} weight="bold" className="text-amber-500" />
            <span className="text-xs font-bold">Похожие поездки</span>
          </button>
          <button
            onClick={() => {
              setIsMarkerDrawing((prev) => {
                const next = !prev
                if (!next) setMarkerDrawingPoints([])
                return next
              })
              setMapDrawingError(null)
            }}
            className={`w-11 h-11 rounded-xl shadow-card flex items-center justify-center transition-colors touch-none ${
              isMarkerDrawing ? 'bg-black text-white' : 'bg-white hover:bg-surface'
            }`}
            title="Рисовать на карте"
          >
            <PenNib size={18} weight={isMarkerDrawing ? 'fill' : 'bold'} />
          </button>
        </div>

        {/* Legend */}
        <div className="admin-legend-bar flex items-center gap-3 bg-white/90 backdrop-blur-sm rounded-xl px-3 py-2 shadow-sm w-fit">
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

        {/* Map marker drawing panel — only when active or there are saved drawings */}
        {(isMarkerDrawing || mapDrawings.length > 0) && (
          <div className="bg-white rounded-card shadow-card p-3.5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-bold">Рисовалка карты</p>
              <span className="text-[10px] text-muted">{mapDrawings.length} сохранено</span>
            </div>

            {isMarkerDrawing && (
              <div className="rounded-xl border border-border p-2.5 space-y-2">
                <input
                  value={markerTitle}
                  onChange={(event) => setMarkerTitle(event.target.value)}
                  placeholder="Название рисунка"
                  className="w-full h-9 px-3 rounded-lg border border-border bg-surface/50 text-xs outline-none focus:border-black"
                />
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    {['#DC2626', '#2563EB', '#16A34A', '#7C3AED', '#111827'].map((color) => (
                      <button
                        key={color}
                        onClick={() => setMarkerColor(color)}
                        className={`w-5 h-5 rounded-full ${markerColor === color ? 'ring-2 ring-black ring-offset-1' : ''}`}
                        style={{ backgroundColor: color }}
                        title={color}
                      />
                    ))}
                  </div>
                  <span className="text-[10px] text-muted">{markerDrawingPoints.length} точек</span>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    onClick={() => setMarkerDrawingPoints((prev) => prev.slice(0, -1))}
                    disabled={markerDrawingPoints.length === 0}
                    className="h-8 rounded-lg bg-surface text-[11px] font-semibold disabled:opacity-50"
                  >
                    Назад
                  </button>
                  <button
                    onClick={() => setMarkerDrawingPoints([])}
                    disabled={markerDrawingPoints.length === 0}
                    className="h-8 rounded-lg bg-surface text-[11px] font-semibold disabled:opacity-50"
                  >
                    Очистить
                  </button>
                  <button
                    onClick={() => void handleSaveMarkerDrawing()}
                    disabled={markerDrawingPoints.length < 2 || isSavingMarkerDrawing}
                    className="h-8 rounded-lg bg-black text-white text-[11px] font-bold disabled:opacity-50 inline-flex items-center justify-center gap-1"
                  >
                    <FloppyDisk size={12} />
                    {isSavingMarkerDrawing ? '...' : 'Сохранить'}
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-1.5 max-h-28 overflow-y-auto scroll-smooth-y">
              {isLoadingMapDrawings && <p className="text-[11px] text-muted">Загрузка рисунков…</p>}
              {!isLoadingMapDrawings && mapDrawings.length === 0 && (
                <p className="text-[11px] text-muted">Пока нет сохраненных рисунков.</p>
              )}
              {mapDrawings.map((drawing) => (
                <div
                  key={drawing.id}
                  className={`rounded-lg border px-2 py-1.5 flex items-center gap-2 ${
                    selectedDrawingId === drawing.id ? 'border-black' : 'border-border'
                  }`}
                >
                  <button
                    onClick={() => setSelectedDrawingId((prev) => (prev === drawing.id ? null : drawing.id))}
                    className="flex-1 text-left min-w-0"
                  >
                    <p className="text-[11px] font-semibold truncate">{drawing.title}</p>
                  </button>
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: drawing.color }} />
                  <button
                    onClick={() => void handleDeleteDrawing(drawing.id)}
                    className="w-6 h-6 rounded-md bg-surface flex items-center justify-center"
                    title="Удалить рисунок"
                  >
                    <Trash size={12} />
                  </button>
                </div>
              ))}
            </div>
            {mapDrawingError && <p className="text-[11px] text-red-600">{mapDrawingError}</p>}
          </div>
        )}
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

        {!isRoutePreviewMode && (
          <>
            {/* Clustered active ride markers — one cluster group per color */}
            {MAP_COLOR_GROUPS.filter((g) => enabledColors.has(g.key)).map((group) => (
              <MarkerClusterGroup
                key={group.key}
                markers={clusterMarkersByColor[group.key]}
                clusterColor={group.hex}
              />
            ))}

            {/* Clustered completed markers (A + green B) — controlled by green toggle */}
            {enabledColors.has('green') && (
              <>
                <MarkerClusterGroup markers={completedDestinationMarkers} clusterColor="#22C55E" />
                <MarkerClusterGroup markers={completedPickupMarkers} clusterColor="#22C55E" />
              </>
            )}

            {/* Destination markers + route lines for active non-completed rides */}
            {visibleActiveRequests.map((request) => {
              const highlighted = request.id === selectedReqId
              return (
                <div key={request.id}>
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
                      color: '#000',
                      dashArray: '8, 8',
                      weight: highlighted ? 3 : 2,
                      opacity: highlighted ? 0.9 : 0.35,
                    }}
                  />
                </div>
              )
            })}

            {/* Completed routes dashed A→B — controlled by green toggle */}
            {enabledColors.has('green') && visibleCompletedRequests.map((request) => {
              const highlighted = request.id === selectedReqId
              return (
                <Polyline
                  key={`completed-line-${request.id}`}
                  positions={[
                    [request.from.latlng.lat, request.from.latlng.lng],
                    [request.to.latlng.lat, request.to.latlng.lng],
                  ]}
                  pathOptions={{
                    color: '#16A34A',
                    dashArray: '8, 8',
                    weight: highlighted ? 3 : 2,
                    opacity: highlighted ? 0.9 : 0.35,
                  }}
                />
              )
            })}
          </>
        )}

        {/* Selected similar-group route overlay */}
        {selectedSimilarGroup && selectedSimilarRoadPolyline && selectedSimilarRoadPolyline.length > 1 && (
          <Pane name="similar-route-pane" style={{ zIndex: 1200 }}>
            <Polyline
              positions={selectedSimilarRoadPolyline.map((p) => [p.lat, p.lng] as [number, number])}
              pathOptions={{
                color: '#7C3AED',
                dashArray: '6, 6',
                weight: 4,
                opacity: 0.85,
              }}
            />
            {selectedSimilarGroup.steps.map((step, idx) => (
              <Marker
                key={`similar-step-${selectedSimilarGroup.id}-${step.rideId}-${step.type}-${idx}`}
                position={[step.location.lat, step.location.lng]}
                zIndexOffset={1500}
                eventHandlers={{
                  click: () => {
                    const stepKey = `${selectedSimilarGroup.id}-${step.rideId}-${step.type}-${idx}`
                    setSelectedSimilarStepKey(stepKey)
                    setFlyTarget(step.location)
                    setTimeout(() => setFlyTarget(null), 1000)
                  },
                }}
                icon={L.divIcon({
                  className: '',
                  html: `<div style="width:22px;height:22px;border-radius:9999px;background:${step.type === 'pickup' ? '#EF4444' : '#3B82F6'};border:2px solid #fff;color:#fff;font-size:10px;font-weight:800;display:flex;align-items:center;justify-content:center;box-shadow:${selectedSimilarStepKey === `${selectedSimilarGroup.id}-${step.rideId}-${step.type}-${idx}` ? '0 0 0 4px rgba(124,58,237,.25),0 2px 10px rgba(0,0,0,.30)' : '0 2px 8px rgba(0,0,0,.25)'}">${idx + 1}</div>`,
                  iconSize: [22, 22],
                  iconAnchor: [11, 11],
                })}
              >
                <Tooltip direction="top" offset={[0, -12]} className="marker-driver-label">
                  {step.type === 'pickup' ? 'Забрать' : 'Высадить'}: {step.passengerName}
                </Tooltip>
                <Popup autoPan className="marker-driver-label">
                  <div className="text-xs">
                    <p className="font-bold">{idx + 1}. {step.type === 'pickup' ? 'Забрать' : 'Высадить'}: {step.passengerName}</p>
                    <p className="mt-1">{step.address}</p>
                  </div>
                </Popup>
              </Marker>
            ))}
          </Pane>
        )}

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

        {/* Saved admin map drawings */}
        {mapDrawings.map((drawing) => {
          const highlighted = selectedDrawingId === drawing.id
          return (
            <Polyline
              key={`map-drawing-${drawing.id}`}
              positions={drawing.points.map((point) => [point.lat, point.lng] as [number, number])}
              pathOptions={{
                color: drawing.color,
                weight: highlighted ? drawing.strokeWidth + 2 : drawing.strokeWidth,
                opacity: highlighted ? 0.95 : 0.72,
              }}
              eventHandlers={{ click: () => setSelectedDrawingId(drawing.id) }}
            />
          )
        })}

        {/* Temporary marker drawing preview */}
        {markerDrawingPoints.length > 1 && (
          <Polyline
            positions={markerDrawingPoints.map((point) => [point.lat, point.lng] as [number, number])}
            pathOptions={{
              color: markerColor,
              weight: 4,
              opacity: 0.9,
            }}
          />
        )}

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
        <MarkerBrushHandler
          enabled={isMarkerDrawing}
          onPoint={(point) => {
            setMarkerDrawingPoints((prev) => [...prev, point])
          }}
        />

        {!isRoutePreviewMode && drivers
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
      {isMarkerDrawing && (
        <div className="absolute top-28 left-1/2 -translate-x-1/2 z-[1000] px-4 py-2 rounded-pill bg-black text-white text-xs font-semibold shadow-card animate-fade-in">
          Зажмите левую кнопку мыши и ведите по карте ({markerDrawingPoints.length})
        </div>
      )}

      {/* Similar Trips Panel */}
      {showSimilarPanel && (
        <div className="admin-map-route-panel absolute bottom-4 left-4 w-[380px] max-h-[50vh] bg-white rounded-card shadow-card z-[1000] animate-slide-up overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-2">
              <Lightning size={16} weight="bold" className="text-amber-500" />
              <span className="text-sm font-bold">Похожие поездки</span>
            </div>
            <button
              onClick={() => {
                setShowSimilarPanel(false)
                setSelectedSimilarGroupId(null)
                setSelectedSimilarStepKey(null)
                setSelectedSimilarRoadPolyline(null)
                setSimilarRoadError(null)
              }}
              className="p-1.5 hover:bg-surface rounded-xl transition-colors"
            >
              <X size={14} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {isFindingSimilar ? (
              <p className="text-xs text-muted">Подбираем похожие поездки по дорогам…</p>
            ) : similarError ? (
              <p className="text-xs text-muted">{similarError}</p>
            ) : similarGroups.length === 0 ? (
              <p className="text-xs text-muted">Похожих групп не найдено.</p>
            ) : (
              <div className="space-y-3">
                {similarGroups.map((group) => (
                  <div
                    key={group.id}
                    className={`rounded-xl border p-3 space-y-2.5 transition-colors ${
                      selectedSimilarGroupId === group.id ? 'border-violet-500 bg-violet-50/40' : 'border-border'
                    }`}
                  >
                    <p className="text-[11px] text-muted leading-snug">{group.reason}</p>
                    <div className="text-[11px] flex items-center gap-3">
                      <span className="font-semibold">Путь: {group.totalKm.toFixed(1)} км · ~{Math.round(group.totalMin)} мин</span>
                      <span className="text-green-600 font-semibold">Выгода: {group.savingsKm.toFixed(1)} км · {Math.round(group.savingsMin)} мин</span>
                    </div>
                    <button
                      onClick={() => {
                        if (selectedSimilarGroupId === group.id) {
                          setSelectedSimilarGroupId(null)
                          setSelectedSimilarStepKey(null)
                          setSelectedSimilarRoadPolyline(null)
                          setSimilarRoadError(null)
                          return
                        }
                        setSelectedSimilarGroupId(group.id)
                        setSelectedSimilarStepKey(null)
                      }}
                      className={`w-full py-2 rounded-lg text-[11px] font-bold transition-colors ${
                        selectedSimilarGroupId === group.id
                          ? 'bg-violet-100 text-violet-700'
                          : 'bg-surface text-muted hover:text-black'
                      }`}
                    >
                      {selectedSimilarGroupId === group.id ? 'Скрыть маршрут' : 'Показать маршрут на карте'}
                    </button>
                    {selectedSimilarGroupId === group.id && similarRoadError && (
                      <p className="text-[11px] text-muted">{similarRoadError}</p>
                    )}
                    <div className="space-y-1.5">
                      {group.steps.map((step, idx) => (
                        <button
                          key={`${group.id}-${step.rideId}-${step.type}-${idx}`}
                          onClick={() => {
                            const stepKey = `${group.id}-${step.rideId}-${step.type}-${idx}`
                            setSelectedSimilarGroupId(group.id)
                            setSelectedSimilarStepKey(stepKey)
                            setFlyTarget(step.location)
                            setTimeout(() => setFlyTarget(null), 1000)
                          }}
                          className={`w-full flex items-start gap-2.5 text-left rounded-lg px-1 py-1 transition-colors ${
                            selectedSimilarStepKey === `${group.id}-${step.rideId}-${step.type}-${idx}`
                              ? 'bg-violet-100/70'
                              : 'hover:bg-surface'
                          }`}
                        >
                          <div className="flex flex-col items-center pt-0.5 flex-shrink-0">
                            <span className={`w-5 h-5 rounded-full text-white text-[10px] font-bold flex items-center justify-center ${step.type === 'pickup' ? 'bg-red-500' : 'bg-blue-500'}`}>
                              {idx + 1}
                            </span>
                            {idx < group.steps.length - 1 && <div className="w-px h-3 bg-border mt-0.5" />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[10px] font-semibold text-muted uppercase">
                              {step.type === 'pickup' ? 'Забрать' : 'Высадить'}: {step.passengerName}
                            </p>
                            <p className="text-xs truncate">{step.address}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={() => {
                        onOpenAssignModal(group.requestIds)
                        setShowSimilarPanel(false)
                      }}
                      className="w-full py-2.5 bg-black text-white rounded-xl text-xs font-bold transition-all active:scale-[0.97]"
                    >
                      Назначить водителя на группу ({group.requestIds.length})
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Selected request detail card */}
      {selectedReq && status && (
        <div className="admin-map-detail-card absolute top-[200px] right-4 w-[340px] bg-white rounded-card shadow-card z-[1000] animate-slide-up overflow-hidden">
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
