import { CaretRight } from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'
import type { RoutePointPickerModel } from './types'

interface RoutePointConfirmButtonProps {
  model: RoutePointPickerModel
  showCaret?: boolean
}

export default function RoutePointConfirmButton({ model, showCaret = true }: RoutePointConfirmButtonProps) {
  const { t } = useTranslation()

  if (!model.isPinLive) return null

  const pointASetupHint = t('passenger.pointASetupHint', { defaultValue: 'Enter, adjust and confirm the address' })
  const pointBSetupHint = t('passenger.pointBSetupHint', { defaultValue: 'Enter, adjust and confirm the destination' })
  const activeSetupHint = model.activeIsFrom ? pointASetupHint : pointBSetupHint

  const label = model.pinReadyForConfirm
    ? model.activeIsFrom
      ? t('passenger.confirmPointA', { defaultValue: 'Confirm point A' })
      : t('passenger.confirmPointB', { defaultValue: 'Confirm point B' })
    : activeSetupHint

  return (
    <button
      type="button"
      onClick={model.confirmPoint}
      disabled={!model.pinReadyForConfirm}
      className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all text-center leading-snug ${
        model.pinReadyForConfirm ? 'bg-black text-white active:scale-[0.97]' : 'bg-surface text-muted cursor-not-allowed'
      }`}
    >
      {label}
      {showCaret && <CaretRight size={14} weight="bold" className="flex-shrink-0" />}
    </button>
  )
}
