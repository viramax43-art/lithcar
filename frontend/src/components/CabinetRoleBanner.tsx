import type { CSSProperties } from 'react'
import { ShieldCheck, SteeringWheel, UserCircle } from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'

/** Content height below the safe-area inset (px). */
export const CABINET_ROLE_BANNER_BODY_HEIGHT = 44

type SafeAreaToken = 'user' | 'app' | 'none'

/** Cabinets the banner can label. Admin + moderator share the admin shell. */
export type CabinetRole = 'passenger' | 'driver' | 'admin' | 'moderator'

const ROLE_PRESENTATION: Record<
  CabinetRole,
  { background: string; labelKey: string; labelDefault: string; icon: typeof SteeringWheel }
> = {
  passenger: {
    background: 'bg-blue-600',
    labelKey: 'passenger.cabinet',
    labelDefault: 'Passenger cabinet',
    icon: UserCircle,
  },
  driver: {
    background: 'bg-emerald-600',
    labelKey: 'driver.cabinet',
    labelDefault: 'Driver cabinet',
    icon: SteeringWheel,
  },
  admin: {
    background: 'bg-indigo-700',
    labelKey: 'admin.panel',
    labelDefault: 'Admin panel',
    icon: ShieldCheck,
  },
  moderator: {
    background: 'bg-violet-700',
    labelKey: 'admin.panel',
    labelDefault: 'Admin panel',
    icon: ShieldCheck,
  },
}

interface CabinetRoleBannerProps {
  /** `strip` — full-width bar with safe area; `inline` — bar inside an existing header */
  variant?: 'strip' | 'inline'
  safeArea?: SafeAreaToken
  /** Cabinet role that colours the banner. Defaults to the driver cabinet. */
  role?: CabinetRole
  className?: string
}

function safeAreaStyle(token: SafeAreaToken): CSSProperties | undefined {
  if (token === 'none') {
    return undefined
  }
  if (token === 'user') {
    return { paddingTop: 'var(--app-user-safe-top)' }
  }
  return { paddingTop: 'var(--app-safe-area-top-total)' }
}

export default function CabinetRoleBanner({
  variant = 'strip',
  safeArea = 'app',
  role = 'driver',
  className = '',
}: CabinetRoleBannerProps) {
  const { t } = useTranslation()
  const presentation = ROLE_PRESENTATION[role]
  const label = t(presentation.labelKey, { defaultValue: presentation.labelDefault })
  const RoleIcon = presentation.icon

  const content = (
    <div
      className={`flex items-center justify-center gap-2.5 px-4 text-white ${presentation.background} ${className}`}
      style={{ minHeight: CABINET_ROLE_BANNER_BODY_HEIGHT }}
    >
      <RoleIcon size={20} weight="fill" className="flex-shrink-0" />
      <span className="text-base font-extrabold tracking-tight leading-none">{label}</span>
    </div>
  )

  if (variant === 'inline') {
    return content
  }

  return (
    <div className="w-full flex-shrink-0" style={safeAreaStyle(safeArea)}>
      {content}
    </div>
  )
}

