import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { DEFAULT_DRIVER_REGISTRATION_FORM } from '../../lib/driverRegistrationDefaults'
import { DEFAULT_PRICING_SETTINGS } from '../../lib/pricingDefaults'
import type { AppNotification, Driver, DriverApplication, DriverRegistrationFormSchema, GroupSuggestion, LatLng, PricingSettings, RideRequest, ServiceZone } from '../../types'
import {
  approveDriverApplication,
  assignDriverBulk,
  createAdminKey,
  createDriver,
  deleteDriver,
  deleteAdminKey,
  createServiceZone,
  deleteServiceZone,
  getAdminSession,
  getDriverRegistrationSettings,
  getPricing,
  listAdminRequests,
  listAdminKeys,
  listDriverApplications,
  listDrivers,
  listAdminQrSales,
  listServiceZones,
  loginAdminByKey,
  logoutAdminSession,
  patchAdminRideRoute,
  rejectDriverApplication,
  rotateAdminKey,
  rotateDriverKey,
  uploadDriverPhoto,
  updateAdminKey,
  updateDriver,
  updateDriverRegistrationSettings,
  updatePricing,
  updateServiceZone,
  type AdminKeyInfo,
  type AdminSessionUser,
} from '../../lib/backend'
import { AdminAssignDriverModal } from './components/AdminAssignDriverModal'
import { isOverridden, toRideDraft, type RideDraft } from './components/AssignDriverModalParts'
import AdminMap from './components/AdminMap'
import AdminSidebar from './components/AdminSidebar'
import { AdminErrorToast, AdminHeader, AdminLoginScreen, AdminSessionChecking } from './components/AdminDashboardViews'
import { getInitialDashboardUi, getInitialDriverRegistrationUi } from '../../lib/adminUiState'
import { usePersistAdminUiSlice } from '../../lib/useAdminUiPersistence'
import { GROUP_COLORS, type AdminTab, type MapColorGroupKey } from './constants'

const ADMIN_DASHBOARD_POLL_MS = 10_000
const INITIAL_DASHBOARD_UI = getInitialDashboardUi()

export default function AdminDashboard() {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<AdminTab>(INITIAL_DASHBOARD_UI.activeTab)
  const [requests, setRequests] = useState<RideRequest[]>([])
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [suggestions, setSuggestions] = useState<GroupSuggestion[]>([])
  const [serviceZones, setServiceZones] = useState<ServiceZone[]>([])
  const [pricing, setPricing] = useState<PricingSettings>(DEFAULT_PRICING_SETTINGS)
  const [qrSales, setQrSales] = useState<Awaited<ReturnType<typeof listAdminQrSales>>['items']>([])
  const [hasLoadedQrSalesOnce, setHasLoadedQrSalesOnce] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [adminSession, setAdminSession] = useState<AdminSessionUser | null>(null)
  const [adminKeyInput, setAdminKeyInput] = useState('')
  const [isAdminAuthorizing, setIsAdminAuthorizing] = useState(false)
  const [isInitialAdminCheckDone, setIsInitialAdminCheckDone] = useState(false)
  const [managedAdminKeys, setManagedAdminKeys] = useState<AdminKeyInfo[]>([])
  const [newManagedKeyName, setNewManagedKeyName] = useState(INITIAL_DASHBOARD_UI.newManagedKeyName)
  const [newManagedKeyRole, setNewManagedKeyRole] = useState<'admin' | 'moderator'>(INITIAL_DASHBOARD_UI.newManagedKeyRole)
  const [lastCreatedAdminKey, setLastCreatedAdminKey] = useState<string | null>(null)
  const [rotatedAdminKeys, setRotatedAdminKeys] = useState<Record<string, string>>({})

  const [filterStatus, setFilterStatus] = useState(INITIAL_DASHBOARD_UI.filterStatus)
  const [selectedReqId, setSelectedReqId] = useState<string | null>(INITIAL_DASHBOARD_UI.selectedReqId)
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(INITIAL_DASHBOARD_UI.selectedGroupId)
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(INITIAL_DASHBOARD_UI.selectedZoneId)
  const [expandedDriverId, setExpandedDriverId] = useState<string | null>(INITIAL_DASHBOARD_UI.expandedDriverId)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(INITIAL_DASHBOARD_UI.sidebarCollapsed)
  const [filterDate, setFilterDate] = useState<string>(INITIAL_DASHBOARD_UI.filterDate)
  const [filterDateEnd, setFilterDateEnd] = useState<string>(INITIAL_DASHBOARD_UI.filterDateEnd)
  const [filterTime, setFilterTime] = useState<string>(INITIAL_DASHBOARD_UI.filterTime)
  const [filterTimeEnd, setFilterTimeEnd] = useState<string>(INITIAL_DASHBOARD_UI.filterTimeEnd)
  const [enabledColors, setEnabledColors] = useState<Set<MapColorGroupKey>>(
    () => new Set(INITIAL_DASHBOARD_UI.enabledColors),
  )
  const handleToggleColor = (key: MapColorGroupKey) => {
    setEnabledColors((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }
  const [requestsTotal, setRequestsTotal] = useState(0)
  const [isLoadingMoreRequests, setIsLoadingMoreRequests] = useState(false)
  const [searchQuery, setSearchQuery] = useState(INITIAL_DASHBOARD_UI.searchQuery)

  const [assignModalReqIds, setAssignModalReqIds] = useState<string[] | null>(null)
  const [routeEditDraft, setRouteEditDraft] = useState<RideDraft | null>(null)
  const [isSavingRoute, setIsSavingRoute] = useState(false)
  const [assignDriverId, setAssignDriverId] = useState<string>(INITIAL_DASHBOARD_UI.assignDriverId)
  const [isAssigning, setIsAssigning] = useState(false)

  const [isDrawing, setIsDrawing] = useState(INITIAL_DASHBOARD_UI.isDrawing)
  const [drawingPoints, setDrawingPoints] = useState<LatLng[]>(INITIAL_DASHBOARD_UI.drawingPoints)
  const [newZoneName, setNewZoneName] = useState(INITIAL_DASHBOARD_UI.newZoneName)
  const [newZoneColor, setNewZoneColor] = useState(INITIAL_DASHBOARD_UI.newZoneColor)
  const [newDriverName, setNewDriverName] = useState(INITIAL_DASHBOARD_UI.newDriverName)
  const [newDriverPhotoFile, setNewDriverPhotoFile] = useState<File | null>(null)
  const [newDriverPhotoPreview, setNewDriverPhotoPreview] = useState<string | null>(null)
  const [newDriverCarBrand, setNewDriverCarBrand] = useState(INITIAL_DASHBOARD_UI.newDriverCarBrand)
  const [newDriverCarModel, setNewDriverCarModel] = useState(INITIAL_DASHBOARD_UI.newDriverCarModel)
  const [newDriverCarPlate, setNewDriverCarPlate] = useState(INITIAL_DASHBOARD_UI.newDriverCarPlate)
  const [newDriverVehicleColor, setNewDriverVehicleColor] = useState(INITIAL_DASHBOARD_UI.newDriverVehicleColor)
  const [newDriverSeatsCount, setNewDriverSeatsCount] = useState(INITIAL_DASHBOARD_UI.newDriverSeatsCount)
  const [newDriverAbout, setNewDriverAbout] = useState(INITIAL_DASHBOARD_UI.newDriverAbout)
  const [newDriverCanSellPoints, setNewDriverCanSellPoints] = useState(INITIAL_DASHBOARD_UI.newDriverCanSellPoints)
  const [newDriverCanSelfAssign, setNewDriverCanSelfAssign] = useState(INITIAL_DASHBOARD_UI.newDriverCanSelfAssign)
  const [lastCreatedDriverKey, setLastCreatedDriverKey] = useState<string | null>(null)
  const [rotatedDriverKeys, setRotatedDriverKeys] = useState<Record<string, string>>({})
  const [driverApplications, setDriverApplications] = useState<DriverApplication[]>([])
  const [driverApplicationsPendingCount, setDriverApplicationsPendingCount] = useState(0)
  const [driverRegistrationFormSchema, setDriverRegistrationFormSchema] = useState<DriverRegistrationFormSchema>(
    DEFAULT_DRIVER_REGISTRATION_FORM,
  )
  const [lastApprovedDriverApplicationKey, setLastApprovedDriverApplicationKey] = useState<string | null>(null)
  const [selectedApplicationId, setSelectedApplicationId] = useState<string | null>(
    () => getInitialDriverRegistrationUi().selectedApplicationId,
  )

  const handleAdminNotificationSelect = useCallback((notification: AppNotification) => {
    const payload = notification.payload
    if (
      payload &&
      typeof payload === 'object' &&
      payload.kind === 'driver_application' &&
      typeof payload.applicationId === 'string'
    ) {
      setActiveTab('drivers')
      setSelectedApplicationId(payload.applicationId)
    }
  }, [])

  const dashboardUiPersistence = useMemo(
    () => ({
      activeTab,
      filterStatus,
      selectedReqId,
      selectedGroupId,
      selectedZoneId,
      expandedDriverId,
      sidebarCollapsed,
      filterDate,
      filterDateEnd,
      filterTime,
      filterTimeEnd,
      enabledColors: Array.from(enabledColors),
      searchQuery,
      assignDriverId,
      isDrawing,
      drawingPoints,
      newZoneName,
      newZoneColor,
      newDriverName,
      newDriverCarBrand,
      newDriverCarModel,
      newDriverCarPlate,
      newDriverVehicleColor,
      newDriverSeatsCount,
      newDriverAbout,
      newDriverCanSellPoints,
      newDriverCanSelfAssign,
      newManagedKeyName,
      newManagedKeyRole,
    }),
    [
      activeTab,
      filterStatus,
      selectedReqId,
      selectedGroupId,
      selectedZoneId,
      expandedDriverId,
      sidebarCollapsed,
      filterDate,
      filterDateEnd,
      filterTime,
      filterTimeEnd,
      enabledColors,
      searchQuery,
      assignDriverId,
      isDrawing,
      drawingPoints,
      newZoneName,
      newZoneColor,
      newDriverName,
      newDriverCarBrand,
      newDriverCarModel,
      newDriverCarPlate,
      newDriverVehicleColor,
      newDriverSeatsCount,
      newDriverAbout,
      newDriverCanSellPoints,
      newDriverCanSelfAssign,
      newManagedKeyName,
      newManagedKeyRole,
    ],
  )
  usePersistAdminUiSlice('dashboard', dashboardUiPersistence)

  const loadManagedKeys = useCallback(async () => {
    if (adminSession?.role !== 'chief_admin') return
    try {
      const page = await listAdminKeys({ limit: 100, offset: 0 })
      setManagedAdminKeys(page.items.filter((item) => item.role !== 'chief_admin' && item.isActive))
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t('admin.errors.loadKeysFailed'))
    }
  }, [adminSession?.role])

  const ADMIN_PAGE_SIZE = 50

  const loadAll = useCallback(async () => {
    if (!adminSession) return
    setErrorMessage(null)
    try {
      const [req, drv, zones, price, qrSalesPage, applicationsPage, registrationForm] = await Promise.all([
        listAdminRequests('all', { limit: ADMIN_PAGE_SIZE, offset: 0 }),
        listDrivers(false, { limit: 200, offset: 0 }),
        listServiceZones('cookie', { limit: 500, offset: 0 }),
        getPricing('cookie'),
        listAdminQrSales({ limit: 100, offset: 0, redeemedOnly: true }),
        listDriverApplications({ limit: 100, offset: 0 }),
        getDriverRegistrationSettings(),
      ])
      setRequests(req.items)
      setRequestsTotal(req.total)
      setDrivers(drv.items)
      setSuggestions([])
      setServiceZones(zones.items)
      setPricing(price)
      setQrSales(qrSalesPage.items)
      setHasLoadedQrSalesOnce(true)
      setDriverApplications(applicationsPage.items)
      setDriverApplicationsPendingCount(applicationsPage.pendingCount)
      setDriverRegistrationFormSchema(registrationForm)
      if (adminSession.role === 'chief_admin') {
        await loadManagedKeys()
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t('admin.errors.loadAdminDataFailed'))
    }
  }, [adminSession, loadManagedKeys])

  const loadMoreRequests = useCallback(async () => {
    if (isLoadingMoreRequests || requests.length >= requestsTotal) return
    setIsLoadingMoreRequests(true)
    try {
      const page = await listAdminRequests('all', { limit: ADMIN_PAGE_SIZE, offset: requests.length })
      setRequests((prev) => [...prev, ...page.items])
      setRequestsTotal(page.total)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t('errors.loadMoreRequestsFailed'))
    } finally {
      setIsLoadingMoreRequests(false)
    }
  }, [isLoadingMoreRequests, requests.length, requestsTotal])

  const startRouteEdit = useCallback((request: RideRequest) => {
    setRouteEditDraft(toRideDraft(request))
    setSelectedReqId(request.id)
  }, [])

  const cancelRouteEdit = useCallback(() => {
    setRouteEditDraft(null)
  }, [])

  const saveRouteEdit = useCallback(async () => {
    if (!routeEditDraft) return
    if (!isOverridden(routeEditDraft)) {
      setRouteEditDraft(null)
      return
    }
    setIsSavingRoute(true)
    setErrorMessage(null)
    try {
      await patchAdminRideRoute(routeEditDraft.requestId, {
        fromPoint: {
          address: routeEditDraft.fromAddress.trim() || routeEditDraft.originalFromAddress,
          latlng: routeEditDraft.fromLatLng,
        },
        toPoint: {
          address: routeEditDraft.toAddress.trim() || routeEditDraft.originalToAddress,
          latlng: routeEditDraft.toLatLng,
        },
      })
      await loadAll()
      setRouteEditDraft(null)
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : t('admin.errors.updateRouteFailed', { defaultValue: 'Failed to update route.' }),
      )
    } finally {
      setIsSavingRoute(false)
    }
  }, [loadAll, routeEditDraft, t])

  const resetRouteEdit = useCallback(() => {
    if (!routeEditDraft) return
    setRouteEditDraft({
      ...routeEditDraft,
      fromAddress: routeEditDraft.originalFromAddress,
      fromLatLng: { ...routeEditDraft.originalFromLatLng },
      toAddress: routeEditDraft.originalToAddress,
      toLatLng: { ...routeEditDraft.originalToLatLng },
    })
  }, [routeEditDraft])

  const ensureAdminSession = useCallback(async () => {
    try {
      const session = await getAdminSession()
      setAdminSession(session)
    } catch {
      setAdminSession(null)
    } finally {
      setIsInitialAdminCheckDone(true)
    }
  }, [])

  useEffect(() => {
    void ensureAdminSession()
  }, [ensureAdminSession])

  useEffect(() => {
    void loadAll()
    const pollTimer = window.setInterval(() => {
      void loadAll()
    }, ADMIN_DASHBOARD_POLL_MS)
    return () => window.clearInterval(pollTimer)
  }, [loadAll])

  const onlineDrivers = useMemo(() => drivers.filter((driver) => driver.isOnline), [drivers])

  const groupColorMap = useMemo(() => {
    const result: Record<string, string> = {}
    suggestions.forEach((suggestion, idx) => {
      result[suggestion.id] = GROUP_COLORS[idx % GROUP_COLORS.length]
    })
    return result
  }, [suggestions])

  const handleAssign = async () => {
    if (!assignModalReqIds || !assignDriverId) return
    setIsAssigning(true)
    try {
      await assignDriverBulk(assignModalReqIds, assignDriverId, [])
      await loadAll()
      setAssignModalReqIds(null)
      setAssignDriverId('')
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t('admin.errors.assignDriverFailed'))
    } finally {
      setIsAssigning(false)
    }
  }

  const handleCreateZone = async () => {
    if (drawingPoints.length < 3 || !newZoneName.trim()) return
    try {
      await createServiceZone({
        name: newZoneName.trim(),
        color: newZoneColor,
        polygon: drawingPoints,
        isActive: true,
      })
      await loadAll()
      setIsDrawing(false)
      setDrawingPoints([])
      setNewZoneName('')
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t('admin.errors.createZoneFailed'))
    }
  }

  const handleToggleZone = async (zone: ServiceZone) => {
    try {
      const updated = await updateServiceZone(zone.id, { isActive: !zone.isActive })
      setServiceZones((prev) => prev.map((item) => (item.id === updated.id ? updated : item)))
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t('admin.errors.toggleZoneFailed'))
    }
  }

  const handleDeleteZone = async (zoneId: string) => {
    try {
      await deleteServiceZone(zoneId)
      setServiceZones((prev) => prev.filter((zone) => zone.id !== zoneId))
      setSelectedZoneId(null)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t('admin.errors.deleteZoneFailed'))
    }
  }

  const handlePricingChange = async (
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
  ) => {
    try {
      const updated = await updatePricing(payload)
      setPricing(updated)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t('admin.errors.updatePricingFailed'))
    }
  }

  const handleAdminLogin = async () => {
    if (!adminKeyInput.trim()) return
    setIsAdminAuthorizing(true)
    setErrorMessage(null)
    try {
      const session = await loginAdminByKey(adminKeyInput.trim())
      setAdminSession(session)
      setAdminKeyInput('')
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t('admin.errors.loginFailed'))
    } finally {
      setIsAdminAuthorizing(false)
    }
  }

  const handleAdminLogout = async () => {
    try {
      await logoutAdminSession()
    } finally {
      setAdminSession(null)
      setManagedAdminKeys([])
      setLastCreatedAdminKey(null)
      setRotatedAdminKeys({})
      setLastCreatedDriverKey(null)
      setRotatedDriverKeys({})
    }
  }

  const handleCreateManagedKey = async () => {
    if (!newManagedKeyName.trim() || adminSession?.role !== 'chief_admin') return
    try {
      const result = await createAdminKey({
        name: newManagedKeyName.trim(),
        role: newManagedKeyRole,
      })
      setLastCreatedAdminKey(result.key)
      setNewManagedKeyName('')
      await loadManagedKeys()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t('admin.errors.createKeyFailed'))
    }
  }

  const handleDeleteManagedKey = async (keyId: string) => {
    if (adminSession?.role !== 'chief_admin') return
    try {
      await deleteAdminKey(keyId)
      await loadManagedKeys()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t('admin.errors.deleteStaffFailed'))
    }
  }

  const handleRotateManagedKey = async (keyId: string) => {
    if (adminSession?.role !== 'chief_admin') return
    try {
      const result = await rotateAdminKey(keyId)
      setRotatedAdminKeys((prev) => ({ ...prev, [keyId]: result.key }))
      await loadManagedKeys()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t('admin.errors.rotateStaffKeyFailed'))
    }
  }

  const handleUpdateManagedKey = async (keyId: string, payload: Partial<{ name: string; role: 'admin' | 'moderator' }>) => {
    if (adminSession?.role !== 'chief_admin') return
    try {
      await updateAdminKey(keyId, payload)
      await loadManagedKeys()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t('admin.errors.updateStaffFailed'))
    }
  }

  const handleCreateDriver = async () => {
    if (!newDriverName.trim() || !newDriverCarBrand.trim() || !newDriverCarModel.trim() || !newDriverCarPlate.trim()) {
      return
    }
    try {
      let uploadedPhotoKey: string | undefined
      if (newDriverPhotoFile) {
        const uploaded = await uploadDriverPhoto(newDriverPhotoFile)
        uploadedPhotoKey = uploaded.photoKey
      }
      const result = await createDriver({
        name: newDriverName.trim(),
        photoKey: uploadedPhotoKey,
        carBrand: newDriverCarBrand.trim(),
        carModel: newDriverCarModel.trim(),
        carPlate: newDriverCarPlate.trim(),
        vehicleColor: newDriverVehicleColor.trim() || 'Unknown',
        seatsCount: newDriverSeatsCount,
        licenseNumber: '',
        about: newDriverAbout.trim(),
        canSellPoints: newDriverCanSellPoints,
        canSelfAssign: newDriverCanSelfAssign,
      })
      setLastCreatedDriverKey(result.key)
      setNewDriverName('')
      setNewDriverPhotoFile(null)
      setNewDriverPhotoPreview(null)
      setNewDriverCarBrand('')
      setNewDriverCarModel('')
      setNewDriverCarPlate('')
      setNewDriverVehicleColor('')
      setNewDriverSeatsCount(4)
      setNewDriverAbout('')
      setNewDriverCanSellPoints(false)
      setNewDriverCanSelfAssign(false)
      await loadAll()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t('admin.errors.createDriverFailed'))
    }
  }

  const handleRotateDriverKey = async (driverId: string) => {
    try {
      const result = await rotateDriverKey(driverId)
      setRotatedDriverKeys((prev) => ({ ...prev, [driverId]: result.key }))
      setDrivers((prev) => prev.map((d) => (d.id === result.driver.id ? result.driver : d)))
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t('admin.errors.rotateDriverKeyFailed'))
    }
  }

  const handleUpdateDriver = async (driverId: string, payload: Parameters<typeof updateDriver>[1]) => {
    try {
      const updated = await updateDriver(driverId, payload)
      setDrivers((prev) => prev.map((d) => (d.id === updated.id ? updated : d)))
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t('admin.errors.updateDriverFailed'))
    }
  }

  const handleDeleteDriver = async (driverId: string) => {
    try {
      await deleteDriver(driverId)
      setDrivers((prev) => prev.filter((d) => d.id !== driverId))
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t('admin.errors.deleteDriverFailed'))
    }
  }

  const handleRefreshDriverApplications = useCallback(async () => {
    const page = await listDriverApplications({ limit: 100, offset: 0 })
    setDriverApplications(page.items)
    setDriverApplicationsPendingCount(page.pendingCount)
  }, [])

  const handleSaveDriverRegistrationForm = async (schema: DriverRegistrationFormSchema) => {
    try {
      const updated = await updateDriverRegistrationSettings(schema)
      setDriverRegistrationFormSchema(updated)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t('common.error'))
      throw error
    }
  }

  const handleApproveDriverApplication = async (applicationId: string) => {
    const result = await approveDriverApplication(applicationId)
    setLastApprovedDriverApplicationKey(result.key)
    await loadAll()
    return result.key
  }

  const handleRejectDriverApplication = async (applicationId: string, reason?: string) => {
    await rejectDriverApplication(applicationId, reason)
    await loadAll()
  }

  if (!isInitialAdminCheckDone) {
    return <AdminSessionChecking />
  }

  if (!adminSession) {
    return (
      <AdminLoginScreen
        adminKeyInput={adminKeyInput}
        isAdminAuthorizing={isAdminAuthorizing}
        errorMessage={errorMessage}
        onChangeKey={setAdminKeyInput}
        onLogin={() => void handleAdminLogin()}
      />
    )
  }

  return (
    <div className="h-[100dvh] flex flex-col bg-white overflow-hidden">
      <AdminHeader
        onlineDriversCount={onlineDrivers.length}
        adminSession={adminSession}
        onLogout={() => void handleAdminLogout()}
        onNotificationSelect={handleAdminNotificationSelect}
      />

      <div className="flex flex-1 overflow-hidden relative">
        <AdminSidebar
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed((v) => !v)}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          filterStatus={filterStatus}
          setFilterStatus={setFilterStatus}
          filterDate={filterDate}
          filterDateEnd={filterDateEnd}
          filterTime={filterTime}
          filterTimeEnd={filterTimeEnd}
          enabledColors={enabledColors}
          requests={requests}
          requestsTotal={requestsTotal}
          isLoadingMoreRequests={isLoadingMoreRequests}
          onLoadMoreRequests={() => void loadMoreRequests()}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          selectedReqId={selectedReqId}
          setSelectedReqId={setSelectedReqId}
          setAssignModalReqIds={setAssignModalReqIds}
          suggestions={suggestions}
          selectedGroupId={selectedGroupId}
          setSelectedGroupId={setSelectedGroupId}
          groupColorMap={groupColorMap}
          drivers={drivers}
          expandedDriverId={expandedDriverId}
          setExpandedDriverId={setExpandedDriverId}
          isDrawing={isDrawing}
          setIsDrawing={setIsDrawing}
          newZoneName={newZoneName}
          setNewZoneName={setNewZoneName}
          newZoneColor={newZoneColor}
          setNewZoneColor={setNewZoneColor}
          drawingPoints={drawingPoints}
          setDrawingPoints={(updater) => setDrawingPoints((prev) => updater(prev))}
          handleCreateZone={handleCreateZone}
          serviceZones={serviceZones}
          selectedZoneId={selectedZoneId}
          setSelectedZoneId={setSelectedZoneId}
          handleToggleZone={handleToggleZone}
          handleDeleteZone={handleDeleteZone}
          pricing={pricing}
          qrSales={qrSales}
          hasLoadedQrSalesOnce={hasLoadedQrSalesOnce}
          handlePricingChange={handlePricingChange}
          adminSession={adminSession}
          newManagedKeyName={newManagedKeyName}
          setNewManagedKeyName={setNewManagedKeyName}
          newManagedKeyRole={newManagedKeyRole}
          setNewManagedKeyRole={setNewManagedKeyRole}
          handleCreateManagedKey={handleCreateManagedKey}
          lastCreatedAdminKey={lastCreatedAdminKey}
          rotatedAdminKeys={rotatedAdminKeys}
          managedAdminKeys={managedAdminKeys}
          handleRevokeManagedKey={handleDeleteManagedKey}
          handleRotateManagedKey={handleRotateManagedKey}
          handleUpdateManagedKey={handleUpdateManagedKey}
          newDriverName={newDriverName}
          setNewDriverName={setNewDriverName}
          newDriverPhotoPreview={newDriverPhotoPreview}
          setNewDriverPhotoFile={setNewDriverPhotoFile}
          setNewDriverPhotoPreview={setNewDriverPhotoPreview}
          newDriverCarBrand={newDriverCarBrand}
          setNewDriverCarBrand={setNewDriverCarBrand}
          newDriverCarModel={newDriverCarModel}
          setNewDriverCarModel={setNewDriverCarModel}
          newDriverCarPlate={newDriverCarPlate}
          setNewDriverCarPlate={setNewDriverCarPlate}
          newDriverVehicleColor={newDriverVehicleColor}
          setNewDriverVehicleColor={setNewDriverVehicleColor}
          newDriverSeatsCount={newDriverSeatsCount}
          setNewDriverSeatsCount={setNewDriverSeatsCount}
          newDriverAbout={newDriverAbout}
          setNewDriverAbout={setNewDriverAbout}
          newDriverCanSellPoints={newDriverCanSellPoints}
          setNewDriverCanSellPoints={setNewDriverCanSellPoints}
          newDriverCanSelfAssign={newDriverCanSelfAssign}
          setNewDriverCanSelfAssign={setNewDriverCanSelfAssign}
          lastCreatedDriverKey={lastCreatedDriverKey}
          rotatedDriverKeys={rotatedDriverKeys}
          handleCreateDriver={handleCreateDriver}
          handleRotateDriverKey={handleRotateDriverKey}
          handleUpdateDriver={handleUpdateDriver}
          handleDeleteDriver={handleDeleteDriver}
          driverApplications={driverApplications}
          driverApplicationsPendingCount={driverApplicationsPendingCount}
          driverRegistrationFormSchema={driverRegistrationFormSchema}
          lastApprovedDriverApplicationKey={lastApprovedDriverApplicationKey}
          handleRefreshDriverApplications={handleRefreshDriverApplications}
          handleSaveDriverRegistrationForm={handleSaveDriverRegistrationForm}
          handleApproveDriverApplication={handleApproveDriverApplication}
          handleRejectDriverApplication={handleRejectDriverApplication}
          selectedApplicationId={selectedApplicationId}
          onSelectedApplicationIdChange={setSelectedApplicationId}
        />

        <AdminMap
          requests={requests}
          serviceZones={serviceZones}
          drivers={drivers}
          isDrawing={isDrawing}
          drawingPoints={drawingPoints}
          newZoneColor={newZoneColor}
          selectedReqId={selectedReqId}
          onSelectRequest={setSelectedReqId}
          onSelectDriver={(driverId) => {
            setActiveTab('drivers')
            setExpandedDriverId(driverId)
          }}
          onOpenAssignModal={setAssignModalReqIds}
          onOpenEditRoute={(requestId) => {
            const request = requests.find((item) => item.id === requestId)
            if (request) startRouteEdit(request)
          }}
          routeEditDraft={routeEditDraft}
          onRouteEditDraftChange={setRouteEditDraft}
          onCancelRouteEdit={cancelRouteEdit}
          onSaveRouteEdit={() => void saveRouteEdit()}
          onResetRouteEdit={resetRouteEdit}
          isSavingRoute={isSavingRoute}
          onDrawPoint={(point) => {
            if (!isDrawing) return
            setDrawingPoints((prev) => [...prev, point])
          }}
          sidebarCollapsed={sidebarCollapsed}
          onToggleSidebar={() => setSidebarCollapsed((v) => !v)}
          filterDate={filterDate}
          filterDateEnd={filterDateEnd}
          filterTime={filterTime}
          filterTimeEnd={filterTimeEnd}
          onFilterDateChange={setFilterDate}
          onFilterDateEndChange={setFilterDateEnd}
          onFilterTimeChange={setFilterTime}
          onFilterTimeEndChange={setFilterTimeEnd}
          slotIntervalMinutes={pricing.slotIntervalMinutes}
          enabledColors={enabledColors}
          onToggleColor={handleToggleColor}
        />
      </div>

      {errorMessage && (
        <AdminErrorToast errorMessage={errorMessage} onClose={() => setErrorMessage(null)} />
      )}

      <AdminAssignDriverModal
        assignModalReqIds={assignModalReqIds}
        requests={requests}
        drivers={drivers}
        assignDriverId={assignDriverId}
        isAssigning={isAssigning}
        onSelectDriver={setAssignDriverId}
        onClose={() => setAssignModalReqIds(null)}
        onSubmit={() => void handleAssign()}
      />

    </div>
  )
}
