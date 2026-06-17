import type { CSSProperties } from 'react'
import { Gear, SteeringWheel } from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'

export type CabinetRole = 'driver' | 'admin'

/** Default banner content height (px). */
export const CABINET_ROLE_BANNER_BODY_HEIGHT = 44

/** Large banner content height for admin (px). */
export const CABINET_ROLE_BANNER_BODY_HEIGHT_LARGE = 60

type SafeAreaToken = 'user' | 'app'

interface CabinetRoleBannerProps {
  role: CabinetRole
  /** `strip` — full-width bar with safe area; `inline` — bar inside an existing header */
  variant?: 'strip' | 'inline'
  safeArea?: SafeAreaToken
  size?: 'default' | 'large'
  className?: string
}

function safeAreaStyle(token: SafeAreaToken): CSSProperties | undefined {
  if (token === 'user') {
    return { paddingTop: 'var(--app-user-safe-top)' }
  }
  return { paddingTop: 'var(--app-safe-area-top-total)' }
}

export default function CabinetRoleBanner({
  role,
  variant = 'strip',
  safeArea = 'app',
  size = 'default',
  className = '',
}: CabinetRoleBannerProps) {
  const { t } = useTranslation()
  const isAdmin = role === 'admin'
  const label = isAdmin
    ? t('admin.panel', { defaultValue: 'Admin panel' })
    : t('driver.cabinet', { defaultValue: 'Driver cabinet' })
  const Icon = isAdmin ? Gear : SteeringWheel
  const shellClass = isAdmin ? 'bg-zinc-900 text-white' : 'bg-black text-white'
  const bodyHeight = size === 'large' ? CABINET_ROLE_BANNER_BODY_HEIGHT_LARGE : CABINET_ROLE_BANNER_BODY_HEIGHT
  const iconSize = size === 'large' ? 26 : 20
  const textClass = size === 'large'
    ? 'text-lg md:text-xl font-extrabold tracking-tight leading-none'
    : 'text-base font-extrabold tracking-tight leading-none'

  const content = (
    <div
      className={`flex items-center justify-center gap-3 px-4 ${shellClass} ${className}`}
      style={{ minHeight: bodyHeight }}
    >
      <Icon size={iconSize} weight="fill" className="flex-shrink-0" />
      <span className={textClass}>{label}</span>
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
