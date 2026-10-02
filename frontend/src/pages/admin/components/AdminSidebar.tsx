import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Car,
  CaretLeft,
  CaretRight,
  ClipboardText,
  CreditCard,
  Gear,
  MapPin,
  PenNib,
  Plus,
  SlidersHorizontal,
  UserCircle,
  Users,
  Wrench,
  X,
} from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'

import { getInitialSidebarUi } from '../../../lib/adminUiState'
import { usePersistAdminUiSlice } from '../../../lib/useAdminUiPersistence'
import {
  ADMIN_SECTION_TABS,
  adminSectionForTab,
  defaultTabForSection,
  type AdminSection,
  type AdminTab,
} from '../constants'
import { AdminSidebarPassengersSection } from './AdminSidebarPassengersSection'
import { AdminSidebarPlatformSection } from './AdminSidebarPlatformSection'
import type { AdminSidebarProps } from './AdminSidebar.types'
import { AdminSidebarDriversSection } from './AdminSidebarDriversSection'
import { AdminSidebarDriverRegistrationSection } from './AdminSidebarDriverRegistrationSection'
import { AdminSidebarRequestsSuggestionsSection } from './AdminSidebarRequestsSuggestionsSection'
import { AdminSidebarStaffSection } from './AdminSidebarStaffSection'
import { AdminSidebarZonesSettingsQrSection } from './AdminSidebarZonesSettingsQrSection'
import EditDriverModal from './EditDriverModal'
import EditStaffModal from './EditStaffModal'
import type { CopyState } from './AdminSidebarShared'

const INITIAL_SIDEBAR_UI = getInitialSidebarUi()

const SECTION_DEFS: Array<{ id: AdminSection; icon: typeof SlidersHorizontal; labelKey: string }> = [
  { id: 'functionality', icon: SlidersHorizontal, labelKey: 'admin.sections.functionality' },
  { id: 'drivers', icon: Car, labelKey: 'admin.sections.drivers' },
  { id: 'passengers', icon: UserCircle, labelKey: 'admin.sections.passengers' },
]

const TAB_DEFS: Record<AdminTab, { icon: typeof MapPin; labelKey: string }> = {
  requests: { icon: MapPin, labelKey: 'admin.tabs.requests' },
  zones: { icon: PenNib, labelKey: 'admin.tabs.zones' },
  settings: { icon: Gear, labelKey: 'admin.tabs.settings' },
  system: { icon: Wrench, labelKey: 'admin.tabs.system' },
  staff: { icon: Users, labelKey: 'admin.tabs.staff' },
  drivers: { icon: Car, labelKey: 'admin.tabs.drivers' },
  driverApps: { icon: ClipboardText, labelKey: 'admin.tabs.driverApps' },
  qrSales: { icon: CreditCard, labelKey: 'admin.tabs.qrSales' },
  passengers: { icon: UserCircle, labelKey: 'admin.tabs.passengers' },
}

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
    handleUnassignDriver,
    unassigningRequestId,
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
    resetZoneDrawing,
    serviceZones,
    selectedZoneId,
    setSelectedZoneId,
    onShowZoneOnMap,
    handleToggleZone,
    handleDeleteZone,
    handleUpdateZone,
    pricing,
    qrSales,
    hasLoadedQrSalesOnce,
    handlePricingChange,
    platformSettings,
    handlePlatformChange,
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
    driverApplications,
    driverApplicationsPendingCount,
    driverRegistrationFormSchema,
    lastApprovedDriverApplicationKey,
    handleRefreshDriverApplications,
    handleSaveDriverRegistrationForm,
    handleApproveDriverApplication,
    handleRejectDriverApplication,
    selectedApplicationId,
    onSelectedApplicationIdChange,
  } = props

  const [copyState, setCopyState] = useState<CopyState>('idle')
  const [copiedToken, setCopiedToken] = useState<string | null>(null)
  const [showDriverForm, setShowDriverForm] = useState(INITIAL_SIDEBAR_UI.showDriverForm)
  const [showStaffForm, setShowStaffForm] = useState(INITIAL_SIDEBAR_UI.showStaffForm)
  const [editingDriverId, setEditingDriverId] = useState<string | null>(INITIAL_SIDEBAR_UI.editingDriverId)
  const [editingStaffId, setEditingStaffId] = useState<string | null>(INITIAL_SIDEBAR_UI.editingStaffId)
  const driverCardRefs = useRef<Record<string, HTMLDivElement | null>>({})

  const editingDriver = useMemo(
    () => drivers.find((driver) => driver.id === editingDriverId) ?? null,
    [drivers, editingDriverId],
  )
  const editingStaff = useMemo(
    () => managedAdminKeys.find((staff) => staff.id === editingStaffId) ?? null,
    [managedAdminKeys, editingStaffId],
  )

  const setEditingDriver = useCallback((driver: AdminSidebarProps['drivers'][number] | null) => {
    setEditingDriverId(driver?.id ?? null)
  }, [])
  const setEditingStaff = useCallback((staff: AdminSidebarProps['managedAdminKeys'][number] | null) => {
    setEditingStaffId(staff?.id ?? null)
  }, [])

  const sidebarUiPersistence = useMemo(
    () => ({
      showDriverForm,
      showStaffForm,
      editingDriverId,
      editingStaffId,
    }),
    [showDriverForm, showStaffForm, editingDriverId, editingStaffId],
  )
  usePersistAdminUiSlice('sidebar', sidebarUiPersistence)

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

  const [activeSection, setActiveSection] = useState<AdminSection>(() => adminSectionForTab(activeTab))

  useEffect(() => {
    setActiveSection(adminSectionForTab(activeTab))
  }, [activeTab])

  const tabs = useMemo(() => {
    let sectionTabs = [...ADMIN_SECTION_TABS[activeSection]]
    if (activeSection === 'functionality' && adminSession.role !== 'chief_admin') {
      sectionTabs = sectionTabs.filter((tab) => tab !== 'staff')
    }
    return sectionTabs.map((id) => ({ id, ...TAB_DEFS[id] }))
  }, [activeSection, adminSession.role])

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
      {!collapsed && (
        <button
          type="button"
          aria-label={t('common.close')}
          className="admin-drawer-scrim md:hidden fixed inset-0 z-[1999] bg-black/35"
          onClick={onToggleCollapse}
        />
      )}
      <aside
        className={`admin-sidebar-wrap flex-shrink-0 border-r border-border flex flex-col md:flex-row bg-white relative ${collapsed ? 'admin-sidebar-collapsed' : 'w-[440px]'}`}
        onClickCapture={(event) => {
          // On mobile, any tap on the collapsed peek strip should expand the drawer.
          if (!collapsed) return
          if (typeof window === 'undefined') return
          if (!window.matchMedia('(max-width: 768px)').matches) return
          event.stopPropagation()
          onToggleCollapse()
        }}
      >
        {/* Drawer handle for mobile */}
        <button
          type="button"
          className="admin-drawer-handle"
          aria-label={collapsed ? t('admin.sidebar.expandPanel', { defaultValue: 'Expand panel' }) : t('admin.sidebar.collapsePanel')}
          onClick={onToggleCollapse}
        />
        {/* Collapse toggle (desktop only, visible when panel is open) */}
        {!collapsed && (
          <button
            onClick={onToggleCollapse}
            className="hidden md:flex absolute top-1/2 -right-4 z-[1001] w-9 h-9 bg-white border border-border rounded-full shadow-card items-center justify-center hover:bg-surface transition-colors"
            style={{ transform: 'translateY(-50%)' }}
            title={t('admin.sidebar.collapsePanel')}
          >
            <CaretLeft size={14} weight="bold" />
          </button>
        )}
        <div className="admin-sidebar-icon-rail w-16 border-r border-border bg-surface flex flex-col items-center py-3 gap-1.5 flex-shrink-0">
          {SECTION_DEFS.map((section) => {
            const active = activeSection === section.id
            return (
              <button
                key={section.id}
                type="button"
                onClick={() => {
                  setActiveSection(section.id)
                  setActiveTab(defaultTabForSection(section.id))
                }}
                className={`w-[52px] h-[52px] flex items-center justify-center rounded-xl transition-all border ${
                  active ? 'bg-black text-white border-black' : 'text-muted border-transparent hover:bg-white hover:text-black'
                }`}
                title={t(section.labelKey, { defaultValue: section.id })}
                aria-label={t(section.labelKey, { defaultValue: section.id })}
              >
                <section.icon size={20} weight={active ? 'fill' : 'regular'} />
              </button>
            )
          })}
        </div>

        <div className="admin-sidebar-panel flex-1 flex flex-col overflow-hidden min-w-0">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between flex-shrink-0 gap-3">
            <div className="min-w-0">
              <h2 className="text-base font-extrabold tracking-tight truncate">
                {t(SECTION_DEFS.find((section) => section.id === activeSection)?.labelKey ?? 'admin.panel', {
                  defaultValue: activeSection,
                })}
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
                {activeTab === 'system' && t('admin.tabs.system', { defaultValue: 'Система' })}
                {activeTab === 'qrSales' && t('admin.sidebar.paymentsCount', { count: qrSales.length })}
                {activeTab === 'driverApps' &&
                  t('admin.sidebar.driverAppsCount', {
                    defaultValue: 'Заявок: {{count}}',
                    count: driverApplicationsPendingCount,
                  })}
                {activeTab === 'passengers' && t('admin.tabs.passengers', { defaultValue: 'Пассажиры' })}
                {activeTab === 'staff' && t('admin.sidebar.accountsCount', { count: managedAdminKeys.length })}
              </p>
            </div>
            {activeTab === 'drivers' && (
              <button
                onClick={() => setShowDriverForm((value) => !value)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-pill bg-black text-white text-xs font-bold transition-all hover:bg-zinc-800 active:scale-[0.97]"
              >
                {showDriverForm ? <X size={14} /> : <Plus size={14} />}
                {showDriverForm ? t('common.close') : t('common.create')}
              </button>
            )}
            {activeTab === 'staff' && adminSession.role === 'chief_admin' && (
              <button
                onClick={() => setShowStaffForm((value) => !value)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-pill bg-black text-white text-xs font-bold transition-all hover:bg-zinc-800 active:scale-[0.97]"
              >
                {showStaffForm ? <X size={14} /> : <Plus size={14} />}
                {showStaffForm ? t('common.close') : t('common.create')}
              </button>
            )}
            {activeTab === 'zones' && !isDrawing && (
              <button
                onClick={() => {
                  resetZoneDrawing()
                  setIsDrawing(true)
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-pill bg-black text-white text-xs font-bold transition-all hover:bg-zinc-800 active:scale-[0.97]"
              >
                <Plus size={14} />
                {t('admin.sidebar.newZone')}
              </button>
            )}
          </div>

          {tabs.length > 1 ? (
            <div className="admin-sidebar-tab-bar flex gap-1.5 px-4 py-2.5 border-b border-border overflow-x-auto scrollbar-none flex-shrink-0">
              {tabs.map((tab) => {
                const active = activeTab === tab.id
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-pill text-xs font-semibold whitespace-nowrap flex-shrink-0 transition-colors ${
                      active ? 'bg-black text-white' : 'bg-surface text-muted hover:text-black'
                    }`}
                    title={t(tab.labelKey)}
                  >
                    <tab.icon size={14} weight={active ? 'fill' : 'regular'} />
                    {t(tab.labelKey)}
                  </button>
                )
              })}
            </div>
          ) : null}

          <div className="flex-1 overflow-y-auto p-4 space-y-3 scroll-smooth-y gpu-scroll min-h-0">
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
              handleUnassignDriver={handleUnassignDriver}
              unassigningRequestId={unassigningRequestId}
            />

            <AdminSidebarDriverRegistrationSection
              activeTab={activeTab}
              applications={driverApplications}
              pendingCount={driverApplicationsPendingCount}
              formSchema={driverRegistrationFormSchema}
              lastApprovedDriverKey={lastApprovedDriverApplicationKey}
              selectedApplicationId={selectedApplicationId}
              onSelectedApplicationIdChange={onSelectedApplicationIdChange}
              copyState={copyState}
              copiedToken={copiedToken}
              copyText={copyText}
              onRefresh={handleRefreshDriverApplications}
              onSaveFormSchema={handleSaveDriverRegistrationForm}
              onApproveApplication={handleApproveDriverApplication}
              onRejectApplication={handleRejectDriverApplication}
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
              resetZoneDrawing={resetZoneDrawing}
              serviceZones={serviceZones}
              selectedZoneId={selectedZoneId}
              setSelectedZoneId={setSelectedZoneId}
              onShowZoneOnMap={onShowZoneOnMap}
              handleToggleZone={handleToggleZone}
              handleDeleteZone={handleDeleteZone}
              handleUpdateZone={handleUpdateZone}
              pricing={pricing}
              handlePricingChange={handlePricingChange}
              qrSales={qrSales}
              hasLoadedQrSalesOnce={hasLoadedQrSalesOnce}
              adminSession={adminSession}
            />

            <AdminSidebarPlatformSection
              activeTab={activeTab}
              platform={platformSettings}
              onChange={handlePlatformChange}
            />

            <AdminSidebarPassengersSection activeTab={activeTab} />

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
