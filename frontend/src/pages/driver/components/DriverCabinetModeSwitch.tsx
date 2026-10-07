import { Plus } from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'
import { CABINET_ROLE_BANNER_BODY_HEIGHT } from '../../../components/CabinetRoleBanner'

export type DriverCabinetMode = 'my' | 'available'

interface DriverCabinetModeSwitchProps {
  mode: DriverCabinetMode
  availableRideCount: number
  onChange: (mode: DriverCabinetMode) => void
  /** Opens the "add a trip / set direction" flow. */
  onAddTrip: () => void
}

/**
 * Top action row on the driver map: a primary "add trip" button on the left and
 * the "available passengers" mode toggle on the right. The "my rides" entry
 * lives in the header status pill, so the driver can always switch back.
 */
export default function DriverCabinetModeSwitch({
  mode,
  availableRideCount,
  onChange,
  onAddTrip,
}: DriverCabinetModeSwitchProps) {
  const { t } = useTranslation()

  return (
    <div
      className="absolute left-3 right-3 z-[12] bg-white rounded-card shadow-card p-1 flex gap-1 md:max-w-md md:mx-auto"
      style={{ top: `calc(var(--app-safe-area-top-total) + ${CABINET_ROLE_BANNER_BODY_HEIGHT + 64}px)` }}
    >
      <button
        type="button"
        onClick={onAddTrip}
        className="flex-1 min-h-12 rounded-xl text-xs font-bold transition-colors touch-none bg-black text-white inline-flex items-center justify-center gap-1.5 active:scale-[0.98]"
      >
        <Plus size={16} weight="bold" />
        {t('driver.addTrip', { defaultValue: 'Добавить поездку' })}
      </button>
      <button
        type="button"
        className={`flex-1 min-h-12 rounded-xl text-xs font-bold transition-colors touch-none inline-flex items-center justify-center gap-1.5 ${
          mode === 'available' ? 'bg-black text-white' : 'text-muted hover:bg-surface'
        }`}
        onClick={() => onChange('available')}
      >
        <span>{t('driver.cabinetMode.availablePassengers', { defaultValue: 'Доступные попутчики' })}</span>
        {availableRideCount > 0 && (
          <span
            className={`inline-flex min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-extrabold items-center justify-center ${
              mode === 'available' ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-800'
            }`}
          >
            {availableRideCount}
          </span>
        )}
      </button>
    </div>
  )
}
