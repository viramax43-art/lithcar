import { useCallback, useEffect, useRef, useState } from 'react'

import type { RideChatPage } from '../../types'
import {
  getRideChat,
  getRideChatUnreadCount,
  markRideChatRead,
  sendRideChatMessage,
} from '../../infrastructure/api/rideChatApi'
import {
  getDriverRideChat,
  getDriverRideChatUnreadCount,
  markDriverRideChatRead,
  sendDriverRideChatMessage,
} from '../../infrastructure/api/driverApi'

const DEFAULT_POLL_MS = 5_000

export type RideChatRole = 'passenger' | 'driver'

interface UseRideChatOptions {
  rideId: string | null
  role: RideChatRole
  /** Опрашивать сервер (включаем, пока чат открыт). */
  enabled?: boolean
  pollMs?: number
}

/**
 * Чат поездки: общая переписка водителя и попутчиков.
 *
 * Поллинг только пока шит открыт — так мы не создаём лишнюю нагрузку,
 * а счётчик непрочитанных подтягивается при открытии и после отправки.
 */
export function useRideChat({ rideId, role, enabled = true, pollMs = DEFAULT_POLL_MS }: UseRideChatOptions) {
  const [page, setPage] = useState<RideChatPage | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const isMounted = useRef(true)

  const loadFn = role === 'driver' ? getDriverRideChat : getRideChat
  const readFn = role === 'driver' ? markDriverRideChatRead : markRideChatRead
  const sendFn = role === 'driver' ? sendDriverRideChatMessage : sendRideChatMessage

  const refresh = useCallback(async () => {
    if (!rideId || !enabled) return null
    setIsLoading(true)
    setErrorMessage(null)
    try {
      const next = await loadFn(rideId)
      if (!isMounted.current) return null
      setPage(next)
      return next
    } catch (error) {
      if (!isMounted.current) return null
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load chat')
      return null
    } finally {
      if (isMounted.current) setIsLoading(false)
    }
  }, [enabled, loadFn, rideId])

  useEffect(() => {
    isMounted.current = true
    if (!enabled || !rideId) {
      setPage(null)
      return undefined
    }
    void refresh()
    const timer = window.setInterval(() => void refresh(), pollMs)
    return () => {
      isMounted.current = false
      window.clearInterval(timer)
    }
  }, [enabled, pollMs, refresh, rideId])

  const markRead = useCallback(async () => {
    if (!rideId || !enabled) return
    try {
      await readFn(rideId)
      if (isMounted.current) {
        setPage((prev) => (prev ? { ...prev, unreadCount: 0, items: prev.items.map((item) => ({ ...item, readByOthers: true })) } : prev))
      }
    } catch {
      // отметка прочтения не критична для UI
    }
  }, [enabled, readFn, rideId])

  const send = useCallback(
    async (body: string, quick?: string) => {
      if (!rideId) return false
      const trimmed = body.trim()
      if (!trimmed) return false
      setIsSending(true)
      setErrorMessage(null)
      try {
        const next = await sendFn(rideId, trimmed, quick)
        if (isMounted.current) setPage(next)
        return true
      } catch (error) {
        if (isMounted.current) {
          setErrorMessage(error instanceof Error ? error.message : 'Failed to send message')
        }
        return false
      } finally {
        if (isMounted.current) setIsSending(false)
      }
    },
    [rideId, sendFn],
  )

  return {
    messages: page?.items ?? [],
    unreadCount: page?.unreadCount ?? 0,
    canSend: page?.canSend ?? false,
    closedReason: page?.closedReason ?? null,
    participants: page?.participants ?? [],
    isLoading,
    isSending,
    errorMessage,
    send,
    markRead,
    refresh,
  }
}

/**
 * Лёгкий счётчик непрочитанных: нужен для бейджа на кнопке чата,
 * когда сам чат закрыт (полный список сообщений не тянем).
 */
export function useRideChatUnread({
  rideId,
  role,
  enabled = true,
  pollMs = 20_000,
}: UseRideChatOptions) {
  const [unreadCount, setUnreadCount] = useState(0)

  const countFn = role === 'driver' ? getDriverRideChatUnreadCount : getRideChatUnreadCount

  const refresh = useCallback(async () => {
    if (!rideId || !enabled) {
      setUnreadCount(0)
      return
    }
    try {
      setUnreadCount(await countFn(rideId))
    } catch {
      // сеть/сессия — не ломаем интерфейс из-за счётчика
    }
  }, [countFn, enabled, rideId])

  useEffect(() => {
    void refresh()
    if (!enabled || !rideId) return undefined
    const timer = window.setInterval(() => void refresh(), pollMs)
    return () => window.clearInterval(timer)
  }, [enabled, pollMs, refresh, rideId])

  return { unreadCount, refresh }
}
