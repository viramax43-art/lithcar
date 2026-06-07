import type { AdminKeyInfo, AdminQrSaleAudit, AdminSessionUser } from '../../../lib/backend'
import type { Driver, DriverApplication, DriverRegistrationFormSchema, GroupSuggestion, LatLng, PricingSettings, RideRequest, ServiceZone } from '../../../types'
import type { AdminTab, MapColorGroupKey } from '../constants'

export interface AdminSidebarProps {
  collapsed: boolean
  onToggleCollapse: () => void
  activeTab: AdminTab
  setActiveTab: (tab: AdminTab) => void
  filterStatus: string
  setFilterStatus: (status: string) => void
  filterDate: string
  filterDateEnd: string
  filterTime: string
  filterTimeEnd: string
  enabledColors: Set<MapColorGroupKey>
  requests: RideRequest[]
  requestsTotal: number
  isLoadingMoreRequests: boolean
  onLoadMoreRequests: () => void
  searchQuery: string
  setSearchQuery: (query: string) => void
  selectedReqId: string | null
  setSelectedReqId: (id: string | null) => void
  setAssignModalReqIds: (ids: string[] | null) => void
  suggestions: GroupSuggestion[]
  selectedGroupId: string | null
  setSelectedGroupId: (id: string | null) => void
  groupColorMap: Record<string, string>
  drivers: Driver[]
  expandedDriverId: string | null
  setExpandedDriverId: (id: string | null) => void
  isDrawing: boolean
  setIsDrawing: (value: boolean) => void
  newZoneName: string
  setNewZoneName: (value: string) => void
  newZoneColor: string
  setNewZoneColor: (value: string) => void
  drawingPoints: LatLng[]
  setDrawingPoints: (updater: (prev: LatLng[]) => LatLng[]) => void
  handleCreateZone: () => Promise<void>
  serviceZones: ServiceZone[]
  selectedZoneId: string | null
  setSelectedZoneId: (id: string | null) => void
  handleToggleZone: (zone: ServiceZone) => Promise<void>
  handleDeleteZone: (zoneId: string) => Promise<void>
  pricing: PricingSettings
  qrSales: AdminQrSaleAudit[]
  hasLoadedQrSalesOnce: boolean
  handlePricingChange: (
    payload: Partial<
      Pick<
        PricingSettings,
        | 'pointsPerRide'
        | 'pointPriceCents'
        | 'pricingMode'
        | 'pricingFormula'
        | 'userInfoText'
        | 'userInfoTextProfile'
        | 'workStartTime'
        | 'workEndTime'
        | 'slotIntervalMinutes'
      >
    >,
  ) => Promise<void>
  adminSession: AdminSessionUser
  newManagedKeyName: string
  setNewManagedKeyName: (value: string) => void
  newManagedKeyRole: 'admin' | 'moderator'
  setNewManagedKeyRole: (value: 'admin' | 'moderator') => void
  handleCreateManagedKey: () => Promise<void>
  lastCreatedAdminKey: string | null
  rotatedAdminKeys: Record<string, string>
  managedAdminKeys: AdminKeyInfo[]
  handleRevokeManagedKey: (keyId: string) => Promise<void>
  handleRotateManagedKey: (keyId: string) => Promise<void>
  handleUpdateManagedKey: (
    keyId: string,
    payload: Partial<{ name: string; role: 'admin' | 'moderator' }>
  ) => Promise<void>
  newDriverName: string
  setNewDriverName: (value: string) => void
  newDriverPhotoPreview: string | null
  setNewDriverPhotoFile: (file: File | null) => void
  setNewDriverPhotoPreview: (value: string | null) => void
  newDriverCarBrand: string
  setNewDriverCarBrand: (value: string) => void
  newDriverCarModel: string
  setNewDriverCarModel: (value: string) => void
  newDriverCarPlate: string
  setNewDriverCarPlate: (value: string) => void
  newDriverVehicleColor: string
  setNewDriverVehicleColor: (value: string) => void
  newDriverSeatsCount: number
  setNewDriverSeatsCount: (value: number) => void
  newDriverAbout: string
  setNewDriverAbout: (value: string) => void
  newDriverCanSellPoints: boolean
  setNewDriverCanSellPoints: (value: boolean) => void
  newDriverCanSelfAssign: boolean
  setNewDriverCanSelfAssign: (value: boolean) => void
  lastCreatedDriverKey: string | null
  rotatedDriverKeys: Record<string, string>
  handleCreateDriver: () => Promise<void>
  handleRotateDriverKey: (driverId: string) => Promise<void>
  handleUpdateDriver: (
    driverId: string,
    payload: Partial<{
      name: string
      carBrand: string
      carModel: string
      carPlate: string
      vehicleColor: string
      seatsCount: number
      about: string
      isOnline: boolean
      canSellPoints: boolean
      canSelfAssign: boolean
    }>
  ) => Promise<void>
  handleDeleteDriver: (driverId: string) => Promise<void>
  driverApplications: DriverApplication[]
  driverApplicationsPendingCount: number
  driverRegistrationFormSchema: DriverRegistrationFormSchema
  lastApprovedDriverApplicationKey: string | null
  handleRefreshDriverApplications: () => Promise<void>
  handleSaveDriverRegistrationForm: (schema: DriverRegistrationFormSchema) => Promise<void>
  handleApproveDriverApplication: (applicationId: string) => Promise<string>
  handleRejectDriverApplication: (applicationId: string, reason?: string) => Promise<void>
}
