import type { MapMarkVisibility } from '../types'
import type { AdminTab, MapColorGroupKey } from '../pages/admin/constants'
import { MAP_COLOR_GROUPS, ZONE_COLORS } from '../pages/admin/constants'
import { getDefaultPeriodFilter } from './periodFilter'

export const ADMIN_UI_STATE_STORAGE_KEY = 'lithcar_admin_ui_v1'
export const ADMIN_UI_STATE_VERSION = 1

const VILNIUS_CENTER = { lat: 54.6872, lng: 25.2797 }
const DEFAULT_PERIOD = getDefaultPeriodFilter()

function isMobileViewport(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(max-width: 768px)').matches
}

export interface AdminDashboardUiSlice {
  activeTab: AdminTab
  filterStatus: string
  selectedReqId: string | null
  selectedGroupId: string | null
  selectedZoneId: string | null
  expandedDriverId: string | null
  sidebarCollapsed: boolean
  filterDate: string
  filterDateEnd: string
  filterTime: string
  filterTimeEnd: string
  enabledColors: MapColorGroupKey[]
  searchQuery: string
  assignDriverId: string
  isDrawing: boolean
  drawingPoints: { lat: number; lng: number }[]
  newZoneName: string
  newZoneColor: string
  newDriverName: string
  newDriverCarBrand: string
  newDriverCarModel: string
  newDriverCarPlate: string
  newDriverVehicleColor: string
  newDriverSeatsCount: number
  newDriverAbout: string
  newDriverCanSellPoints: boolean
  newDriverCanSelfAssign: boolean
  newManagedKeyName: string
  newManagedKeyRole: 'admin' | 'moderator'
}

export interface AdminMapUiSlice {
  searchOpen: boolean
  mapSearchQuery: string
  showSimilarPanel: boolean
  isFilterBarCollapsed: boolean
  isControlsCollapsed: boolean
  isMarksPanelCollapsed: boolean
  isMarkModeEnabled: boolean
  markTitle: string
  markColor: string
  markVisibility: MapMarkVisibility
  selectedSimilarGroupId: string | null
  selectedSimilarStepKey: string | null
  selectedMarkId: string | null
  openedMarkPopupId: string | null
  centerLat: number
  centerLng: number
  zoom: number
}

export interface AdminSidebarUiSlice {
  showDriverForm: boolean
  showStaffForm: boolean
  editingDriverId: string | null
  editingStaffId: string | null
  manualGroupIds: string[]
}

export interface AdminDriverRegistrationUiSlice {
  showBuilder: boolean
  expandedFieldId: string | null
  selectedApplicationId: string | null
  formDraft: unknown | null
}

export interface AdminZonesSettingsUiSlice {
  userInfoMainDraft: unknown | null
  userInfoProfileDraft: unknown | null
}

export interface AdminPricingUiSlice {
  formulaDraft: unknown | null
  fixedRideEuroDraft: number | null
  quoteFromLat: number
  quoteFromLng: number
  quoteToLat: number
  quoteToLng: number
  activeQuotePoint: 'from' | 'to'
}

export interface AdminUiState {
  v: number
  dashboard?: Partial<AdminDashboardUiSlice>
  map?: Partial<AdminMapUiSlice>
  sidebar?: Partial<AdminSidebarUiSlice>
  driverRegistration?: Partial<AdminDriverRegistrationUiSlice>
  zonesSettings?: Partial<AdminZonesSettingsUiSlice>
  pricing?: Partial<AdminPricingUiSlice>
}

export const DEFAULT_ADMIN_DASHBOARD_UI: AdminDashboardUiSlice = {
  activeTab: 'requests',
  filterStatus: 'pending',
  selectedReqId: null,
  selectedGroupId: null,
  selectedZoneId: null,
  expandedDriverId: null,
  // On mobile start with the drawer expanded so new admins see the content lists.
  sidebarCollapsed: !isMobileViewport(),
  filterDate: DEFAULT_PERIOD.filterDate,
  filterDateEnd: DEFAULT_PERIOD.filterDateEnd,
  filterTime: DEFAULT_PERIOD.filterTime,
  filterTimeEnd: DEFAULT_PERIOD.filterTimeEnd,
  enabledColors: MAP_COLOR_GROUPS.map((group) => group.key),
  searchQuery: '',
  assignDriverId: '',
  isDrawing: false,
  drawingPoints: [],
  newZoneName: '',
  newZoneColor: ZONE_COLORS[0],
  newDriverName: '',
  newDriverCarBrand: '',
  newDriverCarModel: '',
  newDriverCarPlate: '',
  newDriverVehicleColor: '',
  newDriverSeatsCount: 4,
  newDriverAbout: '',
  newDriverCanSellPoints: false,
  newDriverCanSelfAssign: false,
  newManagedKeyName: '',
  newManagedKeyRole: 'admin',
}

function defaultMapFilterCollapsed(): boolean {
  return isMobileViewport()
}

export const DEFAULT_ADMIN_MAP_UI: AdminMapUiSlice = {
  searchOpen: false,
  mapSearchQuery: '',
  showSimilarPanel: false,
  isFilterBarCollapsed: defaultMapFilterCollapsed(),
  isControlsCollapsed: false,
  isMarksPanelCollapsed: false,
  isMarkModeEnabled: false,
  markTitle: '',
  markColor: '#EF4444',
  markVisibility: 'admin_only',
  selectedSimilarGroupId: null,
  selectedSimilarStepKey: null,
  selectedMarkId: null,
  openedMarkPopupId: null,
  centerLat: VILNIUS_CENTER.lat,
  centerLng: VILNIUS_CENTER.lng,
  zoom: 12,
}

export const DEFAULT_ADMIN_SIDEBAR_UI: AdminSidebarUiSlice = {
  showDriverForm: false,
  showStaffForm: false,
  editingDriverId: null,
  editingStaffId: null,
  manualGroupIds: [],
}

let cachedRaw: AdminUiState | null = null

function readRawState(): AdminUiState {
  if (cachedRaw) return cachedRaw
  try {
    const raw = window.localStorage.getItem(ADMIN_UI_STATE_STORAGE_KEY)
    if (!raw) {
      cachedRaw = { v: ADMIN_UI_STATE_VERSION }
      return cachedRaw
    }
    const parsed = JSON.parse(raw) as AdminUiState
    if (parsed.v !== ADMIN_UI_STATE_VERSION) {
      cachedRaw = { v: ADMIN_UI_STATE_VERSION }
      return cachedRaw
    }
    cachedRaw = parsed
    return parsed
  } catch {
    cachedRaw = { v: ADMIN_UI_STATE_VERSION }
    return cachedRaw
  }
}

function writeRawState(next: AdminUiState): void {
  cachedRaw = next
  try {
    window.localStorage.setItem(ADMIN_UI_STATE_STORAGE_KEY, JSON.stringify(next))
  } catch {
    /* quota exceeded — ignore */
  }
}

export function readAdminUiSlice<Slice extends keyof AdminUiState>(
  slice: Slice,
): AdminUiState[Slice] | undefined {
  const raw = readRawState()
  return raw[slice]
}

export function patchAdminUiState(patch: Partial<AdminUiState>): void {
  const current = readRawState()
  writeRawState({
    v: ADMIN_UI_STATE_VERSION,
    dashboard: patch.dashboard ? { ...current.dashboard, ...patch.dashboard } : current.dashboard,
    map: patch.map ? { ...current.map, ...patch.map } : current.map,
    sidebar: patch.sidebar ? { ...current.sidebar, ...patch.sidebar } : current.sidebar,
    driverRegistration: patch.driverRegistration
      ? { ...current.driverRegistration, ...patch.driverRegistration }
      : current.driverRegistration,
    zonesSettings: patch.zonesSettings
      ? { ...current.zonesSettings, ...patch.zonesSettings }
      : current.zonesSettings,
    pricing: patch.pricing ? { ...current.pricing, ...patch.pricing } : current.pricing,
  })
}

export function getInitialDashboardUi(): AdminDashboardUiSlice {
  const stored = readAdminUiSlice('dashboard') ?? {}
  return { ...DEFAULT_ADMIN_DASHBOARD_UI, ...stored }
}

export function getInitialMapUi(): AdminMapUiSlice {
  const stored = readAdminUiSlice('map') ?? {}
  return { ...DEFAULT_ADMIN_MAP_UI, ...stored }
}

export function getInitialSidebarUi(): AdminSidebarUiSlice {
  const stored = readAdminUiSlice('sidebar') ?? {}
  return { ...DEFAULT_ADMIN_SIDEBAR_UI, ...stored }
}

export function getInitialDriverRegistrationUi(): AdminDriverRegistrationUiSlice {
  const stored = readAdminUiSlice('driverRegistration') ?? {}
  return {
    showBuilder: stored.showBuilder ?? false,
    expandedFieldId: stored.expandedFieldId ?? null,
    selectedApplicationId: stored.selectedApplicationId ?? null,
    formDraft: stored.formDraft ?? null,
  }
}

export function getInitialZonesSettingsUi(): AdminZonesSettingsUiSlice {
  const stored = readAdminUiSlice('zonesSettings') ?? {}
  return {
    userInfoMainDraft: stored.userInfoMainDraft ?? null,
    userInfoProfileDraft: stored.userInfoProfileDraft ?? null,
  }
}

export function getInitialPricingUi(): AdminPricingUiSlice {
  const stored = readAdminUiSlice('pricing') ?? {}
  return {
    formulaDraft: stored.formulaDraft ?? null,
    fixedRideEuroDraft: stored.fixedRideEuroDraft ?? null,
    quoteFromLat: stored.quoteFromLat ?? VILNIUS_CENTER.lat,
    quoteFromLng: stored.quoteFromLng ?? VILNIUS_CENTER.lng,
    quoteToLat: stored.quoteToLat ?? 54.7,
    quoteToLng: stored.quoteToLng ?? 25.3,
    activeQuotePoint: stored.activeQuotePoint ?? 'from',
  }
}
