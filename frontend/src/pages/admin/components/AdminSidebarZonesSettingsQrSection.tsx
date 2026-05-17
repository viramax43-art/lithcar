import { ZONE_COLORS } from '../constants'
import InlineConfirm from './InlineConfirm'
import { inputCls } from './AdminSidebarShared'
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
}: ZonesSettingsQrSectionProps) {
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
    )
  }

  if (activeTab !== 'qrSales') {
    return null
  }

  return (
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
            Погашен: {sale.redeemedAt ? new Date(sale.redeemedAt).toLocaleString('ru-RU') : 'нет'} · пользователь:{' '}
            {sale.username || sale.userId || '—'}
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
      {qrSales.length === 0 && <p className="text-xs text-muted text-center py-12">QR-операций пока нет</p>}
    </div>
  )
}
