import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { normalizeLanguage } from '../../i18n/languages'
import {
  getAdminUnreadCount,
  getDriverUnreadCount,
  getPassengerUnreadCount,
  listAdminNotifications,
  listDriverNotifications,
  listPassengerNotifications,
  markAdminNotificationRead,
  markAllAdminNotificationsRead,
  markAllDriverNotificationsRead,
  markAllPassengerNotificationsRead,
  markDriverNotificationRead,
  markPassengerNotificationRead,
} from '../../infrastructure/api/notificationsApi'
import { RideFlowError, confirmRideCompletion } from '../../infrastructure/api/rideChatApi'
import type { AppNotification, NotificationPool } from '../../types'
import { rideCompletionPrompt } from './rideCompletionPrompt'

const DEFAULT_POLL_MS = 20_000

interface UseNotificationsOptions {
  pool: NotificationPool
  enabled?: boolean
  pollMs?: number
}

export function useNotifications({ pool, enabled = true, pollMs = DEFAULT_POLL_MS }: UseNotificationsOptions) {
  const { t, i18n } = useTranslation()
  const language = normalizeLanguage(i18n.language)
  const [items, setItems] = useState<AppNotification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  // id уведомления, по которому сейчас отправляется ответ на «Поездка состоялась?».
  const [answeringId, setAnsweringId] = useState<string | null>(null)
  const isMounted = useRef(true)

  const listFn = pool === 'passenger'
    ? listPassengerNotifications
    : pool === 'driver'
      ? listDriverNotifications
      : listAdminNotifications

  const unreadFn = pool === 'passenger'
    ? getPassengerUnreadCount
    : pool === 'driver'
      ? getDriverUnreadCount
      : getAdminUnreadCount

  const refresh = useCallback(async () => {
    if (!enabled) return
    setIsLoading(true)
    setErrorMessage(null)
    try {
      const [page, count] = await Promise.all([
        listFn({ limit: 50, offset: 0, lang: language }),
        unreadFn(),
      ])
      if (!isMounted.current) return
      setItems(page.items)
      setUnreadCount(count)
    } catch (err) {
      if (!isMounted.current) return
      setErrorMessage(
        err instanceof Error
          ? err.message
          : t('notifications.loadFailed', { defaultValue: 'Failed to load notifications' }),
      )
    } finally {
      if (isMounted.current) setIsLoading(false)
    }
  }, [enabled, language, listFn, unreadFn, t])

  useEffect(() => {
    isMounted.current = true
    void refresh()
    if (!enabled) return undefined
    const timer = window.setInterval(() => void refresh(), pollMs)
    return () => {
      isMounted.current = false
      window.clearInterval(timer)
    }
  }, [enabled, pollMs, refresh])

  const markRead = useCallback(
    async (notificationId: string) => {
      const markFn = pool === 'passenger'
        ? markPassengerNotificationRead
        : pool === 'driver'
          ? markDriverNotificationRead
          : markAdminNotificationRead
      const updated = await markFn(notificationId, language)
      setItems((prev) => prev.map((item) => (item.id === updated.id ? updated : item)))
      setUnreadCount((prev) => Math.max(0, prev - (updated.readAt ? 1 : 0)))
      if (!updated.readAt) {
        const count = await unreadFn()
        setUnreadCount(count)
      }
      return updated
    },
    [language, pool, unreadFn],
  )

  const markAllRead = useCallback(async () => {
    const markAllFn = pool === 'passenger'
      ? markAllPassengerNotificationsRead
      : pool === 'driver'
        ? markAllDriverNotificationsRead
        : markAllAdminNotificationsRead
    await markAllFn()
    setItems((prev) => prev.map((item) => ({ ...item, readAt: item.readAt ?? new Date().toISOString() })))
    setUnreadCount(0)
  }, [pool])

  /**
   * Ответ на вопрос «Поездка состоялась?» прямо из ленты уведомлений.
   *
   * Так пассажиру не нужно искать карточку поездки: кнопки [Да]/[Нет] живут в самом
   * уведомлении, а после ответа вопрос исчезает (сервер помечает его прочитанным).
   */
  const answerRideCompletion = useCallback(
    async (notification: AppNotification, completed: boolean) => {
      const prompt = rideCompletionPrompt(notification)
      if (!prompt) return
      setAnsweringId(notification.id)
      setErrorMessage(null)
      try {
        await confirmRideCompletion(prompt.rideId, completed)
      } catch (err) {
        // Поездку могли закрыть другие участники: вопрос неактуален — просто убираем кнопки.
        const code = err instanceof RideFlowError ? err.code : null
        const alreadyClosed = code === 'ride_closed' || code === 'not_in_progress'
        if (!isMounted.current) return
        if (!alreadyClosed) {
          setErrorMessage(
            err instanceof Error
              ? err.message
              : t('rideCompletion.failed', { defaultValue: 'Не удалось отправить ответ.' }),
          )
          setAnsweringId(null)
          return
        }
      }
      if (!isMounted.current) return
      setItems((prev) =>
        prev.map((item) =>
          item.id === notification.id
            ? { ...item, readAt: item.readAt ?? new Date().toISOString() }
            : item,
        ),
      )
      setUnreadCount((prev) => Math.max(0, prev - (notification.readAt ? 0 : 1)))
      await refresh()
      setAnsweringId(null)
    },
    [refresh, t],
  )

  return {
    items,
    unreadCount,
    isLoading,
    errorMessage,
    refresh,
    markRead,
    markAllRead,
    answerRideCompletion,
    answeringId,
  }
}
