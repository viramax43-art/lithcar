import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowUUpLeft, Clock, HandWaving, Prohibit, UserMinus } from '@phosphor-icons/react'

import type { RideFlowState } from '../../types'
import { hapticSelection } from '../../lib/telegram'
import RideChatButton from '../ride-chat/RideChatButton'
import InlineConfirm from '../../pages/admin/components/InlineConfirm'
import type { DriverFlowAction } from './DriverRideFlowActions'
import { formatCountdown, useCountdown } from './useRideFlow'

interface DriverRideActionsRowProps {
  rideId: string
  flow: RideFlowState | null
  isBusy?: boolean
  onAction: (action: DriverFlowAction, comment?: string) => void | Promise<void>
}

/**
 * Компактный ряд действий водителя в карточке точки: чат, откат, неявка, отмена.
 *
 * Основная кнопка шага живёт в самой карточке (она крупная и понятная),
 * а здесь — то, что может понадобиться «по ситуации», включая защиту от ошибок:
 * откат ошибочной отметки и оформление неявки строго после минимального ожидания.
 */
export default function DriverRideActionsRow({
  rideId,
  flow,
  isBusy = false,
  onAction,
}: DriverRideActionsRowProps) {
  const { t } = useTranslation()
  const [showCancel, setShowCancel] = useState(false)
  const [showNoShowConfirm, setShowNoShowConfirm] = useState(false)
  const [comment, setComment] = useState('')
  const undoLeft = useCountdown(flow?.undoSecondsLeft)
  const noShowLeft = useCountdown(flow?.noShowSecondsLeft)
  const startLeft = useCountdown(flow?.startAvailableInSeconds)
  const autoNoShowLeft = useCountdown(
    flow?.autoNoShowAt
      ? Math.max(0, Math.floor((new Date(flow.autoNoShowAt).getTime() - Date.now()) / 1000))
      : 0,
  )

  if (!flow) return null

  const waitingMinutes = flow.arrivedAt ? Math.max(0, Math.floor((flow.waitingSeconds ?? 0) / 60)) : 0

  return (
    <div className="px-4 pb-3 space-y-2">
      {flow.passengerReady && (
        <p className="text-[11px] font-bold text-green-700 flex items-center gap-1.5">
          <HandWaving size={13} weight="fill" />
          {t('driver.passengerReady', { defaultValue: 'Пассажир отметил, что уже на месте' })}
        </p>
      )}

      {flow.arrivedAt && (
        <p className="text-[11px] text-muted flex items-center gap-1.5">
          <Clock size={12} weight="bold" />
          {t('driver.waitingFor', {
            minutes: waitingMinutes,
            defaultValue: `Ждём пассажира ${waitingMinutes} мин`,
          })}
        </p>
      )}

      {flow.status === 'awaiting_passenger' && autoNoShowLeft > 0 && (
        <p className="text-[11px] text-amber-700 flex items-center gap-1.5">
          <Clock size={12} weight="bold" />
          {t('driver.autoNoShowIn', {
            time: formatCountdown(autoNoShowLeft),
            defaultValue: `Автонеявка через ${formatCountdown(autoNoShowLeft)}`,
          })}
        </p>
      )}

      {flow.status === 'awaiting_passenger' && startLeft > 0 && (
        <p className="text-[11px] text-sky-700 flex items-center gap-1.5">
          <Clock size={12} weight="bold" />
          {t('driver.startAvailableIn', {
            time: formatCountdown(startLeft),
            defaultValue: `Старт будет доступен через ${formatCountdown(startLeft)}`,
          })}
        </p>
      )}

      <div className="flex items-center gap-2">
        <div className="w-12">
          <RideChatButton rideId={rideId} role="driver" variant="light" />
        </div>
        {flow.canUndo && (
          <button
            type="button"
            disabled={isBusy || undoLeft <= 0}
            onClick={() => {
              hapticSelection()
              void onAction('undo')
            }}
            className="flex-1 min-h-[40px] rounded-card bg-surface text-[11px] font-bold text-black/80 inline-flex items-center justify-center gap-1.5 active:scale-[0.98] disabled:opacity-50"
          >
            <ArrowUUpLeft size={14} weight="bold" />
            {t('driver.undoStatus', {
              time: formatCountdown(undoLeft),
              defaultValue: `Поправить (${formatCountdown(undoLeft)})`,
            })}
          </button>
        )}
        {flow.canReportNoShow ? (
          <button
            type="button"
            disabled={isBusy}
            onClick={() => {
              hapticSelection()
              setShowNoShowConfirm(true)
            }}
            className="flex-1 min-h-[40px] rounded-card bg-amber-50 text-[11px] font-bold text-amber-700 inline-flex items-center justify-center gap-1.5 active:scale-[0.98] disabled:opacity-50"
          >
            <UserMinus size={14} weight="fill" />
            {t('driver.reportNoShow', { defaultValue: 'Пассажир не вышел' })}
          </button>
        ) : (
          noShowLeft > 0 &&
          flow.status === 'awaiting_passenger' && (
            <p className="flex-1 text-[11px] text-muted text-center">
              {t('driver.noShowAvailableIn', {
                time: formatCountdown(noShowLeft),
                defaultValue: `Неявку можно оформить через ${formatCountdown(noShowLeft)}`,
              })}
            </p>
          )
        )}
      </div>

      {showNoShowConfirm && (
        <div className="rounded-card bg-amber-50 border border-amber-200 p-3 space-y-2">
          <p className="text-[11px] font-semibold text-amber-900">
            {t('driver.noShowConfirmHint', {
              defaultValue:
                'Пассажир действительно не вышел? Поездка закроется, часть стоимости удержится как компенсация за ожидание.',
            })}
          </p>
          <InlineConfirm
            label={t('driver.reportNoShow', { defaultValue: 'Пассажир не вышел' })}
            confirmLabel={t('driver.noShowConfirm', { defaultValue: 'Да, оформить неявку' })}
            onConfirm={() => {
              setShowNoShowConfirm(false)
              void onAction('no_show')
            }}
          />
          <button
            type="button"
            onClick={() => setShowNoShowConfirm(false)}
            className="w-full min-h-[32px] text-[11px] text-muted"
          >
            {t('common.cancel', { defaultValue: 'Назад' })}
          </button>
        </div>
      )}

      {flow.canExtendWait && !showNoShowConfirm && (
        <button
          type="button"
          disabled={isBusy}
          onClick={() => {
            hapticSelection()
            void onAction('extend_wait')
          }}
          className="w-full min-h-[36px] rounded-card bg-surface text-[11px] font-semibold text-black/70 inline-flex items-center justify-center gap-1.5 active:scale-[0.98] disabled:opacity-50"
        >
          <Clock size={13} weight="bold" />
          {t('driver.extendWait', { defaultValue: 'Продлить ожидание' })}
        </button>
      )}

      {flow.canCancel && !showCancel && (
        <button
          type="button"
          onClick={() => setShowCancel(true)}
          className="w-full min-h-[36px] text-[11px] font-semibold text-red-600 inline-flex items-center justify-center gap-1.5"
        >
          <Prohibit size={13} weight="bold" />
          {t('driver.cancelRide', { defaultValue: 'Отменить поездку' })}
        </button>
      )}

      {showCancel && (
        <div className="rounded-card border border-border/70 p-3 space-y-2">
          <p className="text-[11px] text-muted">
            {t('driver.cancelReasonHint', {
              defaultValue: 'Коротко напишите причину — пассажир увидит её в приложении.',
            })}
          </p>
          <textarea
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            rows={2}
            maxLength={500}
            placeholder={t('driver.cancelComment', { defaultValue: 'Причина (необязательно)' })}
            className="w-full rounded-card border border-border/70 px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <InlineConfirm
            label={t('driver.cancelRide', { defaultValue: 'Отменить поездку' })}
            confirmLabel={t('driver.cancelConfirm', { defaultValue: 'Да, отменить' })}
            onConfirm={() => void onAction('cancel', comment.trim() || undefined)}
          />
          <button
            type="button"
            onClick={() => setShowCancel(false)}
            className="w-full min-h-[32px] text-[11px] text-muted"
          >
            {t('common.cancel', { defaultValue: 'Назад' })}
          </button>
        </div>
      )}
    </div>
  )
}