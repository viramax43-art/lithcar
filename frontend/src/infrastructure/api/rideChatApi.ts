import type { RideChatPage, RideFlowState } from '../../types'
import { ApiError, apiRequest } from '../http/httpClient'

interface RideFlowApi extends RideFlowState {
  rideId: string
}

interface UnreadCountApi {
  count: number
}

interface RideFlowRequestError {
  code?: string
  message?: string
  retryAfterSeconds?: number
  availableInSeconds?: number
  canStartAt?: string | null
  undoWindowMinutes?: number
  minWaitMinutes?: number
}

/**
 * Ошибка перехода статуса с машинным кодом: UI показывает понятную подсказку
 * («неявка доступна через 3 мин», «отметить позже, с 12:30») вместо общего текста.
 */
export class RideFlowError extends Error {
  readonly code: string
  readonly details: RideFlowRequestError

  constructor(code: string, message: string, details: RideFlowRequestError = {}) {
    super(message)
    this.name = 'RideFlowError'
    this.code = code
    this.details = details
  }
}

function asFlowError(error: unknown): RideFlowError {
  if (error instanceof ApiError) {
    try {
      const parsed = JSON.parse(error.body) as { detail?: RideFlowRequestError | string }
      const detail = parsed.detail
      if (typeof detail === 'object' && detail !== null) {
        return new RideFlowError(
          detail.code ?? 'request_failed',
          detail.message ?? error.message,
          detail,
        )
      }
      if (typeof detail === 'string') {
        return new RideFlowError('request_failed', detail)
      }
    } catch {
      // тело не JSON — оставляем общее сообщение
    }
    return new RideFlowError('request_failed', error.message)
  }
  if (error instanceof Error) {
    return new RideFlowError('request_failed', error.message)
  }
  return new RideFlowError('request_failed', 'Request failed')
}

export async function getRideFlow(rideId: string): Promise<RideFlowApi> {
  try {
    return await apiRequest<RideFlowApi>(`/api/v1/rides/${rideId}/flow`)
  } catch (error) {
    throw asFlowError(error)
  }
}

export async function getRideChat(rideId: string, limit = 100): Promise<RideChatPage> {
  return apiRequest<RideChatPage>(`/api/v1/rides/${rideId}/chat?limit=${limit}`)
}

export async function sendRideChatMessage(
  rideId: string,
  body: string,
  quick?: string,
): Promise<RideChatPage> {
  try {
    return await apiRequest<RideChatPage>(`/api/v1/rides/${rideId}/chat`, {
      method: 'POST',
      body: quick ? { body, quick } : { body },
    })
  } catch (error) {
    throw asFlowError(error)
  }
}

export async function markRideChatRead(rideId: string): Promise<number> {
  const result = await apiRequest<UnreadCountApi>(`/api/v1/rides/${rideId}/chat/read`, {
    method: 'POST',
  })
  return result.count
}

export async function getRideChatUnreadCount(rideId: string): Promise<number> {
  const result = await apiRequest<UnreadCountApi>(`/api/v1/rides/${rideId}/chat/unread-count`)
  return result.count
}

export async function markPassengerReady(rideId: string): Promise<RideFlowApi> {
  try {
    return await apiRequest<RideFlowApi>(`/api/v1/rides/${rideId}/ready`, { method: 'POST' })
  } catch (error) {
    throw asFlowError(error)
  }
}

export async function nudgeDriver(rideId: string): Promise<RideFlowApi> {
  try {
    return await apiRequest<RideFlowApi>(`/api/v1/rides/${rideId}/nudge`, { method: 'POST' })
  } catch (error) {
    throw asFlowError(error)
  }
}

export async function cancelRideAsPassenger(
  rideId: string,
  comment?: string,
): Promise<RideFlowApi> {
  try {
    return await apiRequest<RideFlowApi>(`/api/v1/rides/${rideId}/cancel`, {
      method: 'POST',
      body: comment ? { comment } : {},
    })
  } catch (error) {
    throw asFlowError(error)
  }
}

export type { RideFlowApi, RideFlowRequestError }

// Тот же разбор ошибок используют водительские методы — держим единый формат подсказок.
export { asFlowError as toRideFlowError }
