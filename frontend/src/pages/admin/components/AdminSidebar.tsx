import { useEffect, useMemo, useRef, useState } from 'react'
import { Car, CaretLeft, CaretRight, CreditCard, Gear, MapPin, PenNib, Plus, Users, X } from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'

import type { AdminTab } from '../constants'
import type { AdminSidebarProps } from './AdminSidebar.types'
import { AdminSidebarDriversSection } from './AdminSidebarDriversSection'
import { AdminSidebarRequestsSuggestionsSection } from './AdminSidebarRequestsSuggestionsSection'
import { AdminSidebarStaffSection } from './AdminSidebarStaffSection'
import { AdminSidebarZonesSettingsQrSection } from './AdminSidebarZonesSettingsQrSection'
import EditDriverModal from './EditDriverModal'
import EditStaffModal from './EditStaffModal'
import type { CopyState } from './AdminSidebarShared'

const TAB_DEFS = [
  { id: 'requests' as AdminTab, icon: MapPin, labelKey: 'admin.tabs.requests' },
  { id: 'drivers' as AdminTab, icon: Car, labelKey: 'admin.tabs.drivers' },
  { id: 'zones' as AdminTab, icon: PenNib, labelKey: 'admin.tabs.zones' },
  { id: 'settings' as AdminTab, icon: Gear, labelKey: 'admin.tabs.settings' },
  { id: 'qrSales' as AdminTab, icon: CreditCard, labelKey: 'admin.tabs.qrSales' },
]

export default function AdminSidebar(props: AdminSidebarProps) {
  const { t } = useTranslation()
  const {
    collapsed,
    onToggleCollapse,
    activeTab,
    setActiveTab,
    filterStatus,
    setFilterStatus,
    filterDate,
    filterDateEnd,
    filterTime,
    filterTimeEnd,
    enabledColors,
    requests,
    requestsTotal,
    isLoadingMoreRequests,
    onLoadMoreRequests,
    searchQuery,
    setSearchQuery,
    selectedReqId,
    setSelectedReqId,
    setAssignModalReqIds,
    suggestions,
    selectedGroupId,
    setSelectedGroupId,
    groupColorMap,
    drivers,
    expandedDriverId,
    setExpandedDriverId,
    isDrawing,
    setIsDrawing,
    newZoneName,
    setNewZoneName,
    newZoneColor,
    setNewZoneColor,
    drawingPoints,
    setDrawingPoints,
    handleCreateZone,
    serviceZones,
    selectedZoneId,
    setSelectedZoneId,
    handleToggleZone,
    handleDeleteZone,
    pricing,
    qrSales,
    hasLoadedQrSalesOnce,
    handlePricingChange,
    adminSession,
    newManagedKeyName,
    setNewManagedKeyName,
    newManagedKeyRole,
    setNewManagedKeyRole,
    handleCreateManagedKey,
    lastCreatedAdminKey,
    rotatedAdminKeys,
    managedAdminKeys,
    handleRevokeManagedKey,
    handleRotateManagedKey,
    handleUpdateManagedKey,
    newDriverName,
    setNewDriverName,
    newDriverPhotoPreview,
    setNewDriverPhotoFile,
    setNewDriverPhotoPreview,
    newDriverCarBrand,
    setNewDriverCarBrand,
    newDriverCarModel,
    setNewDriverCarModel,
    newDriverCarPlate,
    setNewDriverCarPlate,
    newDriverVehicleColor,
    setNewDriverVehicleColor,
    newDriverSeatsCount,
    setNewDriverSeatsCount,
    newDriverAbout,
    setNewDriverAbout,
    newDriverCanSellPoints,
    setNewDriverCanSellPoints,
    newDriverCanSelfAssign,
    setNewDriverCanSelfAssign,
    lastCreatedDriverKey,
    rotatedDriverKeys,
    handleCreateDriver,
    handleRotateDriverKey,
    handleUpdateDriver,
    handleDeleteDriver,
  } = props

  const [copyState, setCopyState] = useState<CopyState>('idle')
  const [copiedToken, setCopiedToken] = useState<string | null>(null)
  const [showDriverForm, setShowDriverForm] = useState(false)
  const [showStaffForm, setShowStaffForm] = useState(false)
  const [editingDriver, setEditingDriver] = useState<AdminSidebarProps['drivers'][number] | null>(null)
  const [editingStaff, setEditingStaff] = useState<AdminSidebarProps['managedAdminKeys'][number] | null>(null)
  const driverCardRefs = useRef<Record<string, HTMLDivElement | null>>({})

  useEffect(() => {
    setCopyState('idle')
  }, [lastCreatedAdminKey, lastCreatedDriverKey])

  useEffect(() => {
    if (!expandedDriverId) return
    const element = driverCardRefs.current[expandedDriverId]
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [expandedDriverId])

  const tabs = useMemo(() => {
    if (adminSession.role !== 'chief_admin') return TAB_DEFS
    return [...TAB_DEFS, { id: 'staff' as AdminTab, icon: Users, labelKey: 'admin.tabs.staff' }]
  }, [adminSession.role])

  const copyText = async (value: string, token: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopiedToken(token)
      setCopyState('ok')
    } catch {
      setCopiedToken(token)
      setCopyState('error')
    }
  }

  return (
    <>
      <aside className={`admin-sidebar-wrap flex-shrink-0 border-r border-border flex flex-col md:flex-row bg-white relative ${collapsed ? 'admin-sidebar-collapsed' : 'w-[440px]'}`}>
        {/* Drawer handle for mobile */}
        <div className="admin-drawer-handle" onClick={onToggleCollapse} />
        {/* Collapse toggle (desktop only) */}
        <button
          onClick={onToggleCollapse}
          className="hidden md:flex absolute top-1/2 -right-4 z-[1001] w-9 h-9 bg-white border border-border rounded-full shadow-card items-center justify-center hover:bg-surface transition-colors"
          style={{ transform: 'translateY(-50%)' }}
          title={collapsed ? t('admin.sidebar.expandPanel') : t('admin.sidebar.collapsePanel')}
        >
          {collapsed ? <CaretRight size={14} weight="bold" /> : <CaretLeft size={14} weight="bold" />}
        </button>
        <div className="admin-sidebar-icon-rail w-16 border-r border-border bg-surface flex flex-col items-center py-3 gap-1.5 flex-shrink-0">
          {tabs.map((tab) => {
            const active = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-[52px] flex flex-col items-center justify-center gap-1 py-2.5 rounded-xl transition-all touch-none ${
                  active ? 'bg-black text-white' : 'text-muted hover:bg-white hover:text-black'
                }`}
                title={t(tab.labelKey)}
              >
                <tab.icon size={20} weight={active ? 'fill' : 'regular'} />
                <span className="text-[9px] font-medium leading-none">{t(tab.labelKey)}</span>
              </button>
            )
          })}
        </div>

        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between flex-shrink-0">
            <div>
              <h2 className="text-base font-extrabold tracking-tight">
                {tabs.find((tab) => tab.id === activeTab) ? t(tabs.find((tab) => tab.id === activeTab)!.labelKey) : ''}
              </h2>
              <p className="text-[11px] text-muted mt-0.5">
                {activeTab === 'requests' &&
                  t('admin.sidebar.requestsCount', {
                    loaded: requests.length,
                    suffix:
                      requestsTotal > requests.length
                        ? t('admin.sidebar.requestsCountSuffix', { total: requestsTotal })
                        : '',
                  })}
                {activeTab === 'drivers' &&
                  t('admin.sidebar.driversCount', {
                    count: drivers.length,
                    online: drivers.filter((driver) => driver.isOnline).length,
                  })}
                {activeTab === 'zones' && t('admin.sidebar.zonesCount', { count: serviceZones.length })}
                {activeTab === 'settings' && t('admin.sidebar.pricingTitle')}
                {activeTab === 'qrSales' && t('admin.sidebar.paymentsCount', { count: qrSales.length })}
                {activeTab === 'staff' && t('admin.sidebar.accountsCount', { count: managedAdminKeys.length })}
              </p>
            </div>
            {activeTab === 'drivers' && (
              <button
                onClick={() => setShowDriverForm((value) => !value)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-pill bg-black text-white text-xs font-bold transition-all active:scale-[0.97]"
              >
                {showDriverForm ? <X size={14} /> : <Plus size={14} />}
                {showDriverForm ? t('common.close') : t('common.create')}
              </button>
            )}
            {activeTab === 'staff' && adminSession.role === 'chief_admin' && (
              <button
                onClick={() => setShowStaffForm((value) => !value)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-pill bg-black text-white text-xs font-bold transition-all active:scale-[0.97]"
              >
                {showStaffForm ? <X size={14} /> : <Plus size={14} />}
                {showStaffForm ? t('common.close') : t('common.create')}
              </button>
            )}
            {activeTab === 'zones' && !isDrawing && (
              <button
                onClick={() => setIsDrawing(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-pill bg-black text-white text-xs font-bold transition-all active:scale-[0.97]"
              >
                <Plus size={14} />
                {t('admin.sidebar.newZone')}
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-4 scroll-smooth-y gpu-scroll">
            <AdminSidebarRequestsSuggestionsSection
              activeTab={activeTab}
              filterDate={filterDate}
              filterDateEnd={filterDateEnd}
              filterTime={filterTime}
              filterTimeEnd={filterTimeEnd}
              enabledColors={enabledColors}
              requests={requests}
              requestsTotal={requestsTotal}
              isLoadingMoreRequests={isLoadingMoreRequests}
              onLoadMoreRequests={onLoadMoreRequests}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              selectedReqId={selectedReqId}
              setSelectedReqId={setSelectedReqId}
              setAssignModalReqIds={setAssignModalReqIds}
            />

            <AdminSidebarDriversSection
              activeTab={activeTab}
              drivers={drivers}
              expandedDriverId={expandedDriverId}
              setExpandedDriverId={setExpandedDriverId}
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
              handleDeleteDriver={handleDeleteDriver}
              showDriverForm={showDriverForm}
              setEditingDriver={setEditingDriver}
              copyState={copyState}
              copiedToken={copiedToken}
              copyText={copyText}
              driverCardRefs={driverCardRefs}
            />

            <AdminSidebarZonesSettingsQrSection
              activeTab={activeTab}
              isDrawing={isDrawing}
              setIsDrawing={setIsDrawing}
              newZoneName={newZoneName}
              setNewZoneName={setNewZoneName}
              newZoneColor={newZoneColor}
              setNewZoneColor={setNewZoneColor}
              drawingPoints={drawingPoints}
              setDrawingPoints={setDrawingPoints}
              handleCreateZone={handleCreateZone}
              serviceZones={serviceZones}
              selectedZoneId={selectedZoneId}
              setSelectedZoneId={setSelectedZoneId}
              handleToggleZone={handleToggleZone}
              handleDeleteZone={handleDeleteZone}
              pricing={pricing}
              handlePricingChange={handlePricingChange}
              qrSales={qrSales}
              hasLoadedQrSalesOnce={hasLoadedQrSalesOnce}
            />

            <AdminSidebarStaffSection
              activeTab={activeTab}
              adminSession={adminSession}
              newManagedKeyName={newManagedKeyName}
              setNewManagedKeyName={setNewManagedKeyName}
              newManagedKeyRole={newManagedKeyRole}
              setNewManagedKeyRole={setNewManagedKeyRole}
              handleCreateManagedKey={handleCreateManagedKey}
              lastCreatedAdminKey={lastCreatedAdminKey}
              rotatedAdminKeys={rotatedAdminKeys}
              managedAdminKeys={managedAdminKeys}
              handleRevokeManagedKey={handleRevokeManagedKey}
              handleRotateManagedKey={handleRotateManagedKey}
              showStaffForm={showStaffForm}
              setEditingStaff={setEditingStaff}
              copyState={copyState}
              copiedToken={copiedToken}
              copyText={copyText}
            />
          </div>
        </div>
      </aside>


      {editingDriver && (
        <EditDriverModal
          driver={editingDriver}
          onClose={() => setEditingDriver(null)}
          onSubmit={(payload) => handleUpdateDriver(editingDriver.id, payload)}
        />
      )}
      {editingStaff && (
        <EditStaffModal
          staff={editingStaff}
          onClose={() => setEditingStaff(null)}
          onSubmit={(payload) => handleUpdateManagedKey(editingStaff.id, payload)}
        />
      )}
    </>
  )
}
