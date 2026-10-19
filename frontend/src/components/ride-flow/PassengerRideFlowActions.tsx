import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircle, Clock, HandWaving, Question, Warning } from '@phosphor-icons/react'

import type { RideFlowState } from '../../types'
import {
  cancelRideAsPassenger,
  confirmRideCompletion,
  disputeRideStart,
  markPassengerBoarded,
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
  const [isBoarding, setIsBoarding] = useState(false)
  const [isNudging, setIsNudging] = useState(false)
  const [isCancelling, setIsCancelling] = useState(false)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [cancelComment, setCancelComment] = useState('')
  const [showDisputeConfirm, setShowDisputeConfirm] = useState(false)
  const [disputeComment, setDisputeComment] = useState('')
  const [isDisputing, setIsDisputing] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [flowNotice, setFlowNotice] = useState<string | null>(null)
  // Ответ на вопрос «Поездка состоялась?»: подтверждение и текст «что дальше».
  const [isAnsweringCompletion, setIsAnsweringCompletion] = useState(false)
  const [completionMessage, setCompletionMessage] = useState<string | null>(null)
  const nudgeLeft = useCountdown(flow?.nudgeSecondsLeft)
  const disputeLeft = useCountdown(flow?.disputeSecondsLeft)
  const canNudge = Boolean(flow?.canNudgeDriver) && nudgeLeft <= 0

  // Окно оспаривания закрылось — убираем и уже открытую форму подтверждения,
  // чтобы она не позволяла отправить запоздалый спор.
  useEffect(() => {
    if (!flow?.canDisputeStart || disputeLeft <= 0) {
      setShowDisputeConfirm(false)
    }
  }, [flow?.canDisputeStart, disputeLeft])

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

  const handleBoarded = async () => {
    hapticSelection()
    setIsBoarding(true)
    setErrorMessage(null)
    setFlowNotice(null)
    try {
      await markPassengerBoarded(rideId)
      setFlowNotice(t('rideFlow.boardedSent', { defaultValue: 'Посадка подтверждена. Водитель может начинать поездку.' }))
      await onChanged()
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : t('rideFlow.boardFailed', { defaultValue: 'Не удалось подтвердить посадку.' }),
      )
    } finally {
      setIsBoarding(false)
    }
  }

  const handleDisputeStart = async () => {
    hapticSelection()
    setIsDisputing(true)
    setErrorMessage(null)
    try {
      await disputeRideStart(rideId, disputeComment.trim() || undefined)
      setShowDisputeConfirm(false)
      setDisputeComment('')
      setFlowNotice(
        t('rideFlow.disputeSent', {
          defaultValue: 'Поездка отменена, баллы вернулись. Ситуацию проверит администратор.',
        }),
      )
      await onChanged()
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : t('rideFlow.disputeFailed', { defaultValue: 'Не удалось отправить заявку.' }),
      )
    } finally {
      setIsDisputing(false)
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
        {flow.canBoard && (
          <button
            type="button"
            disabled={isBoarding}
            onClick={() => void handleBoarded()}
            className="flex-1 min-h-[44px] px-4 rounded-card bg-green-50 border border-green-200 text-sm font-bold text-green-800 inline-flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-60"
          >
            <CheckCircle size={16} weight="fill" />
            {flow.status === 'in_progress'
              ? t('rideFlow.imInCar', { defaultValue: 'Я в машине' })
              : t('rideFlow.confirmBoarding', { defaultValue: 'Подтвердить посадку' })}
          </button>
        )}
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

      {flow.passengerBoarded && (
        <p className="text-xs font-semibold text-green-700 inline-flex items-center gap-1.5">
          <CheckCircle size={13} weight="fill" />
          {t('rideFlow.boardedSentShort', { defaultValue: 'Посадка подтверждена.' })}
        </p>
      )}

      {flowNotice && <p className="text-xs font-semibold text-green-700">{flowNotice}</p>}

      {(flow.refundedPoints ?? 0) > 0 && (
        <div className="rounded-card bg-green-50 border border-green-200 px-3 py-2.5">
          <p className="text-xs font-bold text-green-800">
            {t('rideFlow.refundedPoints', {
              points: flow.refundedPoints,
              defaultValue: `Возвращено ${flow.refundedPoints} баллов.`,
            })}
          </p>
          {(flow.driverCompensationPoints ?? 0) > 0 && (
            <p className="text-[11px] text-green-700 mt-0.5">
              {t('rideFlow.driverCompensation', {
                points: flow.driverCompensationPoints,
                defaultValue: `${flow.driverCompensationPoints} баллов — компенсация водителю за ожидание.`,
              })}
            </p>
          )}
        </div>
      )}

      {((flow.canDisputeStart && disputeLeft > 0) || showDisputeConfirm) && (
        <div className="rounded-card bg-amber-50 border border-amber-200 p-3 space-y-2">
          {!showDisputeConfirm ? (
            <>
              <p className="text-xs font-semibold text-amber-900">
                {t('rideFlow.notInCarQuestion', { defaultValue: 'Водитель начал поездку, но вы не в машине?' })}
              </p>
              <button
                type="button"
                onClick={() => setShowDisputeConfirm(true)}
                className="w-full min-h-[40px] rounded-card bg-white border border-amber-300 text-xs font-bold text-amber-800 active:scale-[0.98]"
              >
                {t('rideFlow.disputeStart', {
                  time: formatCountdown(disputeLeft),
                  defaultValue: `Поездка не начиналась (${formatCountdown(disputeLeft)})`,
                })}
              </button>
            </>
          ) : (
            <>
              <p className="text-xs text-amber-900">
                {t('rideFlow.disputeHint', {
                  defaultValue:
                    'Поездка будет отменена с полным возвратом баллов, а случай проверит администратор. Используйте, только если вы действительно не в машине.',
                })}
              </p>
              <textarea
                value={disputeComment}
                onChange={(event) => setDisputeComment(event.target.value)}
                rows={2}
                maxLength={500}
                placeholder={t('rideFlow.disputeComment', { defaultValue: 'Что произошло? (необязательно)' })}
                className="w-full rounded-card border border-amber-200 px-3 py-2 text-sm outline-none focus:border-amber-500"
              />
              {isDisputing ? (
                <p className="text-xs text-muted">{t('common.updating', { defaultValue: 'Обновляем...' })}</p>
              ) : (
                <InlineConfirm
                  label={t('rideFlow.disputeStartShort', { defaultValue: 'Поездка не начиналась' })}
                  confirmLabel={t('rideFlow.disputeConfirm', { defaultValue: 'Да, отменить и вернуть баллы' })}
                  onConfirm={() => void handleDisputeStart()}
                />
              )}
              <button
                type="button"
                onClick={() => setShowDisputeConfirm(false)}
                className="w-full min-h-[32px] text-xs font-semibold text-muted"
              >
                {t('common.cancel', { defaultValue: 'Назад' })}
              </button>
            </>
          )}
        </div>
      )}

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
            <div className="space-y-1">
              <p className="text-xs text-amber-700 flex items-start gap-1.5">
                <Warning size={13} weight="fill" className="mt-0.5 flex-shrink-0" />
                {t('rideFlow.lateCancelWarning', {
                  defaultValue:
                    'Водитель уже в пути: он потратит время впустую. Отменяйте, только если действительно не сможете поехать.',
                })}
              </p>
              {(flow.lateCancelFeePercent ?? 0) > 0 && (
                <p className="text-[11px] font-semibold text-amber-800">
                  {t('rideFlow.lateCancelFee', {
                    percent: flow.lateCancelFeePercent,
                    defaultValue: `Удержится ${flow.lateCancelFeePercent}% стоимости — компенсация водителю за ожидание.`,
                  })}
                </p>
              )}
            </div>
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