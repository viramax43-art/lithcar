import type { AppNotification } from '../../types'

/**
 * Куда вести пассажира по тапу на уведомление.
 *
 * Уведомления о поездке содержат `rideId`; для сообщений группового чата
 * добавляем `?chat=1`, чтобы карточка поездки сразу открыла чат внутри
 * мини-приложения (а не отправляла человека в Telegram).
 */
export function passengerNotificationTarget(notification: AppNotification): string | null {
  const payload = notification.payload
  if (!payload || typeof payload !== 'object') return null
  const rideId = (payload as Record<string, unknown>).rideId
  if (typeof rideId !== 'string' || !rideId) return null
  const isChatMessage = (payload as Record<string, unknown>).event === 'chat_message'
  return `/requests/${encodeURIComponent(rideId)}${isChatMessage ? '?chat=1' : ''}`
}
