import { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

export default function DriverMagicLogin() {
  const { token } = useParams<{ token: string }>()
  const { t } = useTranslation()

  useEffect(() => {
    if (!token) return
    window.location.replace(`/api/driver/session/enter/${encodeURIComponent(token)}`)
  }, [token])

  return (
    <div
      className="min-h-[100dvh] flex items-center justify-center bg-white px-6"
      style={{
        paddingTop: 'var(--app-user-safe-top)',
        paddingBottom: 'var(--app-user-safe-bottom)',
      }}
    >
      <p className="text-sm text-muted text-center">
        {t('driver.magicLogin.redirecting', { defaultValue: 'Signing you in…' })}
      </p>
    </div>
  )
}
