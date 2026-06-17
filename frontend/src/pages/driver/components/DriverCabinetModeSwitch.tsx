import { useTranslation } from 'react-i18next'
import { CABINET_ROLE_BANNER_BODY_HEIGHT } from '../../../components/CabinetRoleBanner'

export type DriverCabinetMode = 'my' | 'available'

interface DriverCabinetModeSwitchProps {
  mode: DriverCabinetMode
  availableRideCount: number
  onChange: (mode: DriverCabinetMode) => void
}

export default function DriverCabinetModeSwitch({
  mode,
  availableRideCount,
  onChange,
}: DriverCabinetModeSwitchProps) {
  const { t } = useTranslation()

  const btnCls = (active: boolean) =>
    `flex-1 min-h-12 rounded-xl text-xs font-bold transition-colors touch-none ${
      active ? 'bg-black text-white' : 'text-muted hover:bg-surface'
    }`

  return (
    <div
      className="absolute left-3 right-3 z-[12] bg-white rounded-card shadow-card p-1 flex gap-1 md:max-w-md md:mx-auto"
      style={{ top: `calc(var(--app-safe-area-top-total) + ${CABINET_ROLE_BANNER_BODY_HEIGHT + 64}px)` }}
    >
      <button type="button" className={btnCls(mode === 'my')} onClick={() => onChange('my')}>
        {t('driver.cabinetMode.my', { defaultValue: 'My rides' })}
      </button>
      <button
        type="button"
        className={`${btnCls(mode === 'available')} inline-flex items-center justify-center gap-1.5`}
        onClick={() => onChange('available')}
      >
        <span>{t('driver.cabinetMode.available', { defaultValue: 'Available' })}</span>
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
