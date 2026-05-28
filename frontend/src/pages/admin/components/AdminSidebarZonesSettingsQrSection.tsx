import { useEffect, useState } from 'react'

import { ZONE_COLORS } from '../constants'
import InlineConfirm from './InlineConfirm'
import { inputCls } from './AdminSidebarShared'
import Skeleton from '../../../components/Skeleton'
import type { AdminSidebarProps } from './AdminSidebar.types'

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
}: ZonesSettingsQrSectionProps) {
  const [userInfoDraft, setUserInfoDraft] = useState(pricing.userInfoText ?? '')

  useEffect(() => {
    setUserInfoDraft(pricing.userInfoText ?? '')
  }, [pricing.userInfoText])

  if (activeTab === 'zones') {
    return (
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
                  <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: zone.color }} />
                  <span className="text-sm font-bold flex-1 truncate">{zone.name}</span>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-pill flex-shrink-0 ${
                      zone.isActive ? 'bg-accent/15 text-accent-dark' : 'bg-surface text-muted'
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
    )
  }

  if (activeTab === 'settings') {
    return (
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
              onChange={(event) => {
                const v = parseInt(event.target.value, 10)
                if (!Number.isNaN(v) && v >= 1) void handlePricingChange({ pointPriceCents: v })
              }}
              className={inputCls}
            />
          </div>
        </div>

        <div className="rounded-card border-[1.5px] border-border p-4 space-y-3">
          <p className="text-sm font-bold">Информация для пользователей</p>
          <textarea
            value={userInfoDraft}
            onChange={(event) => setUserInfoDraft(event.target.value)}
            rows={4}
            placeholder="Например: Сегодня возможны задержки из-за погоды..."
            className={`${inputCls} resize-y min-h-[92px]`}
          />
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] text-muted">
              Этот текст будет показан пассажирам в приложении.
            </p>
            <button
              onClick={() => void handlePricingChange({ userInfoText: userInfoDraft.trim() })}
              disabled={userInfoDraft.trim() === (pricing.userInfoText ?? '').trim()}
              className="px-3 py-2 rounded-xl bg-black text-white text-xs font-bold disabled:opacity-50 transition-all active:scale-[0.97]"
            >
              Сохранить
            </button>
          </div>
        </div>

        <div className="rounded-card border-[1.5px] border-border p-4 space-y-3">
          <p className="text-sm font-bold">Рабочие часы и слоты</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-semibold text-muted uppercase tracking-wider mb-1.5">Начало</label>
              <input
                type="time"
                value={pricing.workStartTime}
                onChange={(event) => void handlePricingChange({ workStartTime: event.target.value })}
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-muted uppercase tracking-wider mb-1.5">Конец</label>
              <input
                type="time"
                value={pricing.workEndTime}
                onChange={(event) => void handlePricingChange({ workEndTime: event.target.value })}
                className={inputCls}
              />
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-muted uppercase tracking-wider mb-1.5">Интервал слотов (мин)</label>
            <select
              value={pricing.slotIntervalMinutes}
              onChange={(event) => void handlePricingChange({ slotIntervalMinutes: parseInt(event.target.value, 10) })}
              className={inputCls}
            >
              {[15, 30, 45, 60].map((v) => (
                <option key={v} value={v}>{v} мин</option>
              ))}
            </select>
          </div>
          <p className="text-[11px] text-muted">
            Пассажиры смогут выбирать время поездки только из слотов: {pricing.workStartTime}, {(() => {
              const [h, m] = pricing.workStartTime.split(':').map(Number)
              const next = h * 60 + m + pricing.slotIntervalMinutes
              return `${String(Math.floor(next / 60)).padStart(2, '0')}:${String(next % 60).padStart(2, '0')}`
            })()}, … до {pricing.workEndTime}
          </p>
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
            <p className="text-[10px] font-semibold uppercase tracking-wider text-white/60">Всего получено</p>
            <p className="text-2xl font-extrabold mt-0.5">€{totalEur.toFixed(2)}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-white/60">Поинтов выдано</p>
            <p className="text-lg font-bold mt-0.5">{totalPoints} pts</p>
          </div>
        </div>
      )}

      {qrSales.map((sale) => {
        const passengerLabel = sale.username?.trim() || 'Пассажир'
        const driverLabel = sale.driverName?.trim() || 'Водитель'
        const when = sale.redeemedAt ? formatPaymentDate(sale.redeemedAt) : null

        return (
          <div key={sale.saleId} className="rounded-card border-[1.5px] border-border p-3.5 bg-white space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-bold truncate">{passengerLabel}</p>
                <p className="text-[11px] text-muted mt-0.5">купил {sale.pointsAmount} pts</p>
              </div>
              <p className="text-base font-extrabold whitespace-nowrap">€{sale.eurAmount.toFixed(2)}</p>
            </div>

            <div className="flex items-center justify-between gap-3 pt-2 border-t border-border">
              <p className="text-[11px] text-muted truncate">
                <span className="text-muted">Водитель: </span>
                <span className="font-semibold text-black/80">{driverLabel}</span>
              </p>
              {when && <p className="text-[11px] text-muted whitespace-nowrap">{when}</p>}
            </div>
          </div>
        )
      })}

      {qrSales.length === 0 && (
        <p className="text-xs text-muted text-center py-12">Платежей пока нет</p>
      )}
    </div>
  )
}

function formatPaymentDate(iso: string): string {
  const date = new Date(iso)
  const now = new Date()
  const sameYear = date.getFullYear() === now.getFullYear()
  const datePart = date.toLocaleDateString('ru-RU', sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' })
  const timePart = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  return `${datePart}, ${timePart}`
}
