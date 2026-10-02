/**
 * Native-camera QR landing page.
 * Passenger QR encodes this URL; driver opens it in system browser / Telegram
 * without granting Mini App camera permission.
 */
import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { CheckCircle, WarningCircle } from '@phosphor-icons/react'

import { getDriverSession, redeemPassengerQrSale } from '../../lib/backend'
import { ApiError } from '../../infrastructure/http/httpClient'
import { hapticNotification } from '../../lib/telegram'
import CabinetRoleBanner from '../../components/CabinetRoleBanner'

type RedeemState = 'idle' | 'loading' | 'success' | 'error' | 'need_login'

export default function DriverQrRedeem() {
  const { token = '' } = useParams<{ token: string }>()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [state, setState] = useState<RedeemState>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const [pointsAdded, setPointsAdded] = useState<number | null>(null)

  const redeem = useCallback(async () => {
    if (!token.trim()) {
      setState('error')
      setMessage(t('driver.qrInvalidToken', { defaultValue: 'Некорректный QR-код.' }))
      return
    }
    setState('loading')
    setMessage(null)
    try {
      await getDriverSession()
      const result = await redeemPassengerQrSale(token.trim())
      hapticNotification('success')
      setPointsAdded(result.pointsAdded)
      setMessage(
        t('driver.qrPointsCredited', {
          points: result.pointsAdded,
          passengerId: result.passengerId,
          defaultValue: `Зачислено ${result.pointsAdded} поинтов пассажиру (${result.passengerId}).`,
        }),
      )
      setState('success')
    } catch (error) {
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        setState('need_login')
        return
      }
      hapticNotification('error')
      setState('error')
      setMessage(error instanceof Error ? error.message : t('errors.processQrFailed', { defaultValue: 'Не удалось обработать QR.' }))
    }
  }, [t, token])

  useEffect(() => {
    void redeem()
  }, [redeem])

  return (
    <div className="min-h-[100dvh] bg-white flex flex-col">
      <CabinetRoleBanner variant="strip" safeArea="app" />
      <div className="flex-1 flex flex-col items-center justify-center px-6 gap-4 text-center">
        {state === 'loading' || state === 'idle' ? (
          <p className="text-sm text-muted">{t('driver.confirmingQr', { defaultValue: 'Подтверждаем QR…' })}</p>
        ) : null}

        {state === 'success' && (
          <>
            <CheckCircle size={48} weight="fill" className="text-accent" />
            <p className="text-base font-bold">{t('driver.qrSuccess', { defaultValue: 'Поинты зачислены' })}</p>
            {pointsAdded != null && (
              <p className="text-2xl font-extrabold">+{pointsAdded}</p>
            )}
            {message && <p className="text-xs text-muted max-w-sm">{message}</p>}
          </>
        )}

        {state === 'error' && (
          <>
            <WarningCircle size={48} weight="fill" className="text-red-500" />
            <p className="text-base font-bold">{t('common.error', { defaultValue: 'Ошибка' })}</p>
            {message && <p className="text-xs text-red-600 max-w-sm">{message}</p>}
            <button
              type="button"
              onClick={() => void redeem()}
              className="mt-2 px-5 py-2.5 rounded-xl bg-black text-white text-sm font-bold"
            >
              {t('common.retry', { defaultValue: 'Повторить' })}
            </button>
          </>
        )}

        {state === 'need_login' && (
          <>
            <WarningCircle size={48} weight="fill" className="text-amber-500" />
            <p className="text-base font-bold">
              {t('driver.qrNeedLogin', { defaultValue: 'Войдите как водитель, чтобы зачислить поинты' })}
            </p>
            <button
              type="button"
              onClick={() => navigate(`/driver?qr=${encodeURIComponent(token)}`)}
              className="mt-2 px-5 py-2.5 rounded-xl bg-black text-white text-sm font-bold"
            >
              {t('driver.goToCabinet', { defaultValue: 'В кабинет водителя' })}
            </button>
          </>
        )}

        <button
          type="button"
          onClick={() => navigate('/driver')}
          className="mt-4 text-xs font-semibold text-muted underline"
        >
          {t('driver.backToCabinet', { defaultValue: 'Вернуться в кабинет' })}
        </button>
      </div>
    </div>
  )
}
