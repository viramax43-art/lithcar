import { useEffect, useState } from 'react'
import { X } from '@phosphor-icons/react'

import type { Driver } from '../../../types'

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
  }) => Promise<void>
}

const inputCls =
  'w-full px-3 py-2.5 rounded-xl border-[1.5px] border-border bg-surface text-sm outline-none focus:border-black focus:bg-white transition-colors'

export default function EditDriverModal({ driver, onClose, onSubmit }: EditDriverModalProps) {
  const [name, setName] = useState(driver.name)
  const [carBrand, setCarBrand] = useState(driver.carBrand ?? '')
  const [carModel, setCarModel] = useState(driver.carModel)
  const [carPlate, setCarPlate] = useState(driver.carPlate)
  const [vehicleColor, setVehicleColor] = useState(driver.vehicleColor ?? '')
  const [seatsCount, setSeatsCount] = useState(driver.seatsCount ?? 4)
  const [about, setAbout] = useState(driver.about ?? '')
  const [canSellPoints, setCanSellPoints] = useState(Boolean(driver.canSellPoints))
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
      })
      onClose()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[2000] p-4" onClick={onClose}>
      <div className="bg-white rounded-card shadow-card w-full max-w-md max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
          <div>
            <h2 className="text-base font-bold">Редактировать водителя</h2>
            <p className="text-xs text-muted mt-0.5">{driver.keyPrefix}…</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-surface rounded-xl transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted">Имя</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted">Марка</label>
              <input value={carBrand} onChange={(e) => setCarBrand(e.target.value)} className={inputCls} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted">Модель</label>
              <input value={carModel} onChange={(e) => setCarModel(e.target.value)} className={inputCls} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted">Номер</label>
              <input value={carPlate} onChange={(e) => setCarPlate(e.target.value)} className={inputCls} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted">Цвет</label>
              <input value={vehicleColor} onChange={(e) => setVehicleColor(e.target.value)} className={inputCls} />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted">Мест</label>
            <input
              type="number"
              min={1}
              max={12}
              value={seatsCount}
              onChange={(e) => setSeatsCount(Number(e.target.value) || 1)}
              className={inputCls}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted">О водителе</label>
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
            <span className="text-xs font-semibold">Разрешить продажу поинтов через QR</span>
          </label>
        </div>

        <div className="flex gap-3 px-5 py-4 border-t border-border flex-shrink-0">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-surface text-sm font-semibold transition-all active:scale-[0.97]">
            Отмена
          </button>
          <button
            onClick={() => void handleSubmit()}
            disabled={submitting}
            className="flex-1 py-2.5 rounded-xl bg-black text-white text-sm font-bold transition-all active:scale-[0.97] disabled:opacity-50"
          >
            {submitting ? 'Сохраняем…' : 'Сохранить'}
          </button>
        </div>
      </div>
    </div>
  )
}
