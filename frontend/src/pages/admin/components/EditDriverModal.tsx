import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { Driver } from '../../../types'
import AdminModalShell from './AdminModalShell'

interface EditDriverModalProps {
  driver: Driver
  onClose: () => void
  onSubmit: (payload: {
    name: string
    carBrand: string
    carModel: string
    carPlate: string
    vehicleColor: string
    seatsCount: number
    about: string
    isOnline: boolean
    canSellPoints: boolean
    canSelfAssign: boolean
  }) => Promise<void>
}

const inputCls =
  'w-full px-3 py-2.5 rounded-xl border-[1.5px] border-border bg-surface text-sm outline-none focus:border-black focus:bg-white transition-colors'

export default function EditDriverModal({ driver, onClose, onSubmit }: EditDriverModalProps) {
  const { t } = useTranslation()
  const [name, setName] = useState(driver.name)
  const [carBrand, setCarBrand] = useState(driver.carBrand ?? '')
  const [carModel, setCarModel] = useState(driver.carModel)
  const [carPlate, setCarPlate] = useState(driver.carPlate)
  const [vehicleColor, setVehicleColor] = useState(driver.vehicleColor ?? '')
  const [seatsCount, setSeatsCount] = useState(driver.seatsCount ?? 4)
  const [about, setAbout] = useState(driver.about ?? '')
  const [canSellPoints, setCanSellPoints] = useState(Boolean(driver.canSellPoints))
  const [canSelfAssign, setCanSelfAssign] = useState(Boolean(driver.canSelfAssign))
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const handleSubmit = async () => {
    if (!name.trim() || !carBrand.trim() || !carModel.trim() || !carPlate.trim()) return
    setSubmitting(true)
    try {
      await onSubmit({
        name: name.trim(),
        carBrand: carBrand.trim(),
        carModel: carModel.trim(),
        carPlate: carPlate.trim(),
        vehicleColor: vehicleColor.trim() || 'Unknown',
        seatsCount,
        about: about.trim(),
        isOnline: driver.isOnline,
        canSellPoints,
        canSelfAssign,
      })
      onClose()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AdminModalShell
      onClose={onClose}
      title={t('admin.editDriver.title')}
      subtitle={`${driver.keyPrefix}…`}
      maxWidthClass="max-w-md"
    >
      <form
        className="flex flex-col flex-1 min-h-0"
        onSubmit={(event) => {
          event.preventDefault()
          void handleSubmit()
        }}
      >
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 min-h-0">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted">{t('common.name')}</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted">{t('common.brand')}</label>
              <input value={carBrand} onChange={(e) => setCarBrand(e.target.value)} className={inputCls} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted">{t('common.model')}</label>
              <input value={carModel} onChange={(e) => setCarModel(e.target.value)} className={inputCls} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted">{t('common.plate')}</label>
              <input value={carPlate} onChange={(e) => setCarPlate(e.target.value)} className={inputCls} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted">{t('common.color')}</label>
              <input value={vehicleColor} onChange={(e) => setVehicleColor(e.target.value)} className={inputCls} />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted">{t('common.seats')}</label>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={12}
              value={seatsCount}
              onChange={(e) => setSeatsCount(Number(e.target.value) || 1)}
              className={inputCls}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted">{t('common.about')}</label>
            <textarea
              value={about}
              onChange={(e) => setAbout(e.target.value)}
              className={`${inputCls} min-h-24 resize-none`}
            />
          </div>
          <label className="flex items-center gap-2 rounded-xl border border-border bg-white px-3 py-2.5">
            <input
              type="checkbox"
              checked={canSellPoints}
              onChange={(e) => setCanSellPoints(e.target.checked)}
            />
            <span className="text-xs font-semibold">{t('admin.drivers.allowQrSales')}</span>
          </label>
          <label className="flex items-center gap-2 rounded-xl border border-border bg-white px-3 py-2.5">
            <input
              type="checkbox"
              checked={canSelfAssign}
              onChange={(e) => setCanSelfAssign(e.target.checked)}
            />
            <span className="text-xs font-semibold">{t('admin.drivers.allowSelfAssign')}</span>
          </label>
        </div>

        <div
          className="flex gap-3 px-5 py-4 border-t border-border flex-shrink-0"
          style={{ paddingBottom: 'max(1rem, var(--app-safe-area-bottom-total, 0px))' }}
        >
          <button type="button" onClick={onClose} className="flex-1 min-h-[44px] py-2.5 rounded-xl bg-surface hover:bg-border text-sm font-semibold transition-all active:scale-[0.97]">
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="flex-1 min-h-[44px] py-2.5 rounded-xl bg-black text-white text-sm font-bold transition-all hover:bg-zinc-800 active:scale-[0.97] disabled:opacity-50"
          >
            {submitting ? t('common.saving') : t('common.save')}
          </button>
        </div>
      </form>
    </AdminModalShell>
  )
}
