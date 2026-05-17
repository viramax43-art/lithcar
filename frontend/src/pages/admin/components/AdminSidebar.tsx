import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Calendar,
  Car,
  CaretDown,
  CaretRight,
  Clock,
  Copy,
  Key,
  Stack,
  MapPin,
  PencilSimple,
  PenNib,
  Phone,
  Plus,
  Gear,
  User,
  Users,
  X,
} from '@phosphor-icons/react'

import type { AdminKeyInfo, AdminQrSaleAudit, AdminSessionUser } from '../../../lib/backend'
import type { Driver, GroupSuggestion, LatLng, PricingSettings, RideRequest, ServiceZone } from '../../../types'
import { STATUS_CONFIG, ZONE_COLORS, type AdminTab } from '../constants'
import EditDriverModal from './EditDriverModal'
import EditStaffModal from './EditStaffModal'
import InlineConfirm from './InlineConfirm'
import LithuanianPlate from '../../../components/LithuanianPlate'
import { showOnMapHref } from '../../../lib/navigation'

interface AdminSidebarProps {
  activeTab: AdminTab
  setActiveTab: (tab: AdminTab) => void
  filterStatus: string
  setFilterStatus: (status: string) => void
  requests: RideRequest[]
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
  handlePricingChange: (value: number) => Promise<void>
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
  handleUpdateManagedKey: (keyId: string, payload: Partial<{ name: string; role: 'admin' | 'moderator' }>) => Promise<void>
  newDriverName: string
  setNewDriverName: (value: string) => void
  newDriverPhone: string
  setNewDriverPhone: (value: string) => void
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
  lastCreatedDriverKey: string | null
  rotatedDriverKeys: Record<string, string>
  handleCreateDriver: () => Promise<void>
  handleRotateDriverKey: (driverId: string) => Promise<void>
  handleUpdateDriver: (
    driverId: string,
    payload: Partial<{
      name: string
      phone: string
      carBrand: string
      carModel: string
      carPlate: string
      vehicleColor: string
      seatsCount: number
      about: string
      isOnline: boolean
      canSellPoints: boolean
    }>
  ) => Promise<void>
  handleDeleteDriver: (driverId: string) => Promise<void>
}

const inputCls =
  'w-full px-3 py-2.5 rounded-xl border-[1.5px] border-border bg-surface text-sm outline-none focus:border-black focus:bg-white transition-colors'

const TAB_DEFS = [
  { id: 'requests' as AdminTab, icon: MapPin, label: 'Заявки' },
  { id: 'suggestions' as AdminTab, icon: Stack, label: 'Группы' },
  { id: 'drivers' as AdminTab, icon: Car, label: 'Водители' },
  { id: 'zones' as AdminTab, icon: PenNib, label: 'Зоны' },
  { id: 'settings' as AdminTab, icon: Gear, label: 'Цены' },
  { id: 'qrSales' as AdminTab, icon: Key, label: 'QR лог' },
]

export default function AdminSidebar(props: AdminSidebarProps) {
  const {
    activeTab,
    setActiveTab,
    filterStatus,
    setFilterStatus,
    requests,
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
    newDriverPhone,
    setNewDriverPhone,
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
    lastCreatedDriverKey,
    rotatedDriverKeys,
    handleCreateDriver,
    handleRotateDriverKey,
    handleUpdateDriver,
    handleDeleteDriver,
  } = props

  const [copyState, setCopyState] = useState<'idle' | 'ok' | 'error'>('idle')
  const [copiedToken, setCopiedToken] = useState<string | null>(null)
  const driverCardRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const [showDriverForm, setShowDriverForm] = useState(false)
  const [showStaffForm, setShowStaffForm] = useState(false)
  const [editingDriver, setEditingDriver] = useState<Driver | null>(null)
  const [editingStaff, setEditingStaff] = useState<AdminKeyInfo | null>(null)

  useEffect(() => {
    setCopyState('idle')
  }, [lastCreatedAdminKey, lastCreatedDriverKey])

  useEffect(() => {
    if (!expandedDriverId) return
    const el = driverCardRefs.current[expandedDriverId]
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [expandedDriverId])

  const tabs = useMemo(() => {
    if (adminSession.role !== 'chief_admin') return TAB_DEFS
    return [...TAB_DEFS, { id: 'staff' as AdminTab, icon: Users, label: 'Персонал' }]
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
      <aside className="w-[440px] flex-shrink-0 border-r border-border flex bg-white overflow-hidden">
        {/* Vertical icon rail */}
        <div className="w-16 border-r border-border bg-surface flex flex-col items-center py-3 gap-1 flex-shrink-0">
          {tabs.map((tab) => {
            const active = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-12 flex flex-col items-center justify-center gap-1 py-2.5 rounded-xl transition-all ${
                  active ? 'bg-black text-white' : 'text-muted hover:bg-white hover:text-black'
                }`}
                title={tab.label}
              >
                <tab.icon size={20} weight={active ? 'fill' : 'regular'} />
                <span className="text-[9px] font-medium leading-none">{tab.label}</span>
              </button>
            )
          })}
        </div>

        {/* Content area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Tab title */}
          <div className="px-5 py-4 border-b border-border flex items-center justify-between flex-shrink-0">
            <div>
              <h2 className="text-base font-extrabold tracking-tight">
                {tabs.find((t) => t.id === activeTab)?.label}
              </h2>
              <p className="text-[11px] text-muted mt-0.5">
                {activeTab === 'requests' && `${requests.length} заявок`}
                {activeTab === 'suggestions' && `${suggestions.length} групп`}
                {activeTab === 'drivers' && `${drivers.length} водителей · ${drivers.filter((d) => d.isOnline).length} онлайн`}
                {activeTab === 'zones' && `${serviceZones.length} зон`}
                {activeTab === 'settings' && 'Тарификация поездок'}
                {activeTab === 'qrSales' && `${qrSales.length} QR-операций`}
                {activeTab === 'staff' && `${managedAdminKeys.length} аккаунтов`}
              </p>
            </div>
            {activeTab === 'drivers' && (
              <button
                onClick={() => setShowDriverForm((v) => !v)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-pill bg-black text-white text-xs font-bold transition-all active:scale-[0.97]"
              >
                {showDriverForm ? <X size={14} /> : <Plus size={14} />}
                {showDriverForm ? 'Закрыть' : 'Создать'}
              </button>
            )}
            {activeTab === 'staff' && adminSession.role === 'chief_admin' && (
              <button
                onClick={() => setShowStaffForm((v) => !v)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-pill bg-black text-white text-xs font-bold transition-all active:scale-[0.97]"
              >
                {showStaffForm ? <X size={14} /> : <Plus size={14} />}
                {showStaffForm ? 'Закрыть' : 'Создать'}
              </button>
            )}
            {activeTab === 'zones' && !isDrawing && (
              <button
                onClick={() => setIsDrawing(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-pill bg-black text-white text-xs font-bold transition-all active:scale-[0.97]"
              >
                <Plus size={14} />
                Новая зона
              </button>
            )}
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto p-4">
            {activeTab === 'requests' && (
              <>
                <div className="flex items-center gap-2 mb-3 overflow-x-auto pb-1 -mx-1 px-1">
                  {['all', 'pending', 'grouped', 'assigned', 'en_route_to_pickup', 'awaiting_passenger', 'in_progress', 'completed'].map((status) => (
                    <button
                      key={status}
                      onClick={() => setFilterStatus(status)}
                      className={`px-3 py-1.5 rounded-pill text-xs font-semibold whitespace-nowrap transition-colors ${
                        filterStatus === status ? 'bg-black text-white' : 'bg-surface text-muted hover:text-black'
                      }`}
                    >
                      {status === 'all' ? 'Все' : STATUS_CONFIG[status]?.label ?? status}
                    </button>
                  ))}
                </div>
                <div className="space-y-2">
                  {requests.map((request) => {
                    const status = STATUS_CONFIG[request.status] ?? STATUS_CONFIG.pending
                    const selected = selectedReqId === request.id
                    return (
                      <button
                        key={request.id}
                        onClick={() => setSelectedReqId(selected ? null : request.id)}
                        className={`w-full text-left p-3 rounded-card border-[1.5px] transition-all ${
                          selected ? 'border-black bg-surface' : 'border-border hover:border-muted'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2.5">
                          <span className="text-sm font-bold truncate">{request.passengerName}</span>
                          <span
                            className="text-[10px] font-bold px-2 py-0.5 rounded-pill flex-shrink-0 ml-2"
                            style={{ color: status.color, background: status.bg }}
                          >
                            {status.label}
                          </span>
                        </div>
                        <div className="flex gap-2.5">
                          <div className="flex flex-col items-center pt-1.5 flex-shrink-0">
                            <div className="w-2 h-2 rounded-full bg-point-a" />
                            <div className="w-px flex-1 bg-border my-1" style={{ minHeight: 12 }} />
                            <div className="w-2 h-2 rounded-full bg-point-b" />
                          </div>
                          <div className="flex-1 min-w-0 text-xs space-y-2">
                            <p className="truncate">{request.from.address}</p>
                            <p className="truncate">{request.to.address}</p>
                          </div>
                        </div>
                        <div className="mt-2.5 pt-2.5 border-t border-border flex items-center justify-between">
                          <span className="text-[10px] text-muted flex items-center gap-1">
                            <Clock size={10} />
                            {new Date(request.dateTime).toLocaleString('ru-RU', {
                              day: 'numeric',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                          {!request.driverId && (
                            <button
                              onClick={(event) => {
                                event.stopPropagation()
                                setAssignModalReqIds([request.id])
                              }}
                              className="text-[10px] font-bold text-accent-dark bg-accent/10 hover:bg-accent/20 px-2.5 py-1 rounded-pill transition-colors"
                            >
                              Назначить
                            </button>
                          )}
                        </div>
                      </button>
                    )
                  })}
                  {requests.length === 0 && (
                    <p className="text-xs text-muted text-center py-12">Заявок не найдено</p>
                  )}
                </div>
              </>
            )}

            {activeTab === 'suggestions' && (
              <div className="space-y-3">
                {suggestions.map((suggestion) => {
                  const selected = selectedGroupId === suggestion.id
                  const color = groupColorMap[suggestion.id] ?? '#858585'
                  const groupRequests = requests.filter((r) => suggestion.requestIds.includes(r.id))
                  return (
                    <div
                      key={suggestion.id}
                      className={`rounded-card border-[1.5px] overflow-hidden transition-all ${
                        selected ? 'border-black' : 'border-border'
                      }`}
                      style={{ borderLeftColor: color, borderLeftWidth: 4 }}
                    >
                      <button
                        onClick={() => setSelectedGroupId(selected ? null : suggestion.id)}
                        className="w-full text-left p-4 hover:bg-surface/60 transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold">Группа</span>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-pill bg-surface text-muted">
                              {suggestion.requestIds.length} заявок
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold">{suggestion.similarity}%</span>
                            {selected ? <CaretDown size={14} weight="bold" /> : <CaretRight size={14} weight="bold" />}
                          </div>
                        </div>
                        <p className="text-xs text-muted mt-2">{suggestion.reason}</p>
                      </button>
                      {selected && (
                        <div className="px-4 pb-4 space-y-2 border-t border-border bg-surface/40 pt-3">
                          {groupRequests.map((req) => (
                            <div key={req.id} className="flex items-center gap-2 text-[11px]">
                              <span className="w-1.5 h-1.5 rounded-full bg-point-a flex-shrink-0" />
                              <span className="truncate">{req.from.address}</span>
                              <span className="text-muted">→</span>
                              <span className="w-1.5 h-1.5 rounded-full bg-point-b flex-shrink-0" />
                              <span className="truncate">{req.to.address}</span>
                            </div>
                          ))}
                          <button
                            onClick={() => setAssignModalReqIds(suggestion.requestIds)}
                            className="mt-2 w-full py-2.5 bg-black text-white text-xs font-bold rounded-xl transition-all active:scale-[0.97]"
                          >
                            Назначить водителя на группу
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
                {suggestions.length === 0 && (
                  <p className="text-xs text-muted text-center py-12">Группировок пока нет</p>
                )}
              </div>
            )}

            {activeTab === 'drivers' && (
              <div className="space-y-3">
                {showDriverForm && (
                  <div className="rounded-card border-[1.5px] border-black p-4 space-y-2.5 bg-surface/50">
                    <p className="text-sm font-bold">Новый водитель</p>
                    <input
                      value={newDriverName}
                      onChange={(e) => setNewDriverName(e.target.value)}
                      placeholder="Имя"
                      className={inputCls}
                    />
                    <input
                      value={newDriverPhone}
                      onChange={(e) => setNewDriverPhone(e.target.value)}
                      placeholder="Телефон"
                      className={inputCls}
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        value={newDriverCarBrand}
                        onChange={(e) => setNewDriverCarBrand(e.target.value)}
                        placeholder="Марка"
                        className={inputCls}
                      />
                      <input
                        value={newDriverCarModel}
                        onChange={(e) => setNewDriverCarModel(e.target.value)}
                        placeholder="Модель"
                        className={inputCls}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        value={newDriverCarPlate}
                        onChange={(e) => setNewDriverCarPlate(e.target.value)}
                        placeholder="Номер"
                        className={inputCls}
                      />
                      <input
                        value={newDriverVehicleColor}
                        onChange={(e) => setNewDriverVehicleColor(e.target.value)}
                        placeholder="Цвет"
                        className={inputCls}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2 items-center">
                      <label className="text-xs font-semibold text-muted">Мест в авто</label>
                      <input
                        type="number"
                        min={1}
                        max={12}
                        value={newDriverSeatsCount}
                        onChange={(e) => setNewDriverSeatsCount(Number(e.target.value) || 1)}
                        className={inputCls}
                      />
                    </div>
                    <textarea
                      value={newDriverAbout}
                      onChange={(e) => setNewDriverAbout(e.target.value)}
                      placeholder="О водителе (опционально)"
                      className={`${inputCls} min-h-16 resize-none`}
                    />
                    <label className="flex items-center gap-2 rounded-xl border border-border bg-white px-3 py-2.5">
                      <input
                        type="checkbox"
                        checked={newDriverCanSellPoints}
                        onChange={(e) => setNewDriverCanSellPoints(e.target.checked)}
                      />
                      <span className="text-xs font-semibold">Разрешить продажу поинтов через QR</span>
                    </label>
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-muted">Фото водителя</label>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0] ?? null
                          setNewDriverPhotoFile(file)
                          if (!file) {
                            setNewDriverPhotoPreview(null)
                            return
                          }
                          const previewUrl = URL.createObjectURL(file)
                          setNewDriverPhotoPreview(previewUrl)
                        }}
                        className="block w-full text-xs file:mr-3 file:py-1.5 file:px-3 file:rounded-pill file:border-0 file:bg-black file:text-white file:text-xs file:font-semibold file:cursor-pointer"
                      />
                      {newDriverPhotoPreview && (
                        <img
                          src={newDriverPhotoPreview}
                          alt="driver preview"
                          className="w-20 h-20 rounded-xl object-cover border border-border"
                        />
                      )}
                    </div>
                    <button
                      onClick={() => void handleCreateDriver()}
                      className="w-full py-2.5 rounded-xl bg-black text-white text-sm font-bold transition-all active:scale-[0.97]"
                    >
                      Создать водителя
                    </button>
                    {lastCreatedDriverKey && (
                      <KeyReveal
                        title="Ключ водителя (показывается один раз):"
                        value={lastCreatedDriverKey}
                        onCopy={() => void copyText(lastCreatedDriverKey, 'driver:lastCreated')}
                        copied={copiedToken === 'driver:lastCreated' && copyState === 'ok'}
                        copyError={copiedToken === 'driver:lastCreated' && copyState === 'error'}
                      />
                    )}
                  </div>
                )}

                {drivers.map((driver) => {
                  const expanded = expandedDriverId === driver.id
                  const createdDate = driver.createdAt
                    ? new Date(driver.createdAt).toLocaleDateString('ru-RU', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      })
                    : null
                  return (
                    <div
                      key={driver.id}
                      ref={(el) => {
                        driverCardRefs.current[driver.id] = el
                      }}
                      className={`rounded-card border-[1.5px] overflow-hidden transition-all ${
                        expanded ? 'border-black shadow-card' : 'border-border'
                      }`}
                    >
                      {/* Header (collapsed view always visible) */}
                      <button
                        onClick={() => setExpandedDriverId(expanded ? null : driver.id)}
                        className="w-full text-left p-3 flex items-center gap-3 hover:bg-surface/40 transition-colors"
                      >
                        <div className="relative flex-shrink-0">
                          {driver.photoUrl ? (
                            <img
                              src={driver.photoUrl}
                              alt={driver.name}
                              className="w-12 h-12 rounded-xl object-contain bg-surface border border-border"
                            />
                          ) : (
                            <div className="w-12 h-12 rounded-xl bg-surface text-muted flex items-center justify-center">
                              <User size={20} />
                            </div>
                          )}
                          {driver.isOnline && (
                            <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-accent border-2 border-white" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold truncate">{driver.name}</p>
                          <p className="text-xs text-muted truncate">
                            {[driver.carBrand, driver.carModel].filter(Boolean).join(' ')} · {driver.carPlate}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[10px] font-bold text-accent-dark">
                              {driver.canSellPoints ? 'QR-продажи включены' : 'QR-продажи отключены'}
                            </span>
                            <span className="text-border">·</span>
                            <span
                              className={`text-[10px] font-semibold ${driver.isOnline ? 'text-accent-dark' : 'text-muted'}`}
                            >
                              {driver.isOnline ? 'Онлайн' : 'Офлайн'}
                            </span>
                          </div>
                        </div>
                        <div className="p-1 text-muted flex-shrink-0">
                          {expanded ? <CaretDown size={16} weight="bold" /> : <CaretRight size={16} weight="bold" />}
                        </div>
                      </button>

                      {/* Expanded details */}
                      {expanded && (
                        <div className="border-t border-border">
                          {/* Photo banner */}
                          <div className="relative h-32 bg-gradient-to-br from-zinc-800 to-black overflow-hidden">
                            {driver.photoUrl && (
                              <img
                                src={driver.photoUrl}
                                alt={driver.name}
                                className="absolute inset-0 w-full h-full object-contain object-top opacity-95"
                              />
                            )}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                            <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <p className="text-base font-extrabold text-white truncate drop-shadow">
                                    {driver.name}
                                  </p>
                                  {driver.isOnline && (
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-pill bg-accent/90 text-black text-[9px] font-bold uppercase tracking-wider">
                                      <span className="w-1 h-1 rounded-full bg-black animate-pulse" />
                                      Live
                                    </span>
                                  )}
                                </div>
                                <p className="text-[11px] text-white/80 mt-0.5">
                                  {[driver.carBrand, driver.carModel].filter(Boolean).join(' ')}
                                </p>
                              </div>
                            </div>
                          </div>

                          {/* Stats grid */}
                          <div className="grid grid-cols-2 divide-x divide-border border-b border-border bg-white">
                            <Stat
                              icon={<Key size={14} className="text-accent-dark" />}
                              value={driver.canSellPoints ? 'Да' : 'Нет'}
                              label="QR-продажа"
                            />
                            <Stat
                              icon={<Users size={14} className="text-zinc-700" />}
                              value={String(driver.seatsCount ?? '—')}
                              label="Мест"
                            />
                          </div>

                          <div className="p-4 space-y-4 bg-surface/40">
                            {/* Vehicle */}
                            <Section title="Автомобиль">
                              <div className="rounded-xl bg-white border border-border p-3 space-y-2">
                                <div className="flex items-center gap-2.5">
                                  <div className="w-9 h-9 rounded-xl bg-surface flex items-center justify-center flex-shrink-0">
                                    <Car size={16} />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-bold truncate">
                                      {[driver.carBrand, driver.carModel].filter(Boolean).join(' ') || '—'}
                                    </p>
                                    <p className="text-[11px] text-muted">
                                      {driver.vehicleColor || '—'} · {driver.seatsCount ?? '—'} мест
                                    </p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 pt-2 border-t border-border">
                                  <LithuanianPlate value={driver.carPlate} size="sm" />
                                  {driver.vehicleColor && (
                                    <>
                                      <span className="w-px h-3 bg-border ml-auto" />
                                      <ColorSwatch color={driver.vehicleColor} />
                                      <span className="text-[10px] text-muted">{driver.vehicleColor}</span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </Section>

                            {/* Contacts */}
                            <Section title="Контакты">
                              <div className="space-y-2">
                                <a
                                  href={`tel:${driver.phone}`}
                                  className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-white border border-border hover:border-black transition-colors group"
                                >
                                  <div className="w-8 h-8 rounded-xl bg-accent/10 flex items-center justify-center flex-shrink-0">
                                    <Phone size={13} className="text-accent-dark" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-[10px] font-semibold text-muted uppercase tracking-wider">Телефон</p>
                                    <p className="text-xs font-semibold truncate">{driver.phone || '—'}</p>
                                  </div>
                                  <span className="text-[10px] font-bold text-accent-dark opacity-0 group-hover:opacity-100 transition-opacity">
                                    Позвонить
                                  </span>
                                </a>
                                <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-white border border-border">
                                  <div className="w-8 h-8 rounded-xl bg-amber-50 flex items-center justify-center flex-shrink-0">
                                    <Key size={13} className="text-amber-700" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-[10px] font-semibold text-muted uppercase tracking-wider">Ключ</p>
                                    <p className="text-xs font-mono font-semibold truncate">
                                      {driver.keyPrefix}…
                                    </p>
                                  </div>
                                  <button
                                    onClick={() => void handleRotateDriverKey(driver.id)}
                                    className="text-[10px] font-bold px-2.5 py-1 rounded-pill bg-amber-100 hover:bg-amber-200 text-amber-800 transition-colors"
                                  >
                                    Обновить
                                  </button>
                                </div>
                              </div>
                            </Section>

                            {/* About */}
                            {driver.about && (
                              <Section title="О водителе">
                                <p className="text-xs leading-relaxed bg-white border border-border rounded-xl p-3">
                                  {driver.about}
                                </p>
                              </Section>
                            )}

                            {/* Location */}
                            {driver.isOnline && driver.currentLocation && (
                              <Section title="Геолокация">
                                <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-white border border-border">
                                  <div className="w-8 h-8 rounded-xl bg-accent/10 flex items-center justify-center flex-shrink-0">
                                    <MapPin size={13} className="text-accent-dark" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-[10px] font-semibold text-muted uppercase tracking-wider">
                                      Текущие координаты
                                    </p>
                                    <p className="text-xs font-mono truncate">
                                      {driver.currentLocation.lat.toFixed(6)}, {driver.currentLocation.lng.toFixed(6)}
                                    </p>
                                  </div>
                                  <a
                                    href={showOnMapHref(driver.currentLocation, driver.name)}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-[10px] font-bold px-2.5 py-1 rounded-pill bg-accent/15 hover:bg-accent/25 text-accent-dark transition-colors flex-shrink-0"
                                    title="Открыть в навигаторе"
                                  >
                                    Открыть
                                  </a>
                                </div>
                              </Section>
                            )}

                            {/* Meta */}
                            {createdDate && (
                              <div className="flex items-center gap-2 text-[11px] text-muted pt-2 border-t border-border">
                                <Calendar size={11} />
                                <span>Зарегистрирован {createdDate}</span>
                              </div>
                            )}

                            {/* Actions */}
                            <div className="flex flex-wrap gap-2 pt-3 border-t border-border">
                              <button
                                onClick={() => setEditingDriver(driver)}
                                className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-pill bg-black text-white hover:bg-zinc-800 transition-colors"
                              >
                                <PencilSimple size={12} /> Редактировать
                              </button>
                              <button
                                onClick={() => void handleRotateDriverKey(driver.id)}
                                className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-pill bg-white border border-border hover:bg-surface transition-colors"
                              >
                                <Key size={12} /> Новый ключ
                              </button>
                              <InlineConfirm
                                label="Удалить"
                                confirmLabel="Точно удалить?"
                                onConfirm={() => void handleDeleteDriver(driver.id)}
                                className="ml-auto !text-xs !px-3 !py-1.5"
                              />
                            </div>

                            {rotatedDriverKeys[driver.id] && (
                              <KeyReveal
                                title="Новый ключ водителя:"
                                value={rotatedDriverKeys[driver.id]}
                                onCopy={() =>
                                  void copyText(rotatedDriverKeys[driver.id], `driver:${driver.id}`)
                                }
                                copied={copiedToken === `driver:${driver.id}` && copyState === 'ok'}
                                copyError={copiedToken === `driver:${driver.id}` && copyState === 'error'}
                              />
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
                {drivers.length === 0 && !showDriverForm && (
                  <p className="text-xs text-muted text-center py-12">Водителей нет</p>
                )}
              </div>
            )}

            {activeTab === 'zones' && (
              <div className="space-y-3">
                {isDrawing && (
                  <div className="rounded-card border-[1.5px] border-black p-4 space-y-3 bg-surface/50">
                    <p className="text-sm font-bold">Новая зона</p>
                    <input
                      value={newZoneName}
                      onChange={(event) => setNewZoneName(event.target.value)}
                      placeholder="Название зоны"
                      className={inputCls}
                    />
                    <div>
                      <p className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-1.5">Цвет</p>
                      <div className="flex gap-2">
                        {ZONE_COLORS.map((color) => (
                          <button
                            key={color}
                            onClick={() => setNewZoneColor(color)}
                            className={`w-7 h-7 rounded-full transition-transform ${
                              newZoneColor === color ? 'ring-2 ring-black ring-offset-2 scale-110' : ''
                            }`}
                            style={{ background: color }}
                          />
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted">Точек на карте</span>
                      <span className="font-bold">{drawingPoints.length}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => setDrawingPoints((prev) => prev.slice(0, -1))}
                        disabled={drawingPoints.length === 0}
                        className="py-2 rounded-xl bg-surface text-xs font-semibold disabled:opacity-50 transition-all active:scale-[0.97]"
                      >
                        Отменить точку
                      </button>
                      <button
                        onClick={() => {
                          setIsDrawing(false)
                          setDrawingPoints(() => [])
                        }}
                        className="py-2 rounded-xl bg-surface text-xs font-semibold transition-all active:scale-[0.97]"
                      >
                        Отмена
                      </button>
                    </div>
                    <button
                      onClick={() => void handleCreateZone()}
                      disabled={drawingPoints.length < 3 || !newZoneName.trim()}
                      className="w-full py-2.5 bg-black text-white rounded-xl text-sm font-bold disabled:opacity-50 transition-all active:scale-[0.97]"
                    >
                      Сохранить зону
                    </button>
                  </div>
                )}

                {serviceZones.map((zone) => {
                  const selected = selectedZoneId === zone.id
                  return (
                    <div
                      key={zone.id}
                      className={`rounded-card border-[1.5px] overflow-hidden transition-all ${
                        selected ? 'border-black' : 'border-border'
                      }`}
                    >
                      <button
                        onClick={() => setSelectedZoneId(selected ? null : zone.id)}
                        className="w-full p-3.5 text-left hover:bg-surface/60 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <span
                            className="w-3 h-3 rounded-full flex-shrink-0"
                            style={{ background: zone.color }}
                          />
                          <span className="text-sm font-bold flex-1 truncate">{zone.name}</span>
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-pill flex-shrink-0 ${
                              zone.isActive
                                ? 'bg-accent/15 text-accent-dark'
                                : 'bg-surface text-muted'
                            }`}
                          >
                            {zone.isActive ? 'Активна' : 'Отключена'}
                          </span>
                        </div>
                      </button>
                      {selected && (
                        <div className="flex gap-2 px-3.5 pb-3.5 border-t border-border pt-3">
                          <button
                            onClick={() => void handleToggleZone(zone)}
                            className="flex-1 py-2 rounded-xl bg-surface text-xs font-semibold hover:bg-border transition-colors"
                          >
                            {zone.isActive ? 'Отключить' : 'Включить'}
                          </button>
                          <InlineConfirm
                            label="Удалить"
                            confirmLabel="Точно удалить?"
                            onConfirm={() => void handleDeleteZone(zone.id)}
                            className="flex-1 !text-xs !py-2"
                          />
                        </div>
                      )}
                    </div>
                  )
                })}
                {serviceZones.length === 0 && !isDrawing && (
                  <p className="text-xs text-muted text-center py-12">
                    Зон пока нет. Создайте первую — кликами по карте.
                  </p>
                )}
              </div>
            )}

            {activeTab === 'settings' && (
              <div className="space-y-4">
                <div className="rounded-card border-[1.5px] border-border p-4 space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-2">
                      Цена 1 поинта (евроценты)
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={pricing.pointPriceCents}
                      onChange={(event) => void handlePricingChange(parseInt(event.target.value, 10))}
                      className={inputCls}
                    />
                  </div>
                </div>
                <div className="rounded-card bg-black text-white p-5 space-y-3">
                  <p className="text-xs font-semibold text-white/60 uppercase tracking-wider">Расчёт</p>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-white/70">Цена 1 поинта</span>
                    <span className="font-semibold">€{(pricing.pointPriceCents / 100).toFixed(2)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-white/70">Поинтов за поездку</span>
                    <span className="font-semibold">{pricing.pointsPerRide}</span>
                  </div>
                  <div className="h-px bg-white/15" />
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-white/70">Стоимость поездки</span>
                    <span className="text-2xl font-extrabold text-accent">
                      €{((pricing.pointsPerRide * pricing.pointPriceCents) / 100).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'qrSales' && (
              <div className="space-y-3">
                {qrSales.map((sale) => (
                  <div key={sale.saleId} className="rounded-card border-[1.5px] border-border p-3 bg-white space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-bold truncate">
                        {sale.driverName || sale.driverId} · €{sale.eurAmount.toFixed(2)}
                      </p>
                      <span className="text-[10px] px-2 py-0.5 rounded-pill bg-surface text-muted">
                        {sale.settlementStatus}
                      </span>
                    </div>
                    <p className="text-xs text-muted">
                      {sale.pointsAmount} pts · токен {sale.tokenPreview}
                    </p>
                    <p className="text-[11px] text-muted">
                      Погашен: {sale.redeemedAt ? new Date(sale.redeemedAt).toLocaleString('ru-RU') : 'нет'} ·
                      пользователь: {sale.username || sale.userId || '—'}
                    </p>
                    <div className="rounded-xl border border-border bg-surface/40 p-2">
                      <p className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-1">События</p>
                      <div className="space-y-1">
                        {sale.events.map((event) => (
                          <p key={event.id} className="text-[11px]">
                            <span className="font-semibold">{event.action}</span>{' '}
                            <span className="text-muted">({event.actorType}:{event.actorId})</span>
                          </p>
                        ))}
                        {sale.events.length === 0 && <p className="text-[11px] text-muted">Нет событий</p>}
                      </div>
                    </div>
                  </div>
                ))}
                {qrSales.length === 0 && (
                  <p className="text-xs text-muted text-center py-12">QR-операций пока нет</p>
                )}
              </div>
            )}

            {activeTab === 'staff' && adminSession.role === 'chief_admin' && (
              <div className="space-y-3">
                {showStaffForm && (
                  <div className="rounded-card border-[1.5px] border-black p-4 space-y-3 bg-surface/50">
                    <p className="text-sm font-bold">Новый аккаунт персонала</p>
                    <input
                      value={newManagedKeyName}
                      onChange={(event) => setNewManagedKeyName(event.target.value)}
                      placeholder="Имя сотрудника"
                      className={inputCls}
                    />
                    <div>
                      <p className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-1.5">Роль</p>
                      <div className="grid grid-cols-2 gap-2">
                        {(['admin', 'moderator'] as const).map((r) => (
                          <button
                            key={r}
                            onClick={() => setNewManagedKeyRole(r)}
                            className={`py-2 rounded-xl text-xs font-semibold transition-colors ${
                              newManagedKeyRole === r ? 'bg-black text-white' : 'bg-surface text-muted'
                            }`}
                          >
                            {r === 'admin' ? 'Admin' : 'Moderator'}
                          </button>
                        ))}
                      </div>
                    </div>
                    <button
                      onClick={() => void handleCreateManagedKey()}
                      disabled={!newManagedKeyName.trim()}
                      className="w-full py-2.5 bg-black text-white rounded-xl text-sm font-bold disabled:opacity-50 transition-all active:scale-[0.97]"
                    >
                      Создать аккаунт
                    </button>
                    {lastCreatedAdminKey && (
                      <KeyReveal
                        title="Ключ доступа (показывается один раз):"
                        value={lastCreatedAdminKey}
                        onCopy={() => void copyText(lastCreatedAdminKey, 'admin:lastCreated')}
                        copied={copiedToken === 'admin:lastCreated' && copyState === 'ok'}
                        copyError={copiedToken === 'admin:lastCreated' && copyState === 'error'}
                      />
                    )}
                  </div>
                )}

                {managedAdminKeys.map((item) => (
                  <div key={item.id} className="rounded-card border-[1.5px] border-border p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-bold truncate">{item.name}</p>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-pill bg-surface text-muted">
                            {item.role}
                          </span>
                        </div>
                        <p className="text-[10px] text-muted font-mono mt-0.5">{item.keyPrefix}…</p>
                      </div>
                      {item.role === 'chief_admin' && (
                        <span className="text-[10px] px-2 py-1 rounded-pill bg-slate-200 text-slate-700 flex-shrink-0">
                          Системный
                        </span>
                      )}
                    </div>

                    {item.role !== 'chief_admin' && (
                      <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
                        <button
                          onClick={() => setEditingStaff(item)}
                          className="inline-flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-pill bg-surface hover:bg-border transition-colors"
                        >
                          <PencilSimple size={11} /> Редактировать
                        </button>
                        <button
                          onClick={() => void handleRotateManagedKey(item.id)}
                          className="inline-flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-pill bg-surface hover:bg-border transition-colors"
                        >
                          <Key size={11} /> Новый ключ
                        </button>
                        <InlineConfirm
                          label="Удалить"
                          confirmLabel="Точно удалить?"
                          onConfirm={() => void handleRevokeManagedKey(item.id)}
                          className="ml-auto"
                        />
                      </div>
                    )}

                    {rotatedAdminKeys[item.id] && (
                      <KeyReveal
                        title="Новый ключ:"
                        value={rotatedAdminKeys[item.id]}
                        onCopy={() => void copyText(rotatedAdminKeys[item.id], `admin:${item.id}`)}
                        copied={copiedToken === `admin:${item.id}` && copyState === 'ok'}
                        copyError={copiedToken === `admin:${item.id}` && copyState === 'error'}
                      />
                    )}
                  </div>
                ))}
                {managedAdminKeys.length === 0 && !showStaffForm && (
                  <p className="text-xs text-muted text-center py-12">Аккаунтов персонала нет</p>
                )}
              </div>
            )}
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

function Stat({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode
  value: string
  label: string
}) {
  return (
    <div className="flex flex-col items-center justify-center py-3">
      <div className="mb-1">{icon}</div>
      <p className="text-base font-extrabold leading-none">{value}</p>
      <p className="text-[10px] font-semibold text-muted uppercase tracking-wider mt-1">{label}</p>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-bold text-muted uppercase tracking-wider mb-1.5">{title}</p>
      {children}
    </div>
  )
}

const COLOR_NAME_TO_HEX: Record<string, string> = {
  чёрный: '#000000',
  черный: '#000000',
  белый: '#ffffff',
  серый: '#9ca3af',
  серебристый: '#c0c0c0',
  серебряный: '#c0c0c0',
  красный: '#ef4444',
  синий: '#3b82f6',
  голубой: '#60a5fa',
  зелёный: '#22c55e',
  зеленый: '#22c55e',
  жёлтый: '#eab308',
  желтый: '#eab308',
  оранжевый: '#f97316',
  коричневый: '#92400e',
  фиолетовый: '#a855f7',
  розовый: '#ec4899',
  бордовый: '#7f1d1d',
  бежевый: '#d6b88e',
  golden: '#daa520',
  gold: '#daa520',
}

function ColorSwatch({ color }: { color: string }) {
  const key = color.trim().toLowerCase()
  const isHex = /^#?[0-9a-f]{3,8}$/i.test(color.trim())
  const value = isHex
    ? color.trim().startsWith('#')
      ? color.trim()
      : `#${color.trim()}`
    : COLOR_NAME_TO_HEX[key] ?? '#9ca3af'
  return (
    <span
      className="w-3.5 h-3.5 rounded-full border border-border flex-shrink-0"
      style={{ background: value }}
    />
  )
}

function KeyReveal({
  title,
  value,
  onCopy,
  copied,
  copyError,
}: {
  title: string
  value: string
  onCopy: () => void
  copied: boolean
  copyError: boolean
}) {
  return (
    <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 space-y-2">
      <p className="text-[11px] text-amber-800 font-semibold">{title}</p>
      <p className="text-xs font-mono break-all bg-white/60 rounded-lg px-2 py-1.5">{value}</p>
      <button
        onClick={onCopy}
        className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-pill bg-amber-100 hover:bg-amber-200 text-amber-800 transition-colors"
      >
        <Copy size={12} />
        Скопировать
      </button>
      {copied && <p className="text-[10px] text-emerald-700">Ключ скопирован.</p>}
      {copyError && <p className="text-[10px] text-red-600">Не удалось скопировать.</p>}
    </div>
  )
}
