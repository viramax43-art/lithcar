import type { CSSProperties } from 'react'
import { SteeringWheel } from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'

/** Content height below the safe-area inset (px). */
export const CABINET_ROLE_BANNER_BODY_HEIGHT = 44

type SafeAreaToken = 'user' | 'app'

interface CabinetRoleBannerProps {
  /** `strip` — full-width bar with safe area; `inline` — bar inside an existing header */
  variant?: 'strip' | 'inline'
  safeArea?: SafeAreaToken
  className?: string
}

function safeAreaStyle(token: SafeAreaToken): CSSProperties | undefined {
  if (token === 'user') {
    return { paddingTop: 'var(--app-user-safe-top)' }
  }
  return { paddingTop: 'var(--app-safe-area-top-total)' }
}

export default function CabinetRoleBanner({
  variant = 'strip',
  safeArea = 'app',
  className = '',
}: CabinetRoleBannerProps) {
  const { t } = useTranslation()
  const label = t('driver.cabinet', { defaultValue: 'Driver cabinet' })

  const content = (
    <div
      className={`flex items-center justify-center gap-2.5 px-4 bg-black text-white ${className}`}
      style={{ minHeight: CABINET_ROLE_BANNER_BODY_HEIGHT }}
    >
      <SteeringWheel size={20} weight="fill" className="flex-shrink-0" />
      <span className="text-base font-extrabold tracking-tight leading-none">{label}</span>
    </div>
  )

  if (variant === 'inline') {
    return content
  }

  return (
    <div className="w-full" style={safeAreaStyle(safeArea)}>
      {content}
    </div>
  )
}
