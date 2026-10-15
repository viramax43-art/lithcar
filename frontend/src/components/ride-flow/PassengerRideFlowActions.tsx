import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Clock, HandWaving, Question, Warning } from '@phosphor-icons/react'

import type { RideFlowState } from '../../types'
import {
  cancelRideAsPassenger,
  confirmRideCompletion,
  markPassengerReady,
  nudgeDriver,
} from '../../infrastructure/api/rideChatApi'
import { hapticSelection } from '../../lib/telegram'
import InlineConfirm from '../../pages/admin/components/InlineConfirm'
import { formatCountdown, useCountdown } from './useRideFlow'

interface PassengerRideFlowActionsProps {
  rideId: string
  flow: RideFlowState | null
  onChanged: () => void | Promise<void>
}

/**
 * Действия пассажира по поездке: «Я на месте», «Где вы?» и отмена.
 *
 * Смысл блока — не оставить пассажира в дураках:
 * - «Я на месте» снимает риск неявки (водитель видит отметку сразу);
 * - «Где вы?» даёт мягкий пинг водителю с кулдауном вместо спама;
 * - при отмене пассажир заранее предупреждён, если она уже «поздняя».
 */
export default function PassengerRideFlowActions({
  rideId,
  flow,
  onChanged,
}: PassengerRideFlowActionsProps) {
  const { t } = useTranslation()
  const [isReady, setIsReady] = useState(false)
  const [isNudging, setIsNudging] = useState(false)
  const [isCancelling, setIsCancelling] = useState(false)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [cancelComment, setCancelComment] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  // Ответ на вопрос «Поездка состоялась?»: подтверждение и текст «что дальше».
  const [isAnsweringCompletion, setIsAnsweringCompletion] = useState(false)
  const [completionMessage, setCompletionMessage] = useState<string | null>(null)
  const nudgeLeft = useCountdown(flow?.nudgeSecondsLeft)
  const canNudge = Boolean(flow?.canNudgeDriver) && nudgeLeft <= 0

  if (!flow) return null

  const waitingMinutes = flow.arrivedAt ? Math.max(0, Math.floor((flow.waitingSeconds ?? 0) / 60)) : 0

  const handleReady = async () => {
    hapticSelection()
    setIsReady(true)
    setErrorMessage(null)
    try {
      await markPassengerReady(rideId)
      await onChanged()
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : t('rideFlow.readyFailed', { defaultValue: 'Не удалось отправить отметку.' }),
      )
    } finally {
      setIsReady(false)
    }
  }

  const handleNudge = async () => {
    hapticSelection()
    setIsNudging(true)
    setErrorMessage(null)
    try {
      await nudgeDriver(rideId)
      await onChanged()
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : t('rideFlow.nudgeFailed', { defaultValue: 'Не удалось отправить напоминание.' }),
      )
    } finally {
      setIsNudging(false)
    }
  }

  const handleCompletion = async (completed: boolean) => {
    hapticSelection()
    setIsAnsweringCompletion(true)
    setErrorMessage(null)
    try {
      await confirmRideCompletion(rideId, completed)
      setCompletionMessage(
        completed
          ? t('rideCompletion.confirmed', { defaultValue: 'Спасибо! Поездка закрыта.' })
          : t('rideCompletion.declined', {
              defaultValue: 'Спасибо за ответ. Ситуация передана администратору.',
            }),
      )
      await onChanged()
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : t('rideCompletion.failed', { defaultValue: 'Не удалось отправить ответ.' }),
      )
    } finally {
      setIsAnsweringCompletion(false)
    }
  }

  const handleCancel = async () => {
    setIsCancelling(true)
    setErrorMessage(null)
    try {
      await cancelRideAsPassenger(rideId, cancelComment.trim() || undefined)
      setShowCancelConfirm(false)
      setCancelComment('')
      await onChanged()
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : t('rideFlow.cancelFailed', { defaultValue: 'Не удалось отменить поездку.' }),
      )
    } finally {
      setIsCancelling(false)
    }
  }

  return (
    <section className="rounded-card bg-surface p-4 space-y-3">
      {/* «Поездка состоялась?»: водитель начал поездку и не нажал «Завершил». */}
      {flow.canConfirmCompletion && (
        <div className="rounded-card bg-amber-50 border border-amber-200 p-3 space-y-2">
          <p className="text-sm font-extrabold text-black flex items-center gap-1.5">
            <Warning size={15} weight="fill" className="text-amber-600" />
            {t('rideCompletion.question', { defaultValue: 'Поездка состоялась?' })}
          </p>
          <p className="text-xs text-black/70">
            {t('rideCompletion.hint', {
              minutes: Math.round(flow.expectedRideMinutes ?? 0),
              defaultValue: `Водитель не отметил завершение поездки (расчётное время в пути ≈${Math.round(
                flow.expectedRideMinutes ?? 0,
              )} мин). Ответьте, пожалуйста.`,
            })}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={isAnsweringCompletion}
              onClick={() => void handleCompletion(true)}
              className="flex-1 min-h-[44px] px-3 rounded-card bg-green-600 text-white text-sm font-bold active:scale-[0.98] disabled:opacity-60"
            >
              {t('rideCompletion.yes', { defaultValue: 'Да, состоялась' })}
            </button>
            <button
              type="button"
              disabled={isAnsweringCompletion}
              onClick={() => void handleCompletion(false)}
              className="flex-1 min-h-[44px] px-3 rounded-card bg-white border border-red-200 text-red-600 text-sm font-bold active:scale-[0.98] disabled:opacity-60"
            >
              {t('rideCompletion.no', { defaultValue: 'Нет, не состоялась' })}
            </button>
          </div>
          {completionMessage && <p className="text-xs text-green-700">{completionMessage}</p>}
        </div>
      )}

      {flow.arrivedAt && (
        <p className="text-xs font-semibold text-black/80 flex items-center gap-1.5">
          <Clock size={13} weight="bold" />
          {t('rideFlow.driverWaiting', {
            minutes: waitingMinutes,
            defaultValue: `Водитель ждёт вас уже ${waitingMinutes} мин.`,
          })}
        </p>
      )}

      {flow.passengerReady && (
        <p className="text-xs font-semibold text-green-700">
          {t('rideFlow.readySent', { defaultValue: 'Вы отметили, что на месте. Водитель это видит.' })}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {flow.canMarkReady && !flow.passengerReady && (
          <button
            type="button"
            disabled={isReady}
            onClick={() => void handleReady()}
            className="flex-1 min-h-[44px] px-4 rounded-card bg-white border border-border/70 text-sm font-bold inline-flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-60"
          >
            <HandWaving size={16} weight="fill" />
            {t('rideFlow.imHere', { defaultValue: 'Я на месте' })}
          </button>
        )}
        {flow.canNudgeDriver && (
          <button
            type="button"
            disabled={!canNudge || isNudging}
            onClick={() => void handleNudge()}
            className="flex-1 min-h-[44px] px-4 rounded-card bg-white border border-border/70 text-sm font-bold inline-flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-60"
          >
            <Question size={16} weight="bold" />
            {canNudge
              ? t('rideFlow.whereAreYou', { defaultValue: 'Где вы?' })
              : t('rideFlow.nudgeWait', {
                  time: formatCountdown(nudgeLeft),
                  defaultValue: `Подождите ${formatCountdown(nudgeLeft)}`,
                })}
          </button>
        )}
      </div>

      {errorMessage && <p className="text-xs text-red-600">{errorMessage}</p>}

      {flow.canCancel && !showCancelConfirm && (
        <button
          type="button"
          onClick={() => setShowCancelConfirm(true)}
          className="w-full min-h-[44px] px-4 rounded-card bg-white border border-red-200 text-sm font-bold text-red-600 active:scale-[0.98]"
        >
          {t('rideFlow.cancelRide', { defaultValue: 'Отменить поездку' })}
        </button>
      )}

      {showCancelConfirm && (
        <div className="rounded-card bg-white border border-border/70 p-3 space-y-2">
          {flow.lateCancel && (
            <p className="text-xs text-amber-700 flex items-start gap-1.5">
              <Warning size={13} weight="fill" className="mt-0.5 flex-shrink-0" />
              {t('rideFlow.lateCancelWarning', {
                defaultValue:
                  'Водитель уже в пути: он потратит время впустую. Отменяйте, только если действительно не сможете поехать.',
              })}
            </p>
          )}
          <textarea
            value={cancelComment}
            onChange={(event) => setCancelComment(event.target.value)}
            rows={2}
            maxLength={500}
            placeholder={t('rideFlow.cancelComment', { defaultValue: 'Причина (необязательно)' })}
            className="w-full rounded-card border border-border/70 px-3 py-2 text-sm outline-none focus:border-accent"
          />
          {isCancelling ? (
            <p className="text-xs text-muted">
              {t('common.updating', { defaultValue: 'Обновляем...' })}
            </p>
          ) : (
            <InlineConfirm
              label={t('rideFlow.cancelRide', { defaultValue: 'Отменить поездку' })}
              confirmLabel={t('rideFlow.cancelConfirm', { defaultValue: 'Да, отменить' })}
              onConfirm={() => void handleCancel()}
            />
          )}
          <button
            type="button"
            onClick={() => setShowCancelConfirm(false)}
            className="w-full min-h-[36px] text-xs font-semibold text-muted"
          >
            {t('common.cancel', { defaultValue: 'Назад' })}
          </button>
        </div>
      )}
    </section>
  )
}