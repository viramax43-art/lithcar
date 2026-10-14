import { useCallback, useEffect, useRef, useState } from 'react'

import type { RideFlowState } from '../../types'
import { getRideFlow } from '../../infrastructure/api/rideChatApi'
import { getDriverRideFlow } from '../../infrastructure/api/driverApi'

export type RideFlowRole = 'passenger' | 'driver'

interface UseRideFlowOptions {
  rideId: string | null
  role: RideFlowRole
  enabled?: boolean
  pollMs?: number
}

/**
 * Состояние жизненного цикла поездки.
 *
 * Именно по нему UI решает, какие кнопки показать: «Еду на точку», «Прибыл», откат,
 * неявка, «Я на месте». Так в интерфейсе не бывает «мёртвых» кнопок и ложных ожиданий.
 */
export function useRideFlow({ rideId, role, enabled = true, pollMs = 15_000 }: UseRideFlowOptions) {
  const [flow, setFlow] = useState<RideFlowState | null>(null)
  const [chatUnreadCount, setChatUnreadCount] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const isMounted = useRef(true)

  const load = useCallback(async () => {
    if (!rideId || !enabled) return null
    setIsLoading(true)
    try {
      if (role === 'driver') {
        const payload = await getDriverRideFlow(rideId)
        if (!isMounted.current) return null
        setFlow(payload.flow)
        setChatUnreadCount(payload.chatUnreadCount)
        setErrorMessage(null)
        return payload.flow
      }
      const payload = await getRideFlow(rideId)
      if (!isMounted.current) return null
      setFlow(payload)
      setErrorMessage(null)
      return payload
    } catch (error) {
      if (isMounted.current) {
        setErrorMessage(error instanceof Error ? error.message : 'Failed to load ride state')
      }
      return null
    } finally {
      if (isMounted.current) setIsLoading(false)
    }
  }, [enabled, rideId, role])

  useEffect(() => {
    isMounted.current = true
    if (!rideId || !enabled) {
      setFlow(null)
      return undefined
    }
    void load()
    const timer = window.setInterval(() => void load(), pollMs)
    return () => {
      isMounted.current = false
      window.clearInterval(timer)
    }
  }, [enabled, load, pollMs, rideId])

  return { flow, chatUnreadCount, isLoading, errorMessage, refresh: load, setFlow }
}

/** Обратный отсчёт в секундах (для кулдаунов «Где вы?» и окна отката). */
export function useCountdown(seconds: number | undefined): number {
  const [left, setLeft] = useState(seconds ?? 0)

  useEffect(() => {
    setLeft(seconds ?? 0)
  }, [seconds])

  useEffect(() => {
    if (left <= 0) return undefined
    const timer = window.setInterval(() => setLeft((prev) => (prev > 0 ? prev - 1 : 0)), 1000)
    return () => window.clearInterval(timer)
  }, [left > 0])

  return left
}

export function formatCountdown(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds))
  const minutes = Math.floor(total / 60)
  const rest = total % 60
  return `${minutes}:${rest.toString().padStart(2, '0')}`
}
