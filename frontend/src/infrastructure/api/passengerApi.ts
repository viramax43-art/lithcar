import type { GroupSuggestion, PricingSettings, RideRequest, ServiceZone, UserCabinetData } from '../../types'
import { apiRequest } from '../http/httpClient'
import type {
  CurrentUser,
  DriverQrRedeemResult,
  PaginatedResult,
  PaginationParams,
  RideRequestApi,
  UserCabinetApi,
} from './contracts'
import { mapRideRequest, mapUserCabinetData, toPageQuery } from './sharedMappers'

export async function getCurrentUser(): Promise<CurrentUser> {
  return apiRequest<CurrentUser>('/api/users/me')
}

export async function listMyRequests(params?: PaginationParams): Promise<PaginatedResult<RideRequest>> {
  const page = await apiRequest<{ items: RideRequestApi[]; total: number; limit: number; offset: number }>(
    `/api/ride-requests/me?${toPageQuery(params)}`
  )
  return { items: page.items.map(mapRideRequest), total: page.total, limit: page.limit, offset: page.offset }
}

export async function getRequestById(requestId: string): Promise<RideRequest> {
  const item = await apiRequest<RideRequestApi>(`/api/ride-requests/${requestId}`)
  return mapRideRequest(item)
}

export async function createRequest(payload: {
  passengerName: string
  from: { address: string; latlng: { lat: number; lng: number } }
  to: { address: string; latlng: { lat: number; lng: number } }
  dateTime: string
}): Promise<RideRequest> {
  const created = await apiRequest<RideRequestApi>('/api/ride-requests', {
    method: 'POST',
    body: {
      passengerName: payload.passengerName,
      fromPoint: payload.from,
      toPoint: payload.to,
      dateTime: payload.dateTime,
    },
  })
  return mapRideRequest(created)
}

export async function updateRequest(
  requestId: string,
  payload: Partial<{
    passengerName: string
    from: { address: string; latlng: { lat: number; lng: number } }
    to: { address: string; latlng: { lat: number; lng: number } }
    dateTime: string
  }>
): Promise<RideRequest> {
  const updated = await apiRequest<RideRequestApi>(`/api/ride-requests/${requestId}`, {
    method: 'PATCH',
    body: {
      passengerName: payload.passengerName,
      fromPoint: payload.from,
      toPoint: payload.to,
      dateTime: payload.dateTime,
    },
  })
  return mapRideRequest(updated)
}

export async function confirmPickup(requestId: string): Promise<RideRequest> {
  const item = await apiRequest<RideRequestApi>(`/api/ride-requests/${requestId}/confirm-pickup`, {
    method: 'POST',
  })
  return mapRideRequest(item)
}

export async function deleteRequest(requestId: string): Promise<void> {
  await apiRequest<{ success: boolean }>(`/api/ride-requests/${requestId}`, { method: 'DELETE' })
}

export async function listServiceZones(
  authMode: 'bearer' | 'cookie' = 'bearer',
  params?: PaginationParams
): Promise<PaginatedResult<ServiceZone>> {
  return apiRequest<PaginatedResult<ServiceZone>>(`/api/service-zones?${toPageQuery(params)}`, { authMode })
}

export async function getPricing(authMode: 'bearer' | 'cookie' = 'bearer'): Promise<PricingSettings> {
  const result = await apiRequest<PricingSettings>('/api/pricing', { authMode })
  return {
    pointsPerRide: result.pointsPerRide,
    pointPriceCents: result.pointPriceCents,
    workStartTime: result.workStartTime ?? '06:00',
    workEndTime: result.workEndTime ?? '19:00',
    slotIntervalMinutes: result.slotIntervalMinutes ?? 30,
  }
}

export async function getUserCabinet(params?: PaginationParams): Promise<UserCabinetData> {
  const response = await apiRequest<UserCabinetApi>(`/api/users/me/cabinet?${toPageQuery(params)}`)
  return mapUserCabinetData(response)
}

export async function redeemDriverQrSale(token: string): Promise<DriverQrRedeemResult> {
  return apiRequest<DriverQrRedeemResult>('/api/points/qr/redeem', { method: 'POST', body: { token } })
}

export async function purchasePointsByCard(points: number): Promise<{ success: boolean; pointsAdded: number; pointsBalance: number; eurAmountCents: number }> {
  return apiRequest<{ success: boolean; pointsAdded: number; pointsBalance: number; eurAmountCents: number }>(
    '/api/points/card/purchase',
    { method: 'POST', body: { points } },
  )
}

export async function listGroupSuggestions(params?: PaginationParams): Promise<PaginatedResult<GroupSuggestion>> {
  return apiRequest<PaginatedResult<GroupSuggestion>>(`/api/group-suggestions?${toPageQuery(params)}`, {
    authMode: 'cookie',
  })
}
