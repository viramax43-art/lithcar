import { useCallback, useEffect, useMemo, useState } from 'react'

import type { Driver, GroupSuggestion, LatLng, PricingSettings, RideRequest, ServiceZone } from '../../types'
import {
  assignDriverBulk,
  createAdminKey,
  createDriver,
  deleteDriver,
  deleteAdminKey,
  createServiceZone,
  deleteServiceZone,
  getAdminSession,
  getPricing,
  listAdminRequests,
  listAdminKeys,
  listDrivers,
  listAdminQrSales,
  listGroupSuggestions,
  listServiceZones,
  loginAdminByKey,
  logoutAdminSession,
  rotateAdminKey,
  rotateDriverKey,
  uploadDriverPhoto,
  updateAdminKey,
  updateDriver,
  updatePricing,
  updateServiceZone,
  type AdminKeyInfo,
  type AdminSessionUser,
  type RidePointOverride,
} from '../../lib/backend'
import { AdminAssignDriverModal } from './components/AdminAssignDriverModal'
import AdminMap from './components/AdminMap'
import AdminSidebar from './components/AdminSidebar'
import { AdminErrorToast, AdminHeader, AdminLoginScreen, AdminSessionChecking } from './components/AdminDashboardViews'
import { GROUP_COLORS, ZONE_COLORS, type AdminTab } from './constants'

const ADMIN_DASHBOARD_POLL_MS = 10_000

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<AdminTab>('requests')
  const [requests, setRequests] = useState<RideRequest[]>([])
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [suggestions, setSuggestions] = useState<GroupSuggestion[]>([])
  const [serviceZones, setServiceZones] = useState<ServiceZone[]>([])
  const [pricing, setPricing] = useState<PricingSettings>({ pointsPerRide: 10, pointPriceCents: 50, workStartTime: '06:00', workEndTime: '19:00', slotIntervalMinutes: 30 })
  const [qrSales, setQrSales] = useState<Awaited<ReturnType<typeof listAdminQrSales>>['items']>([])
  const [hasLoadedQrSalesOnce, setHasLoadedQrSalesOnce] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [adminSession, setAdminSession] = useState<AdminSessionUser | null>(null)
  const [adminKeyInput, setAdminKeyInput] = useState('')
  const [isAdminAuthorizing, setIsAdminAuthorizing] = useState(false)
  const [isInitialAdminCheckDone, setIsInitialAdminCheckDone] = useState(false)
  const [managedAdminKeys, setManagedAdminKeys] = useState<AdminKeyInfo[]>([])
  const [newManagedKeyName, setNewManagedKeyName] = useState('')
  const [newManagedKeyRole, setNewManagedKeyRole] = useState<'admin' | 'moderator'>('admin')
  const [lastCreatedAdminKey, setLastCreatedAdminKey] = useState<string | null>(null)
  const [rotatedAdminKeys, setRotatedAdminKeys] = useState<Record<string, string>>({})

  const [filterStatus, setFilterStatus] = useState('all')
  const [selectedReqId, setSelectedReqId] = useState<string | null>(null)
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null)
  const [expandedDriverId, setExpandedDriverId] = useState<string | null>(null)

  const [assignModalReqIds, setAssignModalReqIds] = useState<string[] | null>(null)
  const [assignDriverId, setAssignDriverId] = useState<string>('')
  const [isAssigning, setIsAssigning] = useState(false)

  const [isDrawing, setIsDrawing] = useState(false)
  const [drawingPoints, setDrawingPoints] = useState<LatLng[]>([])
  const [newZoneName, setNewZoneName] = useState('')
  const [newZoneColor, setNewZoneColor] = useState(ZONE_COLORS[0])
  const [newDriverName, setNewDriverName] = useState('')
  const [newDriverPhotoFile, setNewDriverPhotoFile] = useState<File | null>(null)
  const [newDriverPhotoPreview, setNewDriverPhotoPreview] = useState<string | null>(null)
  const [newDriverCarBrand, setNewDriverCarBrand] = useState('')
  const [newDriverCarModel, setNewDriverCarModel] = useState('')
  const [newDriverCarPlate, setNewDriverCarPlate] = useState('')
  const [newDriverVehicleColor, setNewDriverVehicleColor] = useState('')
  const [newDriverSeatsCount, setNewDriverSeatsCount] = useState(4)
  const [newDriverAbout, setNewDriverAbout] = useState('')
  const [newDriverCanSellPoints, setNewDriverCanSellPoints] = useState(false)
  const [lastCreatedDriverKey, setLastCreatedDriverKey] = useState<string | null>(null)
  const [rotatedDriverKeys, setRotatedDriverKeys] = useState<Record<string, string>>({})

  const loadManagedKeys = useCallback(async () => {
    if (adminSession?.role !== 'chief_admin') return
    try {
      const page = await listAdminKeys({ limit: 100, offset: 0 })
      setManagedAdminKeys(page.items.filter((item) => item.role !== 'chief_admin' && item.isActive))
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Не удалось загрузить список ключей.')
    }
  }, [adminSession?.role])

  const loadAll = useCallback(async () => {
    if (!adminSession) return
    setErrorMessage(null)
    try {
      const [req, drv, sug, zones, price, qrSalesPage] = await Promise.all([
        listAdminRequests(filterStatus, { limit: 100, offset: 0 }),
        listDrivers(false, { limit: 200, offset: 0 }),
        listGroupSuggestions({ limit: 100, offset: 0 }),
        listServiceZones('cookie', { limit: 500, offset: 0 }),
        getPricing('cookie'),
        listAdminQrSales({ limit: 100, offset: 0, redeemedOnly: true }),
      ])
      setRequests(req.items)
      setDrivers(drv.items)
      setSuggestions(sug.items)
      setServiceZones(zones.items)
      setPricing(price)
      setQrSales(qrSalesPage.items)
      setHasLoadedQrSalesOnce(true)
      if (adminSession.role === 'chief_admin') {
        await loadManagedKeys()
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Не удалось загрузить админ-данные.')
    }
  }, [adminSession, filterStatus, loadManagedKeys])

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

  const handleAssign = async (pointOverrides: RidePointOverride[] = []) => {
    if (!assignModalReqIds || !assignDriverId) return
    setIsAssigning(true)
    try {
      await assignDriverBulk(assignModalReqIds, assignDriverId, pointOverrides)
      await loadAll()
      setAssignModalReqIds(null)
      setAssignDriverId('')
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Не удалось назначить водителя.')
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
      setErrorMessage(error instanceof Error ? error.message : 'Не удалось создать зону.')
    }
  }

  const handleToggleZone = async (zone: ServiceZone) => {
    try {
      const updated = await updateServiceZone(zone.id, { isActive: !zone.isActive })
      setServiceZones((prev) => prev.map((item) => (item.id === updated.id ? updated : item)))
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Не удалось изменить состояние зоны.')
    }
  }

  const handleDeleteZone = async (zoneId: string) => {
    try {
      await deleteServiceZone(zoneId)
      setServiceZones((prev) => prev.filter((zone) => zone.id !== zoneId))
      setSelectedZoneId(null)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Не удалось удалить зону.')
    }
  }

  const handlePricingChange = async (payload: Partial<Pick<PricingSettings, 'pointPriceCents' | 'workStartTime' | 'workEndTime' | 'slotIntervalMinutes'>>) => {
    try {
      const updated = await updatePricing(payload)
      setPricing(updated)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Не удалось обновить тариф.')
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
      setErrorMessage(error instanceof Error ? error.message : 'Не удалось войти по ключу.')
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
      setErrorMessage(error instanceof Error ? error.message : 'Не удалось создать ключ.')
    }
  }

  const handleDeleteManagedKey = async (keyId: string) => {
    if (adminSession?.role !== 'chief_admin') return
    try {
      await deleteAdminKey(keyId)
      await loadManagedKeys()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Не удалось удалить аккаунт персонала.')
    }
  }

  const handleRotateManagedKey = async (keyId: string) => {
    if (adminSession?.role !== 'chief_admin') return
    try {
      const result = await rotateAdminKey(keyId)
      setRotatedAdminKeys((prev) => ({ ...prev, [keyId]: result.key }))
      await loadManagedKeys()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Не удалось выпустить новый ключ персонала.')
    }
  }

  const handleUpdateManagedKey = async (keyId: string, payload: Partial<{ name: string; role: 'admin' | 'moderator' }>) => {
    if (adminSession?.role !== 'chief_admin') return
    try {
      await updateAdminKey(keyId, payload)
      await loadManagedKeys()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Не удалось изменить аккаунт персонала.')
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
      await loadAll()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Не удалось создать водителя.')
    }
  }

  const handleRotateDriverKey = async (driverId: string) => {
    try {
      const result = await rotateDriverKey(driverId)
      setRotatedDriverKeys((prev) => ({ ...prev, [driverId]: result.key }))
      setDrivers((prev) => prev.map((d) => (d.id === result.driver.id ? result.driver : d)))
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Не удалось выпустить новый ключ водителя.')
    }
  }

  const handleUpdateDriver = async (driverId: string, payload: Parameters<typeof updateDriver>[1]) => {
    try {
      const updated = await updateDriver(driverId, payload)
      setDrivers((prev) => prev.map((d) => (d.id === updated.id ? updated : d)))
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Не удалось обновить карточку водителя.')
    }
  }

  const handleDeleteDriver = async (driverId: string) => {
    try {
      await deleteDriver(driverId)
      setDrivers((prev) => prev.filter((d) => d.id !== driverId))
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Не удалось удалить водителя.')
    }
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
    <div className="h-screen flex flex-col bg-white overflow-hidden">
      <AdminHeader onlineDriversCount={onlineDrivers.length} adminSession={adminSession} onLogout={() => void handleAdminLogout()} />

      <div className="flex flex-1 overflow-hidden">
        <AdminSidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          filterStatus={filterStatus}
          setFilterStatus={setFilterStatus}
          requests={requests}
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
          lastCreatedDriverKey={lastCreatedDriverKey}
          rotatedDriverKeys={rotatedDriverKeys}
          handleCreateDriver={handleCreateDriver}
          handleRotateDriverKey={handleRotateDriverKey}
          handleUpdateDriver={handleUpdateDriver}
          handleDeleteDriver={handleDeleteDriver}
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
          onDrawPoint={(point) => {
            if (!isDrawing) return
            setDrawingPoints((prev) => [...prev, point])
          }}
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
        onSubmit={(overrides) => void handleAssign(overrides)}
      />
    </div>
  )
}
