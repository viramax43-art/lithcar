import { useEffect, useMemo, useRef, useState } from 'react'

import { getInitialZonesSettingsUi } from '../../../lib/adminUiState'
import { usePersistAdminUiSlice } from '../../../lib/useAdminUiPersistence'
import { useTranslation } from 'react-i18next'

import { SUPPORTED_LANGUAGES } from '../../../i18n/languages'
import { normalizeUserInfoText, userInfoTextEqual, type UserInfoTextI18n } from '../../../lib/userInfoText'
import { ZONE_COLORS } from '../constants'
import { AdminDynamicPricingSection } from './AdminDynamicPricingSection'
import InlineConfirm from './InlineConfirm'
import { inputCls } from './AdminSidebarShared'
import Skeleton from '../../../components/Skeleton'
import { formatDate, formatTime } from '../../../i18n/dateTime'
import type { AdminSidebarProps } from './AdminSidebar.types'
import { AdminNotificationsSection } from './AdminNotificationsSection'

type ZonesSettingsQrSectionProps = Pick<
  AdminSidebarProps,
  | 'activeTab'
  | 'isDrawing'
  | 'setIsDrawing'
  | 'newZoneName'
  | 'setNewZoneName'
  | 'newZoneColor'
  | 'setNewZoneColor'
  | 'drawingPoints'
  | 'setDrawingPoints'
  | 'handleCreateZone'
  | 'serviceZones'
  | 'selectedZoneId'
  | 'setSelectedZoneId'
  | 'handleToggleZone'
  | 'handleDeleteZone'
  | 'pricing'
  | 'handlePricingChange'
  | 'qrSales'
  | 'hasLoadedQrSalesOnce'
  | 'drivers'
  | 'adminSession'
>

export function AdminSidebarZonesSettingsQrSection({
  activeTab,
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
  handlePricingChange,
  qrSales,
  hasLoadedQrSalesOnce,
  drivers,
  adminSession,
}: ZonesSettingsQrSectionProps) {
  const { t } = useTranslation()
  const initialZonesSettingsUi = getInitialZonesSettingsUi()
  const skipMainSyncRef = useRef(initialZonesSettingsUi.userInfoMainDraft !== null)
  const skipProfileSyncRef = useRef(initialZonesSettingsUi.userInfoProfileDraft !== null)
  const [userInfoMainDraft, setUserInfoMainDraft] = useState<UserInfoTextI18n>(() =>
    (initialZonesSettingsUi.userInfoMainDraft as UserInfoTextI18n | null) ??
    normalizeUserInfoText(pricing.userInfoText),
  )
  const [userInfoProfileDraft, setUserInfoProfileDraft] = useState<UserInfoTextI18n>(
    () =>
      (initialZonesSettingsUi.userInfoProfileDraft as UserInfoTextI18n | null) ??
      normalizeUserInfoText(pricing.userInfoTextProfile),
  )

  const zonesSettingsUiPersistence = useMemo(
    () => ({
      userInfoMainDraft,
      userInfoProfileDraft,
    }),
    [userInfoMainDraft, userInfoProfileDraft],
  )
  usePersistAdminUiSlice('zonesSettings', zonesSettingsUiPersistence)

  useEffect(() => {
    if (skipMainSyncRef.current) {
      skipMainSyncRef.current = false
      return
    }
    setUserInfoMainDraft(normalizeUserInfoText(pricing.userInfoText))
  }, [pricing.userInfoText])

  useEffect(() => {
    if (skipProfileSyncRef.current) {
      skipProfileSyncRef.current = false
      return
    }
    setUserInfoProfileDraft(normalizeUserInfoText(pricing.userInfoTextProfile))
  }, [pricing.userInfoTextProfile])

  if (activeTab === 'zones') {
    return (
      <div className="space-y-3">
        {isDrawing && (
          <div className="rounded-card border-[1.5px] border-black p-4 space-y-3 bg-surface/50">
            <p className="text-sm font-bold">{t('admin.zones.newZone')}</p>
            <input
              value={newZoneName}
              onChange={(event) => setNewZoneName(event.target.value)}
              placeholder={t('admin.zones.zoneNamePlaceholder')}
              className={inputCls}
            />
            <div>
              <p className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-1.5">
                {t('admin.zones.color')}
              </p>
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
              <span className="text-muted">{t('admin.zones.mapPoints')}</span>
              <span className="font-bold">{drawingPoints.length}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setDrawingPoints((prev) => prev.slice(0, -1))}
                disabled={drawingPoints.length === 0}
                className="py-2 rounded-xl bg-surface text-xs font-semibold disabled:opacity-50 transition-all active:scale-[0.97]"
              >
                {t('admin.zones.undoPoint')}
              </button>
              <button
                onClick={() => {
                  setIsDrawing(false)
                  setDrawingPoints(() => [])
                }}
                className="py-2 rounded-xl bg-surface text-xs font-semibold transition-all active:scale-[0.97]"
              >
                {t('common.cancel')}
              </button>
            </div>
            <button
              onClick={() => void handleCreateZone()}
              disabled={drawingPoints.length < 3 || !newZoneName.trim()}
              className="w-full py-2.5 bg-black text-white rounded-xl text-sm font-bold disabled:opacity-50 transition-all active:scale-[0.97]"
            >
              {t('admin.zones.saveZone')}
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
                  <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: zone.color }} />
                  <span className="text-sm font-bold flex-1 truncate">{zone.name}</span>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-pill flex-shrink-0 ${
                      zone.isActive ? 'bg-accent/15 text-accent-dark' : 'bg-surface text-muted'
                    }`}
                  >
                    {zone.isActive ? t('common.active') : t('common.inactive')}
                  </span>
                </div>
              </button>
              {selected && (
                <div className="flex gap-2 px-3.5 pb-3.5 border-t border-border pt-3">
                  <button
                    onClick={() => void handleToggleZone(zone)}
                    className="flex-1 py-2 rounded-xl bg-surface text-xs font-semibold hover:bg-border transition-colors"
                  >
                    {zone.isActive ? t('common.disable') : t('common.enable')}
                  </button>
                  <InlineConfirm
                    label={t('common.delete')}
                    confirmLabel={t('common.confirmDelete')}
                    onConfirm={() => void handleDeleteZone(zone.id)}
                    className="flex-1 !text-xs !py-2"
                  />
                </div>
              )}
            </div>
          )
        })}

        {serviceZones.length === 0 && !isDrawing && (
          <p className="text-xs text-muted text-center py-12">{t('admin.zones.empty')}</p>
        )}
      </div>
    )
  }

  if (activeTab === 'settings') {
    const displayRideEur =
      pricing.pricingMode === 'dynamic'
        ? t('admin.settings.byRoute')
        : `€${((pricing.pointsPerRide * pricing.pointPriceCents) / 100).toFixed(2)}`

    const canSendNotifications = adminSession.role === 'chief_admin' || adminSession.role === 'admin'

    return (
      <div className="space-y-4">
        <AdminNotificationsSection drivers={drivers} canSend={canSendNotifications} />
        <AdminDynamicPricingSection pricing={pricing} onPricingChange={handlePricingChange} />

        <div className="rounded-card border-[1.5px] border-border p-4 space-y-3">
          <div>
            <label className="block text-sm font-bold mb-1">{t('admin.settings.pointPrice')}</label>
            <p className="text-[11px] text-muted mb-2">{t('admin.settings.pointPriceHint')}</p>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">€</span>
              <input
                type="number"
                min={0.01}
                step={0.01}
                value={(pricing.pointPriceCents / 100).toFixed(2)}
                onChange={(event) => {
                  const euro = parseFloat(event.target.value)
                  if (!Number.isNaN(euro) && euro > 0) {
                    void handlePricingChange({ pointPriceCents: Math.round(euro * 100) })
                  }
                }}
                className={`${inputCls} pl-7`}
              />
            </div>
          </div>
        </div>

        <div className="rounded-card border-[1.5px] border-border p-4 space-y-3">
          <p className="text-sm font-bold">{t('admin.settings.userInfo')}</p>
          <p className="text-[11px] text-muted">{t('admin.settings.userInfoHint')}</p>
          <div className="space-y-4">
            <div className="rounded-xl border border-border p-3 space-y-3">
              <p className="text-xs font-bold">{t('admin.settings.userInfoMain', { defaultValue: 'Main screen info' })}</p>
              <p className="text-[11px] text-muted">{t('admin.settings.userInfoMainHint', { defaultValue: 'Shown on the main passenger screen.' })}</p>
              {SUPPORTED_LANGUAGES.map((lang) => (
                <div key={`main-${lang}`} className="space-y-1.5">
                  <label className="block text-[10px] font-semibold text-muted uppercase tracking-wider">
                    {t(`language.${lang}`)}
                  </label>
                  <textarea
                    value={userInfoMainDraft[lang]}
                    onChange={(event) =>
                      setUserInfoMainDraft((prev) => ({
                        ...prev,
                        [lang]: event.target.value,
                      }))
                    }
                    rows={3}
                    placeholder={t(`admin.settings.userInfoPlaceholder.${lang}`)}
                    className={`${inputCls} resize-y min-h-[72px]`}
                  />
                </div>
              ))}
            </div>
            <div className="rounded-xl border border-border p-3 space-y-3">
              <p className="text-xs font-bold">{t('admin.settings.userInfoProfile', { defaultValue: 'Profile screen info' })}</p>
              <p className="text-[11px] text-muted">{t('admin.settings.userInfoProfileHint', { defaultValue: 'Shown in passenger profile.' })}</p>
              {SUPPORTED_LANGUAGES.map((lang) => (
                <div key={`profile-${lang}`} className="space-y-1.5">
                  <label className="block text-[10px] font-semibold text-muted uppercase tracking-wider">
                    {t(`language.${lang}`)}
                  </label>
                  <textarea
                    value={userInfoProfileDraft[lang]}
                    onChange={(event) =>
                      setUserInfoProfileDraft((prev) => ({
                        ...prev,
                        [lang]: event.target.value,
                      }))
                    }
                    rows={3}
                    placeholder={t(`admin.settings.userInfoPlaceholder.${lang}`)}
                    className={`${inputCls} resize-y min-h-[72px]`}
                  />
                </div>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-end gap-3">
            <button
              onClick={() => void handlePricingChange({
                userInfoText: normalizeUserInfoText(userInfoMainDraft),
                userInfoTextProfile: normalizeUserInfoText(userInfoProfileDraft),
              })}
              disabled={
                userInfoTextEqual(userInfoMainDraft, normalizeUserInfoText(pricing.userInfoText))
                && userInfoTextEqual(userInfoProfileDraft, normalizeUserInfoText(pricing.userInfoTextProfile))
              }
              className="px-3 py-2 rounded-xl bg-black text-white text-xs font-bold disabled:opacity-50 transition-all active:scale-[0.97]"
            >
              {t('common.save')}
            </button>
          </div>
        </div>

        <div className="rounded-card border-[1.5px] border-border p-4 space-y-3">
          <p className="text-sm font-bold">{t('admin.settings.workHours')}</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-semibold text-muted uppercase tracking-wider mb-1.5">
                {t('admin.settings.workStart')}
              </label>
              <input
                type="time"
                value={pricing.workStartTime}
                onChange={(event) => void handlePricingChange({ workStartTime: event.target.value })}
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-muted uppercase tracking-wider mb-1.5">
                {t('admin.settings.workEnd')}
              </label>
              <input
                type="time"
                value={pricing.workEndTime}
                onChange={(event) => void handlePricingChange({ workEndTime: event.target.value })}
                className={inputCls}
              />
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-muted uppercase tracking-wider mb-1.5">
              {t('admin.settings.slotInterval')}
            </label>
            <select
              value={pricing.slotIntervalMinutes}
              onChange={(event) => void handlePricingChange({ slotIntervalMinutes: parseInt(event.target.value, 10) })}
              className={inputCls}
            >
              {[15, 30, 45, 60].map((v) => (
                <option key={v} value={v}>
                  {t('admin.settings.slotIntervalOption', { value: v })}
                </option>
              ))}
            </select>
          </div>
          <p className="text-[11px] text-muted">
            {t('admin.settings.slotsHint', {
              start: pricing.workStartTime,
              next: (() => {
                const [h, m] = pricing.workStartTime.split(':').map(Number)
                const next = h * 60 + m + pricing.slotIntervalMinutes
                return `${String(Math.floor(next / 60)).padStart(2, '0')}:${String(next % 60).padStart(2, '0')}`
              })(),
              end: pricing.workEndTime,
            })}
          </p>
        </div>

        <div className="rounded-card bg-black text-white p-5 space-y-3">
          <p className="text-xs font-semibold text-white/60 uppercase tracking-wider">
            {t('admin.settings.currentSystem')}
          </p>
          <div className="flex items-center justify-between text-sm">
            <span className="text-white/70">{t('admin.settings.onePoint')}</span>
            <span className="font-semibold">€{(pricing.pointPriceCents / 100).toFixed(2)}</span>
          </div>
          <div className="h-px bg-white/15" />
          <div className="flex items-center justify-between">
            <span className="text-sm text-white/70">
              {pricing.pricingMode === 'dynamic'
                ? t('admin.settings.ridePrice')
                : t('admin.settings.approxEur')}
            </span>
            <span className="text-2xl font-extrabold text-accent">{displayRideEur}</span>
          </div>
        </div>
      </div>
    )
  }

  if (activeTab !== 'qrSales') {
    return null
  }

  if (!hasLoadedQrSalesOnce) {
    return (
      <div className="space-y-3">
        <div className="rounded-card bg-black/95 p-4 flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton width={100} height={10} className="!bg-white/15" />
            <Skeleton width={120} height={24} className="!bg-white/15" />
          </div>
          <div className="space-y-2 items-end flex flex-col">
            <Skeleton width={110} height={10} className="!bg-white/15" />
            <Skeleton width={80} height={18} className="!bg-white/15" />
          </div>
        </div>
        {[0, 1, 2].map((index) => (
          <div key={index} className="rounded-card border-[1.5px] border-border p-3.5 bg-white space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-2 min-w-0 flex-1">
                <Skeleton width="55%" height={14} />
                <Skeleton width="35%" height={11} />
              </div>
              <Skeleton width={72} height={18} />
            </div>
            <div className="flex items-center justify-between gap-3 pt-2 border-t border-border">
              <Skeleton width="45%" height={11} />
              <Skeleton width={84} height={11} />
            </div>
          </div>
        ))}
      </div>
    )
  }

  const totalEur = qrSales.reduce((sum, sale) => sum + sale.eurAmount, 0)
  const totalPoints = qrSales.reduce((sum, sale) => sum + sale.pointsAmount, 0)

  return (
    <div className="space-y-3">
      {qrSales.length > 0 && (
        <div className="rounded-card bg-black text-white p-4 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-white/60">
              {t('admin.qrSales.totalReceived')}
            </p>
            <p className="text-2xl font-extrabold mt-0.5">€{totalEur.toFixed(2)}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-white/60">
              {t('admin.qrSales.pointsIssued')}
            </p>
            <p className="text-lg font-bold mt-0.5">{totalPoints} pts</p>
          </div>
        </div>
      )}

      {qrSales.map((sale) => {
        const passengerLabel = sale.username?.trim() || t('passenger.passengerLabel')
        const driverFallback = t('admin.qrSales.driverLabel').replace(/:\s*$/, '')
        const driverLabel = sale.driverName?.trim() || driverFallback
        const when = sale.redeemedAt ? formatPaymentDate(sale.redeemedAt) : null

        return (
          <div key={sale.saleId} className="rounded-card border-[1.5px] border-border p-3.5 bg-white space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-bold truncate">{passengerLabel}</p>
                <p className="text-[11px] text-muted mt-0.5">
                  {t('admin.qrSales.boughtPoints', { count: sale.pointsAmount })}
                </p>
              </div>
              <p className="text-base font-extrabold whitespace-nowrap">€{sale.eurAmount.toFixed(2)}</p>
            </div>

            <div className="flex items-center justify-between gap-3 pt-2 border-t border-border">
              <p className="text-[11px] text-muted truncate">
                <span className="text-muted">{t('admin.qrSales.driverLabel')} </span>
                <span className="font-semibold text-black/80">{driverLabel}</span>
              </p>
              {when && <p className="text-[11px] text-muted whitespace-nowrap">{when}</p>}
            </div>
          </div>
        )
      })}

      {qrSales.length === 0 && (
        <p className="text-xs text-muted text-center py-12">{t('admin.qrSales.empty')}</p>
      )}
    </div>
  )
}

function formatPaymentDate(iso: string): string {
  const date = new Date(iso)
  const now = new Date()
  const sameYear = date.getFullYear() === now.getFullYear()
  const datePart = formatDate(date, sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' })
  const timePart = formatTime(date, { hour: '2-digit', minute: '2-digit' })
  return `${datePart}, ${timePart}`
}
