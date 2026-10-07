import { useCallback, useEffect, useMemo, useState } from 'react'
import { MapTrifold, PenNib } from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'

import i18n from '../../i18n'

import { DEFAULT_DRIVER_REGISTRATION_FORM } from '../../lib/driverRegistrationDefaults'
import { DEFAULT_PRICING_SETTINGS } from '../../lib/pricingDefaults'
import { buildSimpleZoneBoundary } from '../../lib/zoneGeometry'
import CabinetRoleBanner from '../../components/CabinetRoleBanner'
import TransferPointsSheet from '../../components/TransferPointsSheet'
import type { AppNotification, Driver, DriverApplication, DriverRegistrationFormSchema, GroupSuggestion, LatLng, PricingSettings, RideRequest, ServiceZone } from '../../types'
import {
  ApiError,
  approveDriverApplication,
  assignDriverBulk,
  bootstrapAdminSession,
  createAdminKey,
  createDriver,
  deleteDriver,
  deleteAdminKey,
  createServiceZone,
  deleteServiceZone,
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
  parseApiErrorCode,
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
  unassignAdminDriver,
  type AdminKeyInfo,
  type AdminSessionUser,
} from '../../lib/backend'
import { AdminAssignDriverModal } from './components/AdminAssignDriverModal'
import { isOverridden, toRideDraft, type RideDraft } from './components/AssignDriverModalParts'
import AdminMap from './components/AdminMap'
import AdminSidebar from './components/AdminSidebar'
import { AdminErrorToast, AdminHeader, AdminLoginScreen, AdminSessionChecking } from './components/AdminDashboardViews'
import {
  isInsideTelegramMiniApp,
  leaveAdminPanel,
  readTelegramInitData,
  resolveInitialAdminSession,
} from '../../lib/adminPortal'
import { getInitialDashboardUi, getInitialDriverRegistrationUi } from '../../lib/adminUiState'
import { usePersistAdminUiSlice } from '../../lib/useAdminUiPersistence'
import { DEFAULT_PLATFORM_SETTINGS, mapPlatformSettings, type PlatformSettingsConfig } from '../../lib/platformSettingsDefaults'
import { getPlatformSettings, updatePlatformSettings } from '../../infrastructure/api/adminApi'
import { GROUP_COLORS, type AdminTab, type MapColorGroupKey } from './constants'

const ADMIN_DASHBOARD_POLL_MS = 10_000
const INITIAL_DASHBOARD_UI = getInitialDashboardUi()

export default function AdminDashboard() {
  const { t } = useTranslation()

  useEffect(() => {
    void i18n.changeLanguage('ru')
  }, [])

  const [activeTab, setActiveTab] = useState<AdminTab>(INITIAL_DASHBOARD_UI.activeTab)
  const [requests, setRequests] = useState<RideRequest[]>([])
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [suggestions, setSuggestions] = useState<GroupSuggestion[]>([])
  const [serviceZones, setServiceZones] = useState<ServiceZone[]>([])
  const [pricing, setPricing] = useState<PricingSettings>(DEFAULT_PRICING_SETTINGS)
  const [platformSettings, setPlatformSettings] = useState<PlatformSettingsConfig>(DEFAULT_PLATFORM_SETTINGS)
  const [qrSales, setQrSales] = useState<Awaited<ReturnType<typeof listAdminQrSales>>['items']>([])
  const [isSendPointsOpen, setIsSendPointsOpen] = useState(false)
  const [hasLoadedQrSalesOnce, setHasLoadedQrSalesOnce] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [adminSession, setAdminSession] = useState<AdminSessionUser | null>(null)
  const [adminKeyInput, setAdminKeyInput] = useState('')
  const [isAdminAuthorizing, setIsAdminAuthorizing] = useState(false)
  const [isTelegramAdminLoginPending, setIsTelegramAdminLoginPending] = useState(false)
  const [isKeyFormVisible, setIsKeyFormVisible] = useState(false)
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
  const [zoneFocusKey, setZoneFocusKey] = useState(0)
  const [expandedDriverId, setExpandedDriverId] = useState<string | null>(INITIAL_DASHBOARD_UI.expandedDriverId)
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
  const [unassigningRequestId, setUnassigningRequestId] = useState<string | null>(null)

  const [isDrawing, setIsDrawing] = useState(INITIAL_DASHBOARD_UI.isDrawing)
  const [drawingPoints, setDrawingPoints] = useState<LatLng[]>(INITIAL_DASHBOARD_UI.drawingPoints)
  const [newZoneName, setNewZoneName] = useState(INITIAL_DASHBOARD_UI.newZoneName)
  const [newZoneColor, setNewZoneColor] = useState(INITIAL_DASHBOARD_UI.newZoneColor)
  const [editingZoneId, setEditingZoneId] = useState<string | null>(INITIAL_DASHBOARD_UI.editingZoneId)
  // Zone polygon is drawn from taps in any order — collapse it to a convex boundary
  // so the saved shape never self-intersects ("bow-tie").
  const zoneBoundaryPoints = useMemo(() => buildSimpleZoneBoundary(drawingPoints), [drawingPoints])
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
      editingZoneId,
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
      editingZoneId,
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

  /*
    Карта — инструмент настройки зонирования, поэтому она рендерится только в разделе
    «Зоны» (вкладка zones). В остальных разделах админка работает списками и Leaflet
    не загружается вовсе.
  */
  const isMapVisible = activeTab === 'zones'

  // Уход из «Зон» закрывает карту вместе с её режимами: рисование зоны и правка маршрута.
  useEffect(() => {
    if (activeTab === 'zones') return
    setIsDrawing(false)
    setRouteEditDraft(null)
  }, [activeTab])

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
      const [req, drv, zones, price, qrSalesPage, applicationsPage, registrationForm, platformResult] =
        await Promise.all([
        listAdminRequests('all', { limit: ADMIN_PAGE_SIZE, offset: 0 }),
        listDrivers(false, { limit: 200, offset: 0 }),
        listServiceZones('cookie', { limit: 500, offset: 0 }),
        getPricing('cookie'),
        listAdminQrSales({ limit: 100, offset: 0, redeemedOnly: true }),
        listDriverApplications({ limit: 100, offset: 0 }),
        getDriverRegistrationSettings(),
        getPlatformSettings(),
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
      const mappedPlatform = mapPlatformSettings(platformResult)
      setPlatformSettings(mappedPlatform)
      setNewDriverCanSellPoints(mappedPlatform.driver.defaultCanSellPoints)
      setNewDriverCanSelfAssign(mappedPlatform.driver.defaultCanSelfAssign)
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
    // Правка маршрута идёт по карте, а карта живёт в разделе «Зоны».
    setActiveTab('zones')
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

  const telegramLoginAvailable = useMemo(() => isInsideTelegramMiniApp() || Boolean(readTelegramInitData()), [])

  const ensureAdminSession = useCallback(async () => {
    try {
      setAdminSession(await resolveInitialAdminSession())
    } finally {
      // Single exit point on purpose: a reused session must also clear the checking state,
      // otherwise the panel stays on the "Checking admin session..." screen forever.
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

  const handleUnassignDriver = async (requestId: string) => {
    if (unassigningRequestId) return
    setUnassigningRequestId(requestId)
    try {
      await unassignAdminDriver(requestId)
      await loadAll()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t('admin.errors.unassignDriverFailed'))
    } finally {
      setUnassigningRequestId(null)
    }
  }

  const [zoneSaveOpen, setZoneSaveOpen] = useState(false)
  const [zoneDirectionFrom, setZoneDirectionFrom] = useState('')
  const [zoneDirectionTo, setZoneDirectionTo] = useState('')
  const [isSavingZone, setIsSavingZone] = useState(false)

  const resetZoneDrawing = () => {
    setIsDrawing(false)
    setEditingZoneId(null)
    setDrawingPoints([])
    setNewZoneName('')
    setZoneDirectionFrom('')
    setZoneDirectionTo('')
    setZoneSaveOpen(false)
  }

  const handleSaveZone = async () => {
    if (zoneBoundaryPoints.length < 3) return
    setZoneSaveOpen(true)
  }

  const confirmSaveZone = async () => {
    const name = newZoneName.trim()
    const from = zoneDirectionFrom.trim()
    const to = zoneDirectionTo.trim()
    if (!name || !from || !to || zoneBoundaryPoints.length < 3 || isSavingZone) return
    setIsSavingZone(true)
    try {
      await createServiceZone({
        name,
        color: newZoneColor,
        polygon: zoneBoundaryPoints,
        isActive: true,
        directionFrom: from,
        directionTo: to,
      })
      await loadAll()
      resetZoneDrawing()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t('admin.errors.createZoneFailed'))
    } finally {
      setIsSavingZone(false)
    }
  }

  const handleShowZoneOnMap = (zoneId: string) => {
    // Карта живёт в разделе «Зоны» — фокусируем зону там же.
    setActiveTab('zones')
    setSelectedZoneId(zoneId)
    setZoneFocusKey((key) => key + 1)
  }

  const handleSelectZoneFromMap = (zoneId: string) => {
    setActiveTab('zones')
    setSelectedZoneId(zoneId)
  }

  const handleCreateZone = handleSaveZone

  const handleToggleZone = async (zone: ServiceZone) => {
    try {
      const updated = await updateServiceZone(zone.id, { isActive: !zone.isActive })
      setServiceZones((prev) => prev.map((item) => (item.id === updated.id ? updated : item)))
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t('admin.errors.toggleZoneFailed'))
    }
  }

  const handleUpdateZone = async (
    zoneId: string,
    patch: { name?: string; directionFrom?: string | null; directionTo?: string | null },
  ) => {
    try {
      const updated = await updateServiceZone(zoneId, patch)
      setServiceZones((prev) => prev.map((item) => (item.id === updated.id ? updated : item)))
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t('admin.errors.updateZoneFailed'))
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

  const handlePlatformChange = async (patch: Partial<PlatformSettingsConfig>) => {
    // Apply immediately so switches react on tap, then reconcile with the server.
    const snapshot = platformSettings
    setPlatformSettings((prev) => mapPlatformSettings({ ...prev, ...patch }))
    try {
      const updated = await updatePlatformSettings(patch)
      setPlatformSettings(mapPlatformSettings(updated))
      return true
    } catch (error) {
      setPlatformSettings(snapshot)
      setErrorMessage(error instanceof Error ? error.message : t('admin.errors.updatePlatformFailed', { defaultValue: 'Не удалось сохранить настройки' }))
      return false
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
      return true
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t('admin.errors.updatePricingFailed'))
      return false
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

  const handleTelegramAdminLogin = async () => {
    setIsTelegramAdminLoginPending(true)
    setErrorMessage(null)
    try {
      const session = await bootstrapAdminSession(readTelegramInitData() || undefined)
      setAdminSession(session)
      setIsKeyFormVisible(false)
    } catch (error) {
      const notLinked =
        error instanceof ApiError && parseApiErrorCode(error) === 'admin_not_linked'
      setErrorMessage(
        notLinked
          ? t('admin.login.notLinkedError', {
              defaultValue:
                'This Telegram account is not linked to the admin panel. Ask the chief admin to set your @username in Staff.',
            })
          : error instanceof Error
            ? error.message
            : t('admin.errors.loginFailed'),
      )
    } finally {
      setIsTelegramAdminLoginPending(false)
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

  const handleUpdateManagedKey = async (
    keyId: string,
    payload: Partial<{ name: string; role: 'admin' | 'moderator'; telegramUsername: string }>,
  ) => {
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
        telegramLoginAvailable={telegramLoginAvailable}
        isTelegramLoginPending={isTelegramAdminLoginPending}
        isKeyFormVisible={isKeyFormVisible}
        onToggleKeyForm={() => setIsKeyFormVisible((value) => !value)}
        onChangeKey={setAdminKeyInput}
        onLogin={() => void handleAdminLogin()}
        onTelegramLogin={() => void handleTelegramAdminLogin()}
        onBackToApp={telegramLoginAvailable ? leaveAdminPanel : undefined}
      />
    )
  }

  return (
    <div className="admin-shell h-[100dvh] flex flex-col bg-white overflow-hidden">
      <AdminHeader
        onlineDriversCount={onlineDrivers.length}
        adminSession={adminSession}
        onLogout={() => void handleAdminLogout()}
        onNotificationSelect={handleAdminNotificationSelect}
        onBackToApp={telegramLoginAvailable ? leaveAdminPanel : undefined}
        onOpenSendPoints={() => setIsSendPointsOpen(true)}
      />

      <CabinetRoleBanner
        role={adminSession.role === 'moderator' ? 'moderator' : 'admin'}
        variant="strip"
        safeArea="none"
      />

      <div className="flex flex-1 overflow-hidden relative flex-col-reverse md:flex-row">
        <AdminSidebar
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
          handleUnassignDriver={handleUnassignDriver}
          unassigningRequestId={unassigningRequestId}
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
          handleCreateZone={handleSaveZone}
          resetZoneDrawing={resetZoneDrawing}
          serviceZones={serviceZones}
          selectedZoneId={selectedZoneId}
          setSelectedZoneId={setSelectedZoneId}
          onShowZoneOnMap={handleShowZoneOnMap}
          handleToggleZone={handleToggleZone}
          handleDeleteZone={handleDeleteZone}
          handleUpdateZone={handleUpdateZone}
          pricing={pricing}
          qrSales={qrSales}
          hasLoadedQrSalesOnce={hasLoadedQrSalesOnce}
          handlePricingChange={handlePricingChange}
          platformSettings={platformSettings}
          handlePlatformChange={handlePlatformChange}
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

        <div className={`admin-main-region min-w-0 flex-1 flex flex-col ${isMapVisible ? '' : 'hidden md:flex'}`}>
        {isMapVisible ? (
        <AdminMap
          requests={requests}
          serviceZones={serviceZones}
          drivers={drivers}
          isDrawing={isDrawing}
          drawingPoints={drawingPoints}
          newZoneColor={newZoneColor}
          selectedZoneId={selectedZoneId}
          zoneFocusKey={zoneFocusKey}
          selectedReqId={selectedReqId}
          onSelectRequest={setSelectedReqId}
          onSelectDriver={(driverId) => {
            setActiveTab('drivers')
            setExpandedDriverId(driverId)
          }}
          onSelectZone={handleSelectZoneFromMap}
          onOpenAssignModal={setAssignModalReqIds}
          onUnassignDriver={handleUnassignDriver}
          unassigningRequestId={unassigningRequestId}
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
          onUndoZonePoint={() => setDrawingPoints((prev) => prev.slice(0, -1))}
          onCancelZoneDrawing={resetZoneDrawing}
          onSaveZone={() => void handleSaveZone()}
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
        ) : (
          /*
            Карта — инструмент настройки зонирования: вне раздела «Зоны» показываем
            подсказку, ведущую в настройку зон (карта открывается именно там).
          */
          <main className="admin-map-placeholder flex-1 relative flex items-center justify-center p-6 bg-surface/40 overflow-y-auto">
            <div className="w-full max-w-md bg-white rounded-card shadow-card p-6 text-center space-y-3">
              <div className="mx-auto w-12 h-12 rounded-2xl bg-surface flex items-center justify-center">
                <MapTrifold size={22} weight="duotone" />
              </div>
              <p className="text-sm font-extrabold">
                {t('admin.map.zonesOnlyTitle', { defaultValue: 'Карта — для настройки зонирования' })}
              </p>
              <p className="text-xs text-muted leading-relaxed">
                {t('admin.map.zonesOnlyHint', {
                  defaultValue:
                    'Карта зон открывается в разделе «Зоны»: там задаются зоны обслуживания, их границы и направления поездок.',
                })}
              </p>
              <button
                type="button"
                onClick={() => setActiveTab('zones')}
                className="w-full h-11 rounded-xl bg-black text-white text-sm font-bold inline-flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
              >
                <PenNib size={16} weight="bold" />
                {t('admin.map.openZones', { defaultValue: 'Перейти к зонам' })}
              </button>
              <p className="text-[11px] text-muted">
                {t('admin.map.zonesConfiguredCount', {
                  count: serviceZones.length,
                  defaultValue: '{{count}} зон настроено',
                })}
              </p>
            </div>
          </main>
        )}
        </div>
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

      {zoneSaveOpen && (
        <div className="fixed inset-0 z-[4000] bg-black/50 flex items-end sm:items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-card p-4 space-y-3">
            <p className="text-sm font-bold">
              {t('admin.zones.saveWithDirection', { defaultValue: 'Сохранить зону и направление' })}
            </p>
            <p className="text-[11px] text-muted">
              {t('admin.zones.directionHint', {
                defaultValue: 'После контура укажите long-route направление: откуда → куда.',
              })}
            </p>
            <label className="block space-y-1">
              <span className="text-[11px] text-muted">{t('admin.zones.zoneNamePlaceholder')}</span>
              <input
                value={newZoneName}
                onChange={(e) => setNewZoneName(e.target.value)}
                className="w-full h-10 px-3 rounded-xl border border-border text-sm outline-none focus:border-black"
                placeholder={t('admin.zones.zoneNamePlaceholder')}
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block space-y-1">
                <span className="text-[11px] text-muted">
                  {t('admin.zones.directionFrom', { defaultValue: 'Откуда' })}
                </span>
                <input
                  value={zoneDirectionFrom}
                  onChange={(e) => setZoneDirectionFrom(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl border border-border text-sm outline-none focus:border-black"
                  placeholder={t('admin.zones.directionFromPlaceholder', { defaultValue: 'Вильнюс' })}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-[11px] text-muted">
                  {t('admin.zones.directionTo', { defaultValue: 'Куда' })}
                </span>
                <input
                  value={zoneDirectionTo}
                  onChange={(e) => setZoneDirectionTo(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl border border-border text-sm outline-none focus:border-black"
                  placeholder={t('admin.zones.directionToPlaceholder', { defaultValue: 'Каунас' })}
                />
              </label>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setZoneSaveOpen(false)}
                className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={() => void confirmSaveZone()}
                disabled={
                  !newZoneName.trim() ||
                  !zoneDirectionFrom.trim() ||
                  !zoneDirectionTo.trim() ||
                  isSavingZone
                }
                className="flex-1 py-2.5 rounded-xl bg-black text-white text-sm font-bold disabled:opacity-40"
              >
                {isSavingZone ? t('common.saving') : t('admin.zones.saveZone')}
              </button>
            </div>
          </div>
        </div>
      )}

      {isSendPointsOpen && (
        <TransferPointsSheet onClose={() => setIsSendPointsOpen(false)} />
      )}

    </div>
  )
}
