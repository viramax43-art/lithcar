import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ArrowUUpLeft,
  Clock,
  HandWaving,
  NavigationArrow,
  Play,
  Prohibit,
  UserMinus,
  FlagCheckered,
  Warning,
} from '@phosphor-icons/react'

import type { RideFlowState } from '../../types'
import { hapticSelection } from '../../lib/telegram'
import RideChatButton from '../ride-chat/RideChatButton'
import InlineConfirm from '../../pages/admin/components/InlineConfirm'
import { formatCountdown, useCountdown } from './useRideFlow'

export type DriverFlowAction =
  | 'en_route'
  | 'arrived'
  | 'start'
  | 'complete'
  | 'undo'
  | 'no_show'
  | 'cancel'
  | 'extend_wait'

interface DriverRideFlowActionsProps {
  rideId: string
  flow: RideFlowState | null
  isBusy: boolean
  onAction: (action: DriverFlowAction, comment?: string) => void | Promise<void>
}

/**
 * Действия водителя по поездке в правильном порядке.
 *
 * Панель строится по состоянию с сервера: показываем только то, что реально доступно,
 * с таймерами («неявка через 3:12», «откат 0:47») — так водитель не тыкает в пустые кнопки.
 */
export default function DriverRideFlowActions({
  rideId,
  flow,
  isBusy,
  onAction,
}: DriverRideFlowActionsProps) {
  const { t } = useTranslation()
  const [showCancelOptions, setShowCancelOptions] = useState(false)
  const [comment, setComment] = useState('')
  const undoLeft = useCountdown(flow?.undoSecondsLeft)
  const noShowLeft = useCountdown(flow?.noShowSecondsLeft)

  if (!flow) return null

  const waitingMinutes = flow.arrivedAt ? Math.max(0, Math.floor((flow.waitingSeconds ?? 0) / 60)) : 0

  const primary = (() => {
    if (flow.canEnRoute) {
      return {
        action: 'en_route' as DriverFlowAction,
        label: t('driver.cta.onTheWay', { defaultValue: 'Еду на точку' }),
        icon: <NavigationArrow size={18} weight="fill" />,
      }
    }
    if (flow.canArrived) {
      return {
        action: 'arrived' as DriverFlowAction,
        label: t('driver.cta.arrived', { defaultValue: 'Прибыл' }),
        icon: <FlagCheckered size={18} weight="fill" />,
      }
    }
    if (flow.canStart) {
      return {
        action: 'start' as DriverFlowAction,
        label: t('driver.cta.startRide', { defaultValue: 'Начать поездку' }),
        icon: <Play size={18} weight="fill" />,
      }
    }
    if (flow.canComplete) {
      return {
        action: 'complete' as DriverFlowAction,
        label: t('driver.cta.completeRide', { defaultValue: 'Завершить поездку' }),
        icon: <FlagCheckered size={18} weight="fill" />,
      }
    }
    return null
  })()

  return (
    <div className="px-4 pb-4 pt-1 space-y-2.5">
      {flow.passengerReady && (
        <p className="text-[11px] font-bold text-green-300 flex items-center gap-1.5">
          <HandWaving size={13} weight="fill" />
          {t('driver.passengerReady', {
            defaultValue: 'Пассажир отметил, что уже на месте',
          })}
        </p>
      )}

      {flow.arrivedAt && (
        <p className="text-[11px] text-white/80 flex items-center gap-1.5">
          <Clock size={12} weight="bold" />
          {t('driver.waitingFor', {
            minutes: waitingMinutes,
            defaultValue: `Ждём пассажира ${waitingMinutes} мин`,
          })}
        </p>
      )}

      {flow.requiresAdminAttention && (
        <p className="text-[11px] text-amber-300 flex items-start gap-1.5">
          <Warning size={12} weight="fill" className="mt-0.5 flex-shrink-0" />
          {t('driver.adminAttention', {
            defaultValue: 'Поездка под контролем администратора: обновите статус или свяжитесь с диспетчером.',
          })}
        </p>
      )}

      {primary ? (
        <button
          type="button"
          disabled={isBusy}
          onClick={() => {
            hapticSelection()
            void onAction(primary.action)
          }}
          className="w-full py-3.5 rounded-card bg-white text-black text-sm font-extrabold inline-flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed shadow-card"
        >
          {isBusy ? t('common.updating', { defaultValue: 'Обновляем...' }) : primary.label}
          {!isBusy && primary.icon}
        </button>
      ) : (
        flow.canEnRouteAt && (
          <p className="text-[11px] text-white/70 text-center">
            {t('driver.tooEarly', {
              time: new Date(flow.canEnRouteAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              }),
              defaultValue: 'Раньше отметку «Еду на точку» поставить нельзя — поездка ещё не скоро.',
            })}
          </p>
        )
      )}

      <div className="flex gap-2">
        <div className="flex-1">
          <RideChatButton rideId={rideId} role="driver" variant="dark" className="w-full h-10 rounded-card bg-white/10 hover:bg-white/20 text-white flex items-center justify-center active:scale-[0.98] transition-transform relative" />
        </div>
        {flow.canUndo && (
          <button
            type="button"
            disabled={isBusy || undoLeft <= 0}
            onClick={() => {
              hapticSelection()
              void onAction('undo')
            }}
            className="flex-1 min-h-[40px] px-3 rounded-card bg-white/10 hover:bg-white/20 text-white text-[11px] font-bold inline-flex items-center justify-center gap-1.5 active:scale-[0.98] disabled:opacity-50"
          >
            <ArrowUUpLeft size={14} weight="bold" />
            {t('driver.undoStatus', { time: formatCountdown(undoLeft), defaultValue: `Поправить (${formatCountdown(undoLeft)})` })}
          </button>
        )}
      </div>

      {flow.canExtendWait && (
        <button
          type="button"
          disabled={isBusy}
          onClick={() => {
            hapticSelection()
            void onAction('extend_wait')
          }}
          className="w-full min-h-[36px] rounded-card bg-white/10 hover:bg-white/20 text-[11px] font-bold text-white inline-flex items-center justify-center gap-1.5 active:scale-[0.98] disabled:opacity-50"
        >
          <Clock size={13} weight="bold" />
          {t('driver.extendWait', { defaultValue: 'Продлить ожидание' })}
        </button>
      )}

      {flow.canReportNoShow && (
        <button
          type="button"
          disabled={isBusy}
          onClick={() => {
            hapticSelection()
            void onAction('no_show')
          }}
          className="w-full min-h-[40px] rounded-card bg-amber-500/15 text-amber-200 text-xs font-bold inline-flex items-center justify-center gap-1.5 active:scale-[0.98] disabled:opacity-50"
        >
          <UserMinus size={14} weight="fill" />
          {t('driver.reportNoShow', {
            defaultValue: 'Пассажир не вышел',
          })}
        </button>
      )}

      {flow.canReportNoShow === false && flow.status === 'awaiting_passenger' && noShowLeft > 0 && (
        <p className="text-[11px] text-white/60 text-center">
          {t('driver.noShowAvailableIn', {
            time: formatCountdown(noShowLeft),
            defaultValue: `Неявку можно оформить через ${formatCountdown(noShowLeft)}`,
          })}
        </p>
      )}

      {flow.canCancel && !showCancelOptions && (
        <button
          type="button"
          onClick={() => setShowCancelOptions(true)}
          className="w-full min-h-[36px] text-[11px] font-semibold text-red-300 inline-flex items-center justify-center gap-1.5"
        >
          <Prohibit size={13} weight="bold" />
          {t('driver.cancelRide', { defaultValue: 'Отменить поездку' })}
        </button>
      )}

      {showCancelOptions && (
        <div className="rounded-card bg-white/10 p-3 space-y-2">
          <p className="text-[11px] text-white/80">
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
            className="w-full rounded-card bg-black/30 border border-white/20 px-3 py-2 text-sm text-white outline-none placeholder:text-white/40"
          />
          <InlineConfirm
            label={t('driver.cancelRide', { defaultValue: 'Отменить поездку' })}
            confirmLabel={t('driver.cancelConfirm', { defaultValue: 'Да, отменить' })}
            onConfirm={() => void onAction('cancel', comment.trim() || undefined)}
          />
          <button
            type="button"
            onClick={() => setShowCancelOptions(false)}
            className="w-full min-h-[32px] text-[11px] text-white/60"
          >
            {t('common.cancel', { defaultValue: 'Назад' })}
          </button>
        </div>
      )}
    </div>
  )
}