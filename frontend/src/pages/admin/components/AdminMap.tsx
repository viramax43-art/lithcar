import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import L from 'leaflet'
import { Calendar, Car, CaretDown, CaretLeft, CaretRight, CaretUp, Clock, ArrowSquareOut, Crosshair, FloppyDisk, Lightning, MagnifyingGlass, MapPin, Trash, X } from '@phosphor-icons/react'
import { MapContainer, Marker, Pane, Polygon, Polyline, Popup, Tooltip, useMap, useMapEvents } from 'react-leaflet'
import LocalizedTileLayer from '../../../components/LocalizedTileLayer'
import RatingBadge from '../../../components/RatingBadge'

import type { Driver, LatLng, MapMark, MapMarkVisibility, RideRequest, ServiceZone } from '../../../types'
import { reverseGeocode, searchPlaces, type NominatimSearchResult } from '../../../lib/geocode'
import { resolveGeocodeSearchScope } from '../../../lib/mapRegion'
import { getRoadRoutePolyline } from '../../../lib/osrm'
import { MAP_MARK_PALETTE, makeMapMarkIcon, normalizeMapMarkColor } from '../../../lib/mapMarkIcons'
import { formatRideDate, formatRideTime, formatTime } from '../../../i18n/dateTime'
import { getInitialMapUi } from '../../../lib/adminUiState'
import { usePersistAdminUiSlice } from '../../../lib/useAdminUiPersistence'
import { getAppLocalDayOptions, matchesPeriodFilter } from '../../../lib/periodFilter'
import { createMapMark, deleteMapMark, listMapMarks, uploadMapMarkPhoto } from '../../../lib/backend'
import { MAP_COLOR_GROUPS, STATUS_CONFIG, type MapColorGroupKey } from '../constants'
import { showOnMapHref } from '../../../lib/navigation'
import { useEscapeClose } from '../../../lib/useEscapeClose'
import MarkerClusterGroup from './MarkerClusterGroup'
import { buildSimilarTripGroups, type SimilarTripGroup } from '../utils/similarTrips'
import AdminRouteEditBar from './AdminRouteEditBar'
import { getRouteEditMarkerIcon, type RideDraft } from './AssignDriverModalParts'

const INITIAL_MAP_UI = getInitialMapUi()

function passengerRatingFromRequests(requests: RideRequest[], requestId: string) {
  const request = requests.find((item) => item.id === requestId)
  return {
    rating: request?.passengerRating ?? 5,
    ratingCount: request?.passengerRatingCount ?? 0,
  }
}

interface AdminMapProps {
  requests: RideRequest[]
  serviceZones: ServiceZone[]
  drivers: Driver[]
  isDrawing: boolean
  drawingPoints: LatLng[]
  newZoneColor: string
  selectedZoneId: string | null
  zoneFocusKey: number
  selectedReqId: string | null
  onSelectRequest: (requestId: string | null) => void
  onSelectDriver: (driverId: string) => void
  onOpenAssignModal: (requestIds: string[]) => void
  onOpenEditRoute: (requestId: string) => void
  routeEditDraft: RideDraft | null
  onRouteEditDraftChange: (draft: RideDraft) => void
  onCancelRouteEdit: () => void
  onSaveRouteEdit: () => void
  onResetRouteEdit: () => void
  isSavingRoute: boolean
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

function getMarkerSize(status: string): number {
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

function MapMarkPlacementHandler({
  enabled,
  onPlace,
}: {
  enabled: boolean
  onPlace: (latlng: LatLng) => void
}) {
  useMapEvents({
    click(event) {
      if (!enabled) return
      onPlace({ lat: event.latlng.lat, lng: event.latlng.lng })
    },
  })
  return null
}

function RouteEditMapClickHandler({
  enabled,
  onPick,
}: {
  enabled: boolean
  onPick: (latlng: LatLng) => void
}) {
  useMapEvents({
    click(event) {
      if (!enabled) return
      onPick({ lat: event.latlng.lat, lng: event.latlng.lng })
    },
  })
  return null
}

function FlyToDraftBounds({ draft }: { draft: RideDraft | null }) {
  const map = useMap()
  const lastRequestId = useRef<string | null>(null)
  useEffect(() => {
    if (!draft) {
      lastRequestId.current = null
      return
    }
    if (lastRequestId.current === draft.requestId) return
    lastRequestId.current = draft.requestId
    const bounds = L.latLngBounds(
      [draft.fromLatLng.lat, draft.fromLatLng.lng],
      [draft.toLatLng.lat, draft.toLatLng.lng],
    )
    map.fitBounds(bounds, { padding: [80, 80], maxZoom: 15 })
  }, [draft, map])
  return null
}

function FlyToZoneBounds({ zone, focusKey }: { zone: ServiceZone | null; focusKey: number }) {
  const map = useMap()
  const lastFocusKey = useRef(0)
  useEffect(() => {
    if (!zone || focusKey === 0 || focusKey === lastFocusKey.current) return
    lastFocusKey.current = focusKey
    if (zone.polygon.length === 0) return
    const bounds = L.latLngBounds(zone.polygon.map((point) => [point.lat, point.lng] as [number, number]))
    map.fitBounds(bounds, { padding: [72, 72], maxZoom: 16 })
  }, [zone, focusKey, map])
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

function MapViewportPersistence({
  onViewportChange,
}: {
  onViewportChange: (center: LatLng, zoom: number) => void
}) {
  useMapEvents({
    moveend(event) {
      const center = event.target.getCenter()
      onViewportChange({ lat: center.lat, lng: center.lng }, event.target.getZoom())
    },
  })
  return null
}

const IS_COARSE_POINTER =
  typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches

// Small dot markers are hard to tap on touch devices — enforce a minimum size.
const SMALL_POINT_SIZE = IS_COARSE_POINTER ? 32 : 14

function makeSolidPointIcon(color: string, size: number, label?: string): L.DivIcon {
  const borderWidth = size >= 28 ? 3 : 2
  const shadowAlpha = size >= 28 ? 0.45 : 0.35
  const fontSize = size >= 28 ? 13 : 10
  const fontWeight = size >= 28 ? 800 : 700
  return L.divIcon({
    className: '',
    html: `<div style="width:${size}px;height:${size}px;border-radius:9999px;background:${color};border:${borderWidth}px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,${shadowAlpha});display:flex;align-items:center;justify-content:center;color:#fff;font-size:${fontSize}px;font-weight:${fontWeight};font-family:Inter,sans-serif;">${label ?? ''}</div>`,
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
  selectedZoneId,
  zoneFocusKey,
  selectedReqId,
  onSelectRequest,
  onSelectDriver,
  onOpenAssignModal,
  onOpenEditRoute,
  routeEditDraft,
  onRouteEditDraftChange,
  onCancelRouteEdit,
  onSaveRouteEdit,
  onResetRouteEdit,
  isSavingRoute,
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
  const { t, i18n } = useTranslation()

  // --- Date/time filtering ---
  const filteredRequests = useMemo(() => {
    return requests.filter((req) =>
      matchesPeriodFilter(
        { dateTime: req.dateTime, dateTimeLocal: req.dateTimeLocal },
        { filterDate, filterDateEnd, filterTime, filterTimeEnd },
      ),
    )
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

  const isRouteEditMode = routeEditDraft !== null
  const editingRequestId = routeEditDraft?.requestId ?? null

  const selectedReq = visibleRequests.find((request) => request.id === selectedReqId) ?? null
  const editingRequest = routeEditDraft
    ? requests.find((request) => request.id === routeEditDraft.requestId) ?? selectedReq
    : null
  const assignedDriver = selectedReq?.driverId
    ? drivers.find((d) => d.id === selectedReq.driverId) ?? null
    : null
  const status = selectedReq ? STATUS_CONFIG[selectedReq.status] ?? STATUS_CONFIG.pending : null

  const selectedZone = useMemo(
    () => (selectedZoneId ? serviceZones.find((zone) => zone.id === selectedZoneId) ?? null : null),
    [selectedZoneId, serviceZones],
  )

  const dateStr = selectedReq
    ? formatRideDate(selectedReq, { day: 'numeric', month: 'long' })
    : ''
  const timeStr = selectedReq ? formatRideTime(selectedReq) : ''

  const [searchOpen, setSearchOpen] = useState(INITIAL_MAP_UI.searchOpen)
  const [searchQuery, setSearchQuery] = useState(INITIAL_MAP_UI.mapSearchQuery)
  const [searchResults, setSearchResults] = useState<NominatimSearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [flyTarget, setFlyTarget] = useState<LatLng | null>(null)
  const [isLocating, setIsLocating] = useState(false)
  const [showSimilarPanel, setShowSimilarPanel] = useState(INITIAL_MAP_UI.showSimilarPanel)
  const [isFindingSimilar, setIsFindingSimilar] = useState(false)
  const [similarError, setSimilarError] = useState<string | null>(null)
  const [similarGroups, setSimilarGroups] = useState<SimilarTripGroup[]>([])
  const [selectedSimilarGroupId, setSelectedSimilarGroupId] = useState<string | null>(INITIAL_MAP_UI.selectedSimilarGroupId)
  const [selectedSimilarStepKey, setSelectedSimilarStepKey] = useState<string | null>(INITIAL_MAP_UI.selectedSimilarStepKey)
  const [selectedSimilarRoadPolyline, setSelectedSimilarRoadPolyline] = useState<LatLng[] | null>(null)
  const [similarRoadError, setSimilarRoadError] = useState<string | null>(null)
  const [mapMarks, setMapMarks] = useState<MapMark[]>([])
  const [isLoadingMapMarks, setIsLoadingMapMarks] = useState(false)
  const [isMarkModeEnabled, setIsMarkModeEnabled] = useState(INITIAL_MAP_UI.isMarkModeEnabled)
  const [draftMarkPosition, setDraftMarkPosition] = useState<LatLng | null>(null)
  const [markTitle, setMarkTitle] = useState(INITIAL_MAP_UI.markTitle)
  const [markColor, setMarkColor] = useState(INITIAL_MAP_UI.markColor)
  const [markVisibility, setMarkVisibility] = useState<MapMarkVisibility>(INITIAL_MAP_UI.markVisibility)
  const [markPhotoFile, setMarkPhotoFile] = useState<File | null>(null)
  const [markPhotoPreviewUrl, setMarkPhotoPreviewUrl] = useState<string | null>(null)
  const [isSavingMapMark, setIsSavingMapMark] = useState(false)
  const [mapMarkError, setMapMarkError] = useState<string | null>(null)
  const [selectedMarkId, setSelectedMarkId] = useState<string | null>(INITIAL_MAP_UI.selectedMarkId)
  const [openedMarkPopupId, setOpenedMarkPopupId] = useState<string | null>(INITIAL_MAP_UI.openedMarkPopupId)
  const [fullscreenPhoto, setFullscreenPhoto] = useState<{ src: string; title: string } | null>(null)
  const [isFilterBarCollapsed, setIsFilterBarCollapsed] = useState(INITIAL_MAP_UI.isFilterBarCollapsed)
  const [isControlsCollapsed, setIsControlsCollapsed] = useState(INITIAL_MAP_UI.isControlsCollapsed)
  const [isMarksPanelCollapsed, setIsMarksPanelCollapsed] = useState(INITIAL_MAP_UI.isMarksPanelCollapsed)
  const [mapCenter, setMapCenter] = useState<LatLng>({ lat: INITIAL_MAP_UI.centerLat, lng: INITIAL_MAP_UI.centerLng })
  const [mapZoom, setMapZoom] = useState(INITIAL_MAP_UI.zoom)
  const geocodeSearchScope = useMemo(
    () => resolveGeocodeSearchScope(serviceZones, mapCenter),
    [serviceZones, mapCenter],
  )
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>()
  const searchAbort = useRef<AbortController | null>(null)

  const handleMapViewportChange = useCallback((center: LatLng, zoom: number) => {
    setMapCenter(center)
    setMapZoom(zoom)
  }, [])

  const mapUiPersistence = useMemo(
    () => ({
      searchOpen,
      mapSearchQuery: searchQuery,
      showSimilarPanel,
      isFilterBarCollapsed,
      isControlsCollapsed,
      isMarksPanelCollapsed,
      isMarkModeEnabled,
      markTitle,
      markColor,
      markVisibility,
      selectedSimilarGroupId,
      selectedSimilarStepKey,
      selectedMarkId,
      openedMarkPopupId,
      centerLat: mapCenter.lat,
      centerLng: mapCenter.lng,
      zoom: mapZoom,
    }),
    [
      searchOpen,
      searchQuery,
      showSimilarPanel,
      isFilterBarCollapsed,
      isControlsCollapsed,
      isMarksPanelCollapsed,
      isMarkModeEnabled,
      markTitle,
      markColor,
      markVisibility,
      selectedSimilarGroupId,
      selectedSimilarStepKey,
      selectedMarkId,
      openedMarkPopupId,
      mapCenter.lat,
      mapCenter.lng,
      mapZoom,
    ],
  )
  usePersistAdminUiSlice('map', mapUiPersistence)

  const selectedSimilarGroup = useMemo(
    () => similarGroups.find((g) => g.id === selectedSimilarGroupId) ?? null,
    [similarGroups, selectedSimilarGroupId],
  )
  const isRoutePreviewMode = Boolean(
    !isRouteEditMode &&
      selectedSimilarGroup &&
      selectedSimilarRoadPolyline &&
      selectedSimilarRoadPolyline.length > 1,
  )
  const isMapMarkViewMode = Boolean(openedMarkPopupId || fullscreenPhoto)
  const floatingPanelsTop = isFilterBarCollapsed ? 124 : 252

  useEscapeClose(Boolean(fullscreenPhoto), () => setFullscreenPhoto(null))

  const getPickupColor = useCallback((request: RideRequest): string => {
    if (request.status === 'completed') return '#22C55E'
    return '#F59E0B'
  }, [])

  const getDropoffColor = useCallback((request: RideRequest): string => {
    if (request.status === 'completed') return '#22C55E'
    return '#3B82F6'
  }, [])

  const loadMapMarks = useCallback(async () => {
    setIsLoadingMapMarks(true)
    try {
      const page = await listMapMarks({ limit: 400, offset: 0 })
      setMapMarks(page.items)
      setMapMarkError(null)
    } catch (error) {
      setMapMarkError(
        error instanceof Error
          ? t(error.message, { defaultValue: 'Failed to load marks.' })
          : t('admin.errors.loadMapMarksFailed'),
      )
    } finally {
      setIsLoadingMapMarks(false)
    }
  }, [t])

  useEffect(() => {
    void loadMapMarks()
  }, [loadMapMarks])

  useEffect(() => {
    if (!isRouteEditMode) return
    setIsMarkModeEnabled(false)
    setShowSimilarPanel(false)
    setSelectedSimilarGroupId(null)
    setSelectedSimilarStepKey(null)
    setSelectedSimilarRoadPolyline(null)
    setDraftMarkPosition(null)
  }, [isRouteEditMode])

  const handleSelectRequest = useCallback(
    (requestId: string | null) => {
      if (isRouteEditMode) return
      onSelectRequest(requestId)
    },
    [isRouteEditMode, onSelectRequest],
  )

  const handleMoveEditPoint = useCallback(
    async (point: 'from' | 'to', latlng: LatLng) => {
      if (!routeEditDraft) return
      const next: RideDraft = { ...routeEditDraft }
      if (point === 'from') next.fromLatLng = latlng
      else next.toLatLng = latlng
      onRouteEditDraftChange(next)
      try {
        const address = await reverseGeocode(latlng)
        if (!address) return
        onRouteEditDraftChange({
          ...next,
          ...(point === 'from' ? { fromAddress: address } : { toAddress: address }),
        })
      } catch {
        // keep coordinates even if geocode fails
      }
    },
    [onRouteEditDraftChange, routeEditDraft],
  )

  useEffect(() => {
    if (!markPhotoFile) {
      setMarkPhotoPreviewUrl(null)
      return
    }
    const localUrl = URL.createObjectURL(markPhotoFile)
    setMarkPhotoPreviewUrl(localUrl)
    return () => URL.revokeObjectURL(localUrl)
  }, [markPhotoFile])

  const handleSaveMapMark = useCallback(async () => {
    if (!draftMarkPosition || isSavingMapMark) return
    setIsSavingMapMark(true)
    try {
      let photoKey: string | undefined
      if (markPhotoFile) {
        const uploadResult = await uploadMapMarkPhoto(markPhotoFile)
        photoKey = uploadResult.photoKey
      }
      const mark = await createMapMark({
        title: markTitle.trim() || t('admin.map.markDefaultTitle', {
          time: formatTime(new Date(), { hour: '2-digit', minute: '2-digit' }),
        }),
        color: normalizeMapMarkColor(markColor),
        position: draftMarkPosition,
        visibility: markVisibility,
        ...(photoKey ? { photoKey } : {}),
      })
      setMapMarks((prev) => [mark, ...prev])
      setSelectedMarkId(mark.id)
      setDraftMarkPosition(null)
      setMarkTitle('')
      setMarkColor('#EF4444')
      setMarkVisibility('admin_only')
      setMarkPhotoFile(null)
      setIsMarkModeEnabled(false)
      setMapMarkError(null)
    } catch (error) {
      setMapMarkError(
        error instanceof Error
          ? t(error.message, { defaultValue: 'Failed to save mark.' })
          : t('admin.errors.saveMapMarkFailed'),
      )
    } finally {
      setIsSavingMapMark(false)
    }
  }, [draftMarkPosition, isSavingMapMark, markColor, markPhotoFile, markTitle, markVisibility, t])

  const handleDeleteMapMark = useCallback(async (markId: string) => {
    try {
      await deleteMapMark(markId)
      setMapMarks((prev) => prev.filter((mark) => mark.id !== markId))
      if (selectedMarkId === markId) setSelectedMarkId(null)
    } catch (error) {
      setMapMarkError(
        error instanceof Error
          ? t(error.message, { defaultValue: 'Failed to delete mark.' })
          : t('admin.errors.deleteMapMarkFailed'),
      )
    }
  }, [selectedMarkId, t])

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
          setSimilarRoadError(
            error instanceof Error
              ? t(error.message, { defaultValue: 'Failed to build road route for the selected group.' })
              : t('errors.osrmRoadRouteFailed'),
          )
        }
      }
    }
    void loadRoadPolyline()
    return () => {
      cancelled = true
    }
  }, [selectedSimilarGroup, t])

  // Build cluster markers grouped by color
  type ClusterMarker = { id: string; position: [number, number]; icon: L.DivIcon; onClick?: () => void; tooltipText?: string }
  const clusterMarkersByColor = useMemo(() => {
    const groups: Record<MapColorGroupKey, ClusterMarker[]> = { amber: [], red: [], blue: [], green: [] }

    visibleActiveRequests.forEach((req) => {
      if (req.id === editingRequestId) return
      const hasAssignedDriver = Boolean(req.driverId)
      const pickupColor = getPickupColor(req)
      const size = getMarkerSize(req.status)
      groups[hasAssignedDriver ? 'red' : 'amber'].push({
        id: `${req.id}-from`,
        position: [req.from.latlng.lat, req.from.latlng.lng],
        icon: makeSolidPointIcon(pickupColor, size),
        onClick: () => handleSelectRequest(req.id),
        tooltipText: `№${req.rideNumber} · ${req.passengerName} ★${(req.passengerRating ?? 5).toFixed(1)} → ${req.from.address}`,
      })
    })

    return groups
  }, [visibleActiveRequests, handleSelectRequest, getPickupColor, editingRequestId])

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
      onClick: () => handleSelectRequest(req.id),
      tooltipText: `✓ №${req.rideNumber} · ${req.passengerName} ★${(req.passengerRating ?? 5).toFixed(1)} → ${req.to.address}`,
    }))
  }, [visibleCompletedRequests, handleSelectRequest])

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
      onClick: () => handleSelectRequest(req.id),
      tooltipText: `A · №${req.rideNumber} · ${req.passengerName} ★${(req.passengerRating ?? 5).toFixed(1)} → ${req.from.address}`,
    }))
  }, [visibleCompletedRequests, handleSelectRequest])

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
        const data = await searchPlaces(query, controller.signal, geocodeSearchScope)
        setSearchResults(data)
      } catch { setSearchResults([]) }
      finally { setIsSearching(false) }
    }, 500)
  }, [geocodeSearchScope])

  useEffect(() => {
    const q = searchQuery
    if (q.length < 3) {
      setSearchResults([])
      return
    }
    if (searchAbort.current) {
      searchAbort.current.abort()
      searchAbort.current = null
    }
    setIsSearching(true)
    const controller = new AbortController()
    searchAbort.current = controller
    void (async () => {
      try {
        const data = await searchPlaces(q, controller.signal, geocodeSearchScope)
        setSearchResults(data)
      } catch {
        setSearchResults([])
      } finally {
        setIsSearching(false)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-fetch address labels when language changes
  }, [i18n.language])

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
      setSimilarError(t('admin.similarTrips.notEnough'))
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
        setSimilarError(t('admin.similarTrips.noneFound'))
      }
    } catch (error) {
      setSimilarGroups([])
      setSelectedSimilarGroupId(null)
      setSelectedSimilarStepKey(null)
      setSelectedSimilarRoadPolyline(null)
      setSimilarError(
        error instanceof Error
          ? t(error.message, { defaultValue: 'Unable to find similar trips.' })
          : t('errors.osrmSimilarTripsUnavailable'),
      )
    } finally {
      setIsFindingSimilar(false)
    }
  }, [visibleActiveRequests, slotIntervalMinutes, t])

  const hasAnyFilter = Boolean(filterDate || filterDateEnd || filterTime || filterTimeEnd)

  const dayOptions = useMemo(() => getAppLocalDayOptions(), [])

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

  const hasBottomPanel =
    !isMapMarkViewMode &&
    ((!isRouteEditMode && Boolean(selectedReq) && Boolean(status)) || (!isRouteEditMode && showSimilarPanel))

  return (
    <main className={`flex-1 relative ${hasBottomPanel ? 'admin-map--panel-open' : ''}`}>
      {/* === Date/Time Filter Bar === */}
      {!isMapMarkViewMode && (
      <div
        className={`admin-map-filter-bar absolute top-4 left-1/2 -translate-x-1/2 z-[1020] w-[min(860px,calc(100%-24px))] max-w-full bg-white rounded-card shadow-card px-3 py-3 space-y-2.5 ${
          isFilterBarCollapsed ? 'admin-map-filter-bar--collapsed' : ''
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Calendar size={16} className="text-muted flex-shrink-0" />
            <span className="text-[11px] font-semibold text-muted whitespace-nowrap">{t('common.periodFilter')}</span>
            <span className="text-[11px] text-muted/70 whitespace-nowrap">{t('admin.map.periodFilterCount', { count: visibleRequests.length })}</span>
          </div>
          <div className="flex items-center gap-2">
            {hasAnyFilter ? <span className="text-[11px] text-muted">{t('common.filterActive')}</span> : <span className="text-[11px] text-muted">{t('common.showAll')}</span>}
            <button
              type="button"
              onClick={() => setIsFilterBarCollapsed((prev) => !prev)}
              className="w-9 h-9 rounded-lg border border-border bg-white hover:bg-surface transition-colors flex items-center justify-center"
              title={isFilterBarCollapsed ? t('common.open') : t('common.close')}
            >
              {isFilterBarCollapsed ? <CaretDown size={14} /> : <CaretUp size={14} />}
            </button>
          </div>
        </div>

        {!isFilterBarCollapsed && (
        <>
        <div className="grid grid-cols-1 gap-2">
          <div className="rounded-xl border border-border bg-surface/50 px-3 py-2">
            <div className="flex items-center gap-2 mb-1.5">
              <Clock size={15} className="text-muted flex-shrink-0" />
              <span className="text-[11px] text-muted whitespace-nowrap">
                {t('common.timeRangeFromTo', { defaultValue: 'Time from-to' })}
              </span>
            </div>
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
              <label className="min-w-0">
                <span className="text-[10px] text-muted">{t('common.from')}</span>
                <input
                  type="time"
                  value={filterTime}
                  onChange={(event) => onFilterTimeChange(event.target.value)}
                  className="w-full mt-1 h-8 px-2 rounded-lg border border-border bg-white text-xs outline-none focus:border-black"
                  title={t('common.from')}
                />
              </label>
              <span className="text-muted text-sm mt-5">-</span>
              <label className="min-w-0">
                <span className="text-[10px] text-muted">{t('common.to')}</span>
                <input
                  type="time"
                  value={filterTimeEnd}
                  onChange={(event) => onFilterTimeEndChange(event.target.value)}
                  className="w-full mt-1 h-8 px-2 rounded-lg border border-border bg-white text-xs outline-none focus:border-black"
                  title={t('common.to')}
                />
              </label>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => applySingleDay(dayOptions.today)}
            className={`h-9 px-3 rounded-lg border text-xs font-semibold transition-colors touch-compact ${
              filterDate === dayOptions.today && filterDateEnd === dayOptions.today
                ? 'border-black bg-black text-white'
                : 'border-border hover:bg-surface'
            }`}
          >
            {t('common.today')}
          </button>
          <button
            onClick={() => applySingleDay(dayOptions.tomorrow)}
            className={`h-9 px-3 rounded-lg border text-xs font-semibold transition-colors touch-compact ${
              filterDate === dayOptions.tomorrow && filterDateEnd === dayOptions.tomorrow
                ? 'border-black bg-black text-white'
                : 'border-border hover:bg-surface'
            }`}
          >
            {t('common.tomorrow')}
          </button>
          <button
            onClick={() => applySingleDay(dayOptions.dayAfterTomorrow)}
            className={`h-9 px-3 rounded-lg border text-xs font-semibold transition-colors touch-compact ${
              filterDate === dayOptions.dayAfterTomorrow && filterDateEnd === dayOptions.dayAfterTomorrow
                ? 'border-black bg-black text-white'
                : 'border-border hover:bg-surface'
            }`}
          >
            {t('common.dayAfterTomorrow')}
          </button>
          <button
            onClick={showAllTrips}
            className="h-9 px-3 rounded-lg border border-border text-xs font-semibold hover:bg-surface transition-colors touch-compact"
          >
            {t('common.allTrips')}
          </button>
        </div>

        {/* Color (status) filter */}
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5 border-t border-border/40">
          <span className="text-[10px] font-semibold text-muted uppercase tracking-wider mr-0.5">{t('common.colorFilter')}</span>
          {MAP_COLOR_GROUPS.map((group) => {
            const active = enabledColors.has(group.key)
            return (
              <button
                key={group.key}
                onClick={() => onToggleColor(group.key)}
                className={`h-9 pl-2 pr-3 rounded-lg border text-xs font-semibold transition-colors touch-compact flex items-center gap-1.5 ${
                  active ? 'border-transparent text-white' : 'border-border text-muted bg-white hover:bg-surface'
                }`}
                style={active ? { backgroundColor: group.hex, borderColor: group.hex } : {}}
                title={t(group.labelKey)}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0 border border-white/50"
                  style={{ backgroundColor: active ? '#fff' : group.hex }}
                />
                {t(group.labelKey)}
              </button>
            )
          })}
        </div>
        </>
        )}
      </div>
      )}

      {/* Search + Geolocation + Optimize controls + Drawing panel (single left column) */}
      {!isMapMarkViewMode && (
      <div
        className="admin-map-controls absolute left-4 z-[1000] flex flex-col flex-wrap gap-2 max-w-[min(380px,calc(100vw-32px))] overflow-y-auto pr-1"
        style={{ top: `${floatingPanelsTop}px`, maxHeight: `calc(100dvh - ${floatingPanelsTop + 24}px)` }}
      >
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsControlsCollapsed((prev) => !prev)}
            className="w-11 h-11 bg-white rounded-xl shadow-card flex items-center justify-center hover:bg-surface transition-colors touch-none"
            title={isControlsCollapsed ? t('common.open') : t('common.close')}
          >
            {isControlsCollapsed ? <CaretDown size={18} weight="bold" /> : <CaretUp size={18} weight="bold" />}
          </button>
          {!isControlsCollapsed && (
            <>
          {searchOpen ? (
            <div className="bg-white rounded-card shadow-card flex flex-col w-80 max-w-[calc(100vw-32px)] max-h-[50vh] overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-3 border-b border-border">
                <MagnifyingGlass size={16} className="text-muted flex-shrink-0" />
                <input
                  autoFocus={!IS_COARSE_POINTER}
                  value={searchQuery}
                  onChange={(e) => handleSearchInput(e.target.value)}
                  placeholder={t('common.searchAddressPlaceholder')}
                  className="flex-1 text-sm outline-none bg-transparent min-w-0 h-6"
                />
                <button onClick={() => { setSearchOpen(false); setSearchQuery(''); setSearchResults([]) }} className="w-10 h-10 -my-1 flex items-center justify-center hover:bg-surface rounded-lg touch-none">
                  <X size={16} />
                </button>
              </div>
              <div className="overflow-y-auto max-h-60 scroll-smooth-y">
                {isSearching && <p className="px-3 py-3 text-xs text-muted">{t('common.searching')}</p>}
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
                  <p className="px-3 py-3 text-xs text-muted">{t('common.notFound')}</p>
                )}
              </div>
            </div>
          ) : (
            <button
              onClick={() => setSearchOpen(true)}
              className="w-11 h-11 bg-white rounded-xl shadow-card flex items-center justify-center hover:bg-surface transition-colors touch-none"
              title={t('common.searchAddress')}
            >
              <MagnifyingGlass size={18} weight="bold" />
            </button>
          )}
          <button
            onClick={handleLocateMe}
            disabled={isLocating}
            className="w-11 h-11 bg-white rounded-xl shadow-card flex items-center justify-center hover:bg-surface transition-colors disabled:opacity-60 touch-none"
            title={t('common.myLocation', { defaultValue: 'My location' })}
          >
            {isLocating ? <span className="w-4 h-4 rounded-full border-[2px] border-border border-t-black animate-spin" /> : <Crosshair size={18} weight="bold" />}
          </button>
          <button
            onClick={() => void handleFindSimilarTrips()}
            disabled={isRouteEditMode}
            className="h-11 px-4 bg-white rounded-xl shadow-card flex items-center gap-2 hover:bg-surface transition-colors touch-none disabled:opacity-50"
            title={t('admin.map.findSimilarTrips')}
          >
            <Lightning size={16} weight="bold" className="text-amber-500" />
            <span className="text-xs font-bold">{t('admin.map.similarTrips')}</span>
          </button>
          <button
            onClick={() => {
              if (isRouteEditMode) return
              setIsMarkModeEnabled((prev) => {
                const next = !prev
                if (!next) {
                  setDraftMarkPosition(null)
                  setMarkPhotoFile(null)
                }
                return next
              })
              setMapMarkError(null)
            }}
            disabled={isRouteEditMode}
            className={`w-11 h-11 rounded-xl shadow-card flex items-center justify-center transition-colors touch-none disabled:opacity-50 ${
              isMarkModeEnabled ? 'bg-black text-white' : 'bg-white hover:bg-surface'
            }`}
            title={t('admin.map.placeMark')}
          >
            <MapPin size={18} weight={isMarkModeEnabled ? 'fill' : 'bold'} />
          </button>
            </>
          )}
        </div>

        {!isControlsCollapsed && (
        <>
        {/* Legend */}
        <div className="admin-legend-bar flex items-center gap-3 bg-white/90 backdrop-blur-sm rounded-xl px-3 py-2 shadow-sm w-fit">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-[#EF4444]" />
            <span className="text-[10px] text-muted">{t('admin.map.legendEnRoute')}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-[#3B82F6]" />
            <span className="text-[10px] text-muted">{t('admin.map.legendInProgress')}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-[#22C55E]" />
            <span className="text-[10px] text-muted">{t('admin.map.legendDone')}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-[#F59E0B]" />
            <span className="text-[10px] text-muted">{t('admin.map.legendWaiting')}</span>
          </div>
        </div>

        {/* Map marker panel — only when active or there are saved marks */}
        {(isMarkModeEnabled || mapMarks.length > 0) && (
          <div className="bg-white rounded-card shadow-card p-3.5 space-y-3 max-h-[calc(100dvh-340px)] overflow-y-auto">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-bold">{t('admin.map.marksPanel')}</p>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted">{mapMarks.length} {t('common.saved')}</span>
                <button
                  type="button"
                  onClick={() => setIsMarksPanelCollapsed((prev) => !prev)}
                  className="w-9 h-9 rounded-lg border border-border bg-white hover:bg-surface transition-colors flex items-center justify-center"
                  title={isMarksPanelCollapsed ? t('common.open') : t('common.close')}
                >
                  {isMarksPanelCollapsed ? <CaretDown size={14} /> : <CaretUp size={14} />}
                </button>
              </div>
            </div>

            {!isMarksPanelCollapsed && (
            <>
            {isMarkModeEnabled && (
              <div className="rounded-xl border border-border p-2.5 space-y-2">
                <input
                  value={markTitle}
                  onChange={(event) => setMarkTitle(event.target.value)}
                  placeholder={t('admin.map.markTitlePlaceholder')}
                  className="w-full h-9 px-3 rounded-lg border border-border bg-surface/50 text-xs outline-none focus:border-black"
                />
                <div className="space-y-1">
                  <p className="text-[10px] text-muted">{t('admin.map.markColorLabel', { defaultValue: 'Color' })}</p>
                  <div className="flex items-center gap-1.5">
                    {MAP_MARK_PALETTE.map((color) => {
                      const selected = normalizeMapMarkColor(markColor) === color
                      return (
                        <button
                          key={color}
                          type="button"
                          onClick={() => setMarkColor(color)}
                          className={`w-9 h-9 touch-none rounded-full border-2 transition-transform ${selected ? 'border-black scale-110' : 'border-white/80'}`}
                          style={{ backgroundColor: color }}
                          title={color}
                        />
                      )
                    })}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setMarkVisibility('admin_only')}
                    className={`h-8 rounded-lg border text-[11px] font-semibold ${
                      markVisibility === 'admin_only' ? 'border-black bg-black text-white' : 'border-border bg-surface'
                    }`}
                  >
                    {t('admin.map.visibleForAdminsOnly')}
                  </button>
                  <button
                    onClick={() => setMarkVisibility('public')}
                    className={`h-8 rounded-lg border text-[11px] font-semibold ${
                      markVisibility === 'public' ? 'border-black bg-black text-white' : 'border-border bg-surface'
                    }`}
                  >
                    {t('admin.map.visibleForEveryone')}
                  </button>
                </div>
                <label className="block">
                  <span className="text-[10px] text-muted">{t('admin.map.markPhotoLabel')}</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(event) => setMarkPhotoFile(event.target.files?.[0] ?? null)}
                    className="mt-1 block w-full text-[11px] text-muted"
                  />
                </label>
                {markPhotoPreviewUrl && (
                  <img
                    src={markPhotoPreviewUrl}
                    alt={t('admin.map.markPhotoPreviewAlt')}
                    className="w-full h-28 object-cover rounded-lg border border-border"
                  />
                )}
                <div className="text-[10px] text-muted">
                  {draftMarkPosition
                    ? t('admin.map.markPositionReady')
                    : t('admin.map.markPositionMissing')}
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    onClick={() => {
                      setDraftMarkPosition(null)
                      setMarkPhotoFile(null)
                    }}
                    disabled={!draftMarkPosition && !markPhotoFile && !markTitle}
                    className="h-8 rounded-lg bg-surface text-[11px] font-semibold disabled:opacity-50"
                  >
                    {t('common.back')}
                  </button>
                  <button
                    onClick={() => void handleSaveMapMark()}
                    disabled={!draftMarkPosition || isSavingMapMark}
                    className="h-8 rounded-lg bg-black text-white text-[11px] font-bold disabled:opacity-50 inline-flex items-center justify-center gap-1"
                  >
                    <FloppyDisk size={12} />
                    {isSavingMapMark ? '...' : t('common.save')}
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-1.5 max-h-28 overflow-y-auto scroll-smooth-y">
              {isLoadingMapMarks && <p className="text-[11px] text-muted">{t('admin.map.loadingMapMarks')}</p>}
              {!isLoadingMapMarks && mapMarks.length === 0 && (
                <p className="text-[11px] text-muted">{t('admin.map.noMapMarks')}</p>
              )}
              {mapMarks.map((mark) => (
                <div
                  key={mark.id}
                  className={`rounded-lg border px-2 py-1.5 flex items-center gap-2 ${
                    selectedMarkId === mark.id ? 'border-black' : 'border-border'
                  }`}
                >
                  <button
                    onClick={() => setSelectedMarkId((prev) => (prev === mark.id ? null : mark.id))}
                    className="flex-1 text-left min-w-0"
                  >
                    <p className="text-[11px] font-semibold truncate">{mark.title}</p>
                    <div className="flex items-center gap-1.5">
                      <span
                        className="inline-block w-2.5 h-2.5 rounded-full border border-black/10"
                        style={{ backgroundColor: normalizeMapMarkColor(mark.color) }}
                      />
                      <p className="text-[10px] text-muted">{mark.visibility === 'public' ? t('admin.map.visibleForEveryone') : t('admin.map.visibleForAdminsOnly')}</p>
                    </div>
                  </button>
                  <button
                    onClick={() => void handleDeleteMapMark(mark.id)}
                    className="w-9 h-9 rounded-lg bg-surface hover:bg-red-50 hover:text-red-600 transition-colors flex items-center justify-center flex-shrink-0"
                    title={t('admin.map.deleteMapMark')}
                  >
                    <Trash size={14} />
                  </button>
                </div>
              ))}
            </div>
            {mapMarkError && <p className="text-[11px] text-red-600">{mapMarkError}</p>}
            </>
            )}
          </div>
        )}
        </>
        )}
      </div>
      )}

      {/* Sidebar expand — only control when panel is fully hidden */}
      {!isMapMarkViewMode && sidebarCollapsed && (
        <button
          onClick={onToggleSidebar}
          className="absolute top-1/2 left-3 -translate-y-1/2 z-[1000] w-10 h-10 bg-white border border-border rounded-full shadow-card flex items-center justify-center hover:bg-surface transition-colors touch-none"
          title={t('admin.sidebar.expandPanel')}
          aria-label={t('admin.sidebar.expandPanel')}
        >
          <CaretRight size={16} weight="bold" />
        </button>
      )}

      <MapContainer
        center={[mapCenter.lat, mapCenter.lng]}
        zoom={mapZoom}
        zoomControl={false}
        style={{ width: '100%', height: '100%' }}
      >
        <LocalizedTileLayer />
        <MapViewportPersistence onViewportChange={handleMapViewportChange} />
        <FlyToHelper target={flyTarget} />
        <FlyToZoneBounds zone={selectedZone} focusKey={zoneFocusKey} />
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
              if (request.id === editingRequestId) return null
              const highlighted = request.id === selectedReqId
              const dropoffColor = getDropoffColor(request)
              return (
                <div key={request.id}>
                  <Marker
                    position={[request.to.latlng.lat, request.to.latlng.lng]}
                    icon={makeSolidPointIcon(dropoffColor, highlighted ? 36 : SMALL_POINT_SIZE, highlighted ? 'B' : undefined)}
                    eventHandlers={{ click: () => handleSelectRequest(request.id) }}
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
                  {step.type === 'pickup' ? t('admin.map.pickupLegend') : t('admin.map.dropoffAction')}: {step.passengerName} ★{passengerRatingFromRequests(requests, step.rideId).rating.toFixed(1)}
                </Tooltip>
                <Popup autoPan className="marker-driver-label">
                  <div className="text-xs">
                    <p className="font-bold">{idx + 1}. {step.type === 'pickup' ? t('admin.map.pickupLegend') : t('admin.map.dropoffAction')}: {step.passengerName}</p>
                    <RatingBadge
                      rating={passengerRatingFromRequests(requests, step.rideId).rating}
                      ratingCount={passengerRatingFromRequests(requests, step.rideId).ratingCount}
                      size="sm"
                    />
                    <p className="mt-1">{step.address}</p>
                  </div>
                </Popup>
              </Marker>
            ))}
          </Pane>
        )}

        {serviceZones.map((zone) => {
          const highlighted = zone.id === selectedZoneId
          return (
            <Polygon
              key={zone.id}
              positions={zone.polygon.map((point) => [point.lat, point.lng] as [number, number])}
              pathOptions={{
                color: zone.color,
                fillColor: zone.color,
                fillOpacity: highlighted ? 0.22 : zone.isActive ? 0.12 : 0.04,
                opacity: highlighted ? 1 : zone.isActive ? 0.8 : 0.3,
                weight: highlighted ? 3 : 2,
              }}
            />
          )
        })}

        {isDrawing && drawingPoints.map((point, index) => (
          <Marker
            key={`zone-draw-point-${index}`}
            position={[point.lat, point.lng]}
            icon={makeSolidPointIcon(newZoneColor, index === 0 ? 20 : 14, String(index + 1))}
          />
        ))}
        {isDrawing && drawingPoints.length >= 2 && (
          <Polyline
            positions={drawingPoints.map((point) => [point.lat, point.lng] as [number, number])}
            pathOptions={{
              color: newZoneColor,
              weight: 2,
              opacity: 0.9,
              dashArray: '6, 4',
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
        {mapMarks.map((mark) => {
          const highlighted = selectedMarkId === mark.id
          return (
            <Marker
              key={`map-mark-${mark.id}`}
              position={[mark.position.lat, mark.position.lng]}
              icon={makeMapMarkIcon(mark.color, highlighted ? 40 : 30)}
              eventHandlers={{
                click: () => setSelectedMarkId(mark.id),
                popupopen: () => setOpenedMarkPopupId(mark.id),
                popupclose: () => {
                  setOpenedMarkPopupId((current) => (current === mark.id ? null : current))
                  setSelectedMarkId((current) => (current === mark.id ? null : current))
                },
              }}
            >
              <Popup autoPan className="map-mark-popup">
                <div className="text-xs min-w-[min(220px,70vw)] max-w-[80vw]">
                  <p className="font-bold">{mark.title}</p>
                  <p className="text-[11px] text-muted">
                    {mark.visibility === 'public' ? t('admin.map.visibleForEveryone') : t('admin.map.visibleForAdminsOnly')}
                  </p>
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
          )
        })}

        {/* Draft map mark preview */}
        {draftMarkPosition && (
          <Marker
            position={[draftMarkPosition.lat, draftMarkPosition.lng]}
            icon={makeMapMarkIcon(markColor, 42)}
          />
        )}

        {isDrawing && !isRouteEditMode && <DrawingClickHandler onPoint={onDrawPoint} />}
        <MapMarkPlacementHandler
          enabled={isMarkModeEnabled && !isRouteEditMode}
          onPlace={setDraftMarkPosition}
        />
        {routeEditDraft && (
          <>
            <FlyToDraftBounds draft={routeEditDraft} />
            <RouteEditMapClickHandler
              enabled={!isDrawing}
              onPick={(latlng) => void handleMoveEditPoint(routeEditDraft.active, latlng)}
            />
            <Pane name="route-edit-pane" style={{ zIndex: 1300 }}>
              <Polyline
                positions={[
                  [routeEditDraft.fromLatLng.lat, routeEditDraft.fromLatLng.lng],
                  [routeEditDraft.toLatLng.lat, routeEditDraft.toLatLng.lng],
                ]}
                pathOptions={{
                  color: '#000',
                  dashArray: '8, 8',
                  weight: 4,
                  opacity: 0.95,
                }}
              />
              <Marker
                position={[routeEditDraft.fromLatLng.lat, routeEditDraft.fromLatLng.lng]}
                icon={getRouteEditMarkerIcon('from', routeEditDraft.active)}
                draggable
                zIndexOffset={1400}
                eventHandlers={{
                  dragend(event) {
                    const marker = event.target as L.Marker
                    const pos = marker.getLatLng()
                    void handleMoveEditPoint('from', { lat: pos.lat, lng: pos.lng })
                  },
                  click() {
                    onRouteEditDraftChange({ ...routeEditDraft, active: 'from' })
                  },
                }}
              />
              <Marker
                position={[routeEditDraft.toLatLng.lat, routeEditDraft.toLatLng.lng]}
                icon={getRouteEditMarkerIcon('to', routeEditDraft.active)}
                draggable
                zIndexOffset={1400}
                eventHandlers={{
                  dragend(event) {
                    const marker = event.target as L.Marker
                    const pos = marker.getLatLng()
                    void handleMoveEditPoint('to', { lat: pos.lat, lng: pos.lng })
                  },
                  click() {
                    onRouteEditDraftChange({ ...routeEditDraft, active: 'to' })
                  },
                }}
              />
            </Pane>
          </>
        )}

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
                <div className="text-center leading-tight">
                  <div>{driver.name}</div>
                  <RatingBadge rating={driver.rating} variant="compact" size="sm" className="justify-center" />
                </div>
              </Tooltip>
            </Marker>
          ))}
      </MapContainer>

      {/* Drawing hint banner */}
      {!isMapMarkViewMode && isDrawing && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-[1000] px-4 py-2 rounded-pill bg-black text-white text-xs font-semibold shadow-card animate-fade-in">
          {t('admin.map.zoneDrawingHint', { count: drawingPoints.length })}
        </div>
      )}
      {!isMapMarkViewMode && isMarkModeEnabled && (
        <div className="absolute top-28 left-1/2 -translate-x-1/2 z-[1000] px-4 py-2 rounded-pill bg-black text-white text-xs font-semibold shadow-card animate-fade-in">
          {t('admin.map.markerPlacementHint')}
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

      {/* Similar Trips Panel */}
      {!isMapMarkViewMode && !isRouteEditMode && showSimilarPanel && (
        <div className="admin-map-route-panel absolute bottom-4 left-4 w-[380px] max-h-[50vh] bg-white rounded-card shadow-card z-[1000] animate-slide-up overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-2">
              <Lightning size={16} weight="bold" className="text-amber-500" />
              <span className="text-sm font-bold">{t('admin.map.similarTrips')}</span>
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
              <p className="text-xs text-muted">{t('admin.map.findingSimilar')}</p>
            ) : similarError ? (
              <p className="text-xs text-muted">{similarError}</p>
            ) : similarGroups.length === 0 ? (
              <p className="text-xs text-muted">{t('admin.map.noSimilarGroups')}</p>
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
                      <span className="font-semibold">{t('admin.map.routeStats', { km: group.totalKm.toFixed(1), min: Math.round(group.totalMin) })}</span>
                      <span className="text-green-600 font-semibold">{t('admin.map.savingsStats', { km: group.savingsKm.toFixed(1), min: Math.round(group.savingsMin) })}</span>
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
                      {selectedSimilarGroupId === group.id ? t('admin.map.hideRoute') : t('admin.map.showRoute')}
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
                              {step.type === 'pickup' ? t('admin.map.pickupLegend') : t('admin.map.dropoffAction')}: {step.passengerName}
                            </p>
                            <RatingBadge
                              rating={passengerRatingFromRequests(requests, step.rideId).rating}
                              ratingCount={passengerRatingFromRequests(requests, step.rideId).ratingCount}
                              size="sm"
                            />
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
                      {t('admin.map.assignGroup', { count: group.requestIds.length })}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Route edit bottom bar */}
      {routeEditDraft && editingRequest && (
        <AdminRouteEditBar
          draft={routeEditDraft}
          passengerName={editingRequest.passengerName}
          passengerRating={editingRequest.passengerRating}
          passengerRatingCount={editingRequest.passengerRatingCount}
          rideNumber={editingRequest.rideNumber}
          isSaving={isSavingRoute}
          onDraftChange={onRouteEditDraftChange}
          onCancel={onCancelRouteEdit}
          onSave={onSaveRouteEdit}
          onReset={onResetRouteEdit}
        />
      )}

      {/* Selected request detail card */}
      {!isMapMarkViewMode && !isRouteEditMode && selectedReq && status && (
        <div
          className="admin-map-detail-card absolute right-4 w-[340px] bg-white rounded-card shadow-card z-[1000] animate-slide-up overflow-hidden"
          style={{ top: `${floatingPanelsTop}px` }}
        >
          <div className="px-4 py-3 border-b border-border flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold truncate">{selectedReq.passengerName}</p>
              <RatingBadge
                rating={selectedReq.passengerRating ?? 5}
                ratingCount={selectedReq.passengerRatingCount}
                size="sm"
              />
              <p className="text-[11px] text-muted mt-0.5">{t('common.rideShort', { number: selectedReq.rideNumber })}</p>
            </div>
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded-pill flex-shrink-0"
              style={{ color: status.color, background: status.bg }}
            >
              {t(status.labelKey)}
            </span>
            <button
              onClick={() => handleSelectRequest(null)}
              className="p-1.5 hover:bg-surface rounded-xl flex-shrink-0 transition-colors -my-1 -mr-1"
            >
              <X size={14} />
            </button>
          </div>

          <div className="px-4 py-3 space-y-3">
            <div className="flex gap-3">
              <div className="flex flex-col items-center pt-1.5 flex-shrink-0">
                <div
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: getPickupColor(selectedReq) }}
                />
                <div className="w-px flex-1 bg-border my-1 min-h-3" />
                <div
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: getDropoffColor(selectedReq) }}
                />
              </div>
              <div className="flex-1 min-w-0 text-xs space-y-2.5">
                <a
                  href={showOnMapHref(selectedReq.from.latlng, t('admin.map.navPickup'))}
                  target="_blank"
                  rel="noreferrer"
                  className="block group"
                  onClick={(e) => e.stopPropagation()}
                >
                  <p className="text-[10px] font-semibold text-muted uppercase tracking-wider">{t('passenger.fromLabel')}</p>
                  <p className="font-medium group-hover:underline inline-flex items-center gap-1">
                    {selectedReq.from.address}
                    <ArrowSquareOut size={10} className="opacity-50 group-hover:opacity-100" />
                  </p>
                </a>
                <a
                  href={showOnMapHref(selectedReq.to.latlng, t('admin.map.navDestination'))}
                  target="_blank"
                  rel="noreferrer"
                  className="block group"
                  onClick={(e) => e.stopPropagation()}
                >
                  <p className="text-[10px] font-semibold text-muted uppercase tracking-wider">{t('passenger.toLabel')}</p>
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
                  <RatingBadge rating={assignedDriver.rating} size="sm" />
                  <p className="text-[10px] text-muted truncate mt-0.5">
                    {assignedDriver.carModel} · {assignedDriver.carPlate}
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="px-4 pb-4 space-y-2">
            {selectedReq.status !== 'completed' && (
              <button
                onClick={() => onOpenEditRoute(selectedReq.id)}
                className="w-full py-2.5 border border-border bg-white rounded-xl text-xs font-bold transition-all active:scale-[0.97]"
              >
                {t('admin.editRoute.title', { defaultValue: 'Edit route' })}
              </button>
            )}
            {!selectedReq.driverId && (
              <button
                onClick={() => onOpenAssignModal([selectedReq.id])}
                className="w-full py-2.5 bg-black text-white rounded-xl text-xs font-bold transition-all active:scale-[0.97]"
              >
                {t('admin.requests.assignDriver')}
              </button>
            )}
          </div>
        </div>
      )}
    </main>
  )
}
