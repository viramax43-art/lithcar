import type { AppNotification } from '../../types'

export interface RideCompletionPrompt {
  rideId: string
}

/**
 * Уведомление-вопрос «Поездка состоялась?».
 *
 * Возвращает id поездки только для тех карточек, где нужны кнопки [Да]/[Нет]:
 * водитель начал поездку и не нажал «Завершил», а ответа ещё нет. Как только ответ
 * отправлен, карточка помечается прочитанной и кнопки исчезают (в приложении и в Telegram).
 */
export function rideCompletionPrompt(item: AppNotification): RideCompletionPrompt | null {
  if (item.type !== 'ride_completion_check' || item.readAt) return null
  const payload = (item.payload ?? {}) as Record<string, unknown>
  const rideId = payload.rideId
  if (typeof rideId !== 'string' || rideId.length === 0) return null
  return { rideId }
}
