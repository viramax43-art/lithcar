import { Calendar, Car, CaretDown, CaretRight, Key, MapPin, PencilSimple, User, Users } from '@phosphor-icons/react'
import type { MutableRefObject } from 'react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { showOnMapHref } from '../../../lib/navigation'
import { formatDate } from '../../../i18n/dateTime'
import LithuanianPlate from '../../../components/LithuanianPlate'
import RatingBadge from '../../../components/RatingBadge'
import InlineConfirm from './InlineConfirm'
import { ColorSwatch, inputCls, KeyReveal, Section, type CopyState, Stat } from './AdminSidebarShared'
import type { AdminSidebarProps } from './AdminSidebar.types'

type DriversSectionProps = Pick<
  AdminSidebarProps,
  | 'activeTab'
  | 'drivers'
  | 'expandedDriverId'
  | 'setExpandedDriverId'
  | 'newDriverName'
  | 'setNewDriverName'
  | 'newDriverPhotoPreview'
  | 'setNewDriverPhotoFile'
  | 'setNewDriverPhotoPreview'
  | 'newDriverCarBrand'
  | 'setNewDriverCarBrand'
  | 'newDriverCarModel'
  | 'setNewDriverCarModel'
  | 'newDriverCarPlate'
  | 'setNewDriverCarPlate'
  | 'newDriverVehicleColor'
  | 'setNewDriverVehicleColor'
  | 'newDriverSeatsCount'
  | 'setNewDriverSeatsCount'
  | 'newDriverAbout'
  | 'setNewDriverAbout'
  | 'newDriverCanSellPoints'
  | 'setNewDriverCanSellPoints'
  | 'newDriverCanSelfAssign'
  | 'setNewDriverCanSelfAssign'
  | 'lastCreatedDriverKey'
  | 'rotatedDriverKeys'
  | 'handleCreateDriver'
  | 'handleRotateDriverKey'
  | 'handleDeleteDriver'
> & {
  showDriverForm: boolean
  setEditingDriver: (driver: AdminSidebarProps['drivers'][number]) => void
  copyState: CopyState
  copiedToken: string | null
  copyText: (value: string, token: string) => Promise<void>
  driverCardRefs: MutableRefObject<Record<string, HTMLDivElement | null>>
}

export function AdminSidebarDriversSection({
  activeTab,
  drivers,
  expandedDriverId,
  setExpandedDriverId,
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
  handleDeleteDriver,
  showDriverForm,
  setEditingDriver,
  copyState,
  copiedToken,
  copyText,
  driverCardRefs,
}: DriversSectionProps) {
  const { t } = useTranslation()
  const [isCreatingDriver, setIsCreatingDriver] = useState(false)

  if (activeTab !== 'drivers') {
    return null
  }

  return (
    <div className="space-y-3">
      {showDriverForm && (
        <div className="rounded-card border-[1.5px] border-black p-4 space-y-2.5 bg-surface/50">
          <p className="text-sm font-bold">{t('admin.drivers.newDriver')}</p>
          <input
            value={newDriverName}
            onChange={(event) => setNewDriverName(event.target.value)}
            placeholder={t('common.name')}
            className={inputCls}
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              value={newDriverCarBrand}
              onChange={(event) => setNewDriverCarBrand(event.target.value)}
              placeholder={t('common.brand')}
              className={inputCls}
            />
            <input
              value={newDriverCarModel}
              onChange={(event) => setNewDriverCarModel(event.target.value)}
              placeholder={t('common.model')}
              className={inputCls}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input
              value={newDriverCarPlate}
              onChange={(event) => setNewDriverCarPlate(event.target.value)}
              placeholder={t('common.plate')}
              className={inputCls}
            />
            <input
              value={newDriverVehicleColor}
              onChange={(event) => setNewDriverVehicleColor(event.target.value)}
              placeholder={t('common.color')}
              className={inputCls}
            />
          </div>
          <div className="grid grid-cols-2 gap-2 items-center">
            <label className="text-xs font-semibold text-muted">{t('admin.drivers.seatsInCar')}</label>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={12}
              value={newDriverSeatsCount}
              onChange={(event) => setNewDriverSeatsCount(Number(event.target.value) || 1)}
              className={inputCls}
            />
          </div>
          <textarea
            value={newDriverAbout}
            onChange={(event) => setNewDriverAbout(event.target.value)}
            placeholder={t('admin.drivers.aboutOptional')}
            className={`${inputCls} min-h-16 resize-none`}
          />
          <label className="flex items-center gap-2 rounded-xl border border-border bg-white px-3 py-2.5">
            <input
              type="checkbox"
              checked={newDriverCanSellPoints}
              onChange={(event) => setNewDriverCanSellPoints(event.target.checked)}
            />
            <span className="text-xs font-semibold">{t('admin.drivers.allowQrSales')}</span>
          </label>
          <label className="flex items-center gap-2 rounded-xl border border-border bg-white px-3 py-2.5">
            <input
              type="checkbox"
              checked={newDriverCanSelfAssign}
              onChange={(event) => setNewDriverCanSelfAssign(event.target.checked)}
            />
            <span className="text-xs font-semibold">{t('admin.drivers.allowSelfAssign')}</span>
          </label>
          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted">{t('admin.drivers.driverPhoto')}</label>
            <input
              type="file"
              accept="image/*"
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null
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
            onClick={() => {
              if (isCreatingDriver) return
              setIsCreatingDriver(true)
              void handleCreateDriver().finally(() => setIsCreatingDriver(false))
            }}
            disabled={isCreatingDriver}
            className="w-full py-2.5 rounded-xl bg-black text-white text-sm font-bold transition-all hover:bg-zinc-800 active:scale-[0.97] disabled:opacity-60"
          >
            {isCreatingDriver ? t('common.saving') : t('admin.drivers.createDriver')}
          </button>
          {lastCreatedDriverKey && (
            <KeyReveal
              title={t('admin.drivers.driverKeyOnce')}
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
          ? formatDate(new Date(driver.createdAt), {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })
          : null

        return (
          <div
            key={driver.id}
            ref={(element) => {
              driverCardRefs.current[driver.id] = element
            }}
            className={`rounded-card border-[1.5px] overflow-hidden transition-all ${
              expanded ? 'border-black shadow-card' : 'border-border'
            }`}
          >
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
                <RatingBadge rating={driver.rating} size="sm" />
                <p className="text-xs text-muted truncate mt-0.5">
                  {[driver.carBrand, driver.carModel].filter(Boolean).join(' ')} · {driver.carPlate}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] font-bold text-accent-dark">
                    {driver.canSellPoints ? t('admin.drivers.qrSalesOn') : t('admin.drivers.qrSalesOff')}
                  </span>
                  <span className="text-border">·</span>
                  <span className="text-[10px] font-bold text-amber-700">
                    {driver.canSelfAssign ? t('admin.drivers.selfAssignOn') : t('admin.drivers.selfAssignOff')}
                  </span>
                  <span className="text-border">·</span>
                  <span
                    className={`text-[10px] font-semibold ${driver.isOnline ? 'text-accent-dark' : 'text-muted'}`}
                  >
                    {driver.isOnline ? t('common.online') : t('common.offline')}
                  </span>
                </div>
              </div>
              <div className="p-1 text-muted flex-shrink-0">
                {expanded ? <CaretDown size={16} weight="bold" /> : <CaretRight size={16} weight="bold" />}
              </div>
            </button>

            {expanded && (
              <div className="border-t border-border">
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
                        <p className="text-base font-extrabold text-white truncate drop-shadow">{driver.name}</p>
                        {driver.isOnline && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-pill bg-accent/90 text-black text-[9px] font-bold uppercase tracking-wider">
                            <span className="w-1 h-1 rounded-full bg-black animate-pulse" />
                            Live
                          </span>
                        )}
                      </div>
                      <RatingBadge rating={driver.rating} variant="dark" size="sm" />
                      <p className="text-[11px] text-white/80 mt-0.5">
                        {[driver.carBrand, driver.carModel].filter(Boolean).join(' ')}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 divide-x divide-border border-b border-border bg-white">
                  <Stat
                    icon={<Key size={14} className="text-accent-dark" />}
                    value={driver.canSellPoints ? t('common.yes') : t('common.no')}
                    label={t('admin.drivers.qrSalesLabel')}
                  />
                  <Stat
                    icon={<MapPin size={14} className="text-amber-600" />}
                    value={driver.canSelfAssign ? t('common.yes') : t('common.no')}
                    label={t('admin.drivers.selfAssignLabel')}
                  />
                </div>
                <div className="grid grid-cols-1 border-b border-border bg-white">
                  <Stat
                    icon={<Users size={14} className="text-zinc-700" />}
                    value={String(driver.seatsCount ?? '—')}
                    label={t('common.seats')}
                  />
                </div>

                <div className="p-4 space-y-4 bg-surface/40">
                  <Section title={t('admin.drivers.vehicle')}>
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
                            {driver.vehicleColor || '—'} ·{' '}
                            {driver.seatsCount != null
                              ? t('admin.drivers.seatsCount', { count: driver.seatsCount })
                              : '—'}
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

                  <Section title={t('admin.drivers.key')}>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-white border border-border">
                        <div className="w-8 h-8 rounded-xl bg-amber-50 flex items-center justify-center flex-shrink-0">
                          <Key size={13} className="text-amber-700" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] font-semibold text-muted uppercase tracking-wider">
                            {t('admin.drivers.key')}
                          </p>
                          <p className="text-xs font-mono font-semibold truncate">{driver.keyPrefix}…</p>
                        </div>
                        {/* Rotation lives in the action row below («New key») — no duplicate button here */}
                      </div>
                    </div>
                  </Section>

                  {driver.about && (
                    <Section title={t('admin.drivers.aboutSection')}>
                      <p className="text-xs leading-relaxed bg-white border border-border rounded-xl p-3">
                        {driver.about}
                      </p>
                    </Section>
                  )}

                  {driver.isOnline && driver.currentLocation && (
                    <Section title={t('admin.drivers.geolocation')}>
                      <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-white border border-border">
                        <div className="w-8 h-8 rounded-xl bg-accent/10 flex items-center justify-center flex-shrink-0">
                          <MapPin size={13} className="text-accent-dark" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] font-semibold text-muted uppercase tracking-wider">
                            {t('admin.drivers.currentCoords')}
                          </p>
                          <p className="text-xs font-mono truncate">
                            {driver.currentLocation.lat.toFixed(6)}, {driver.currentLocation.lng.toFixed(6)}
                          </p>
                        </div>
                        <a
                          href={showOnMapHref(driver.currentLocation, driver.name)}
                          target="_blank"
                          rel="noreferrer"
                          className="min-h-[36px] inline-flex items-center text-[10px] font-bold px-3 py-2 rounded-pill bg-accent/15 hover:bg-accent/25 text-accent-dark transition-colors flex-shrink-0"
                          title={t('driver.openInNavigator')}
                        >
                          {t('common.open')}
                        </a>
                      </div>
                    </Section>
                  )}

                  {createdDate && (
                    <div className="flex items-center gap-2 text-[11px] text-muted pt-2 border-t border-border">
                      <Calendar size={11} />
                      <span>{t('common.registered', { date: createdDate })}</span>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2 pt-3 border-t border-border">
                    <button
                      onClick={() => setEditingDriver(driver)}
                      className="min-h-[36px] inline-flex items-center gap-1.5 text-xs font-semibold px-3.5 py-2 rounded-pill bg-black text-white hover:bg-zinc-800 transition-colors"
                    >
                      <PencilSimple size={12} /> {t('common.edit')}
                    </button>
                    <button
                      onClick={() => void handleRotateDriverKey(driver.id)}
                      className="min-h-[36px] inline-flex items-center gap-1.5 text-xs font-semibold px-3.5 py-2 rounded-pill bg-white border border-border hover:bg-surface transition-colors"
                    >
                      <Key size={12} /> {t('common.newKey')}
                    </button>
                    <InlineConfirm
                      label={t('common.delete')}
                      confirmLabel={t('common.confirmDelete')}
                      onConfirm={() => void handleDeleteDriver(driver.id)}
                      className="ml-auto !text-xs"
                    />
                  </div>

                  {rotatedDriverKeys[driver.id] && (
                    <KeyReveal
                      title={t('admin.drivers.newDriverKey')}
                      value={rotatedDriverKeys[driver.id]}
                      onCopy={() => void copyText(rotatedDriverKeys[driver.id], `driver:${driver.id}`)}
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
        <p className="text-xs text-muted text-center py-12">{t('admin.drivers.empty')}</p>
      )}
    </div>
  )
}
