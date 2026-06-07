import { mapPricingSettings } from '../../lib/pricingDefaults'
import type { GroupSuggestion, MapMark, PricingSettings, RideQuote, RideRequest, ServiceZone, UserCabinetData } from '../../types'
import { apiRequest } from '../http/httpClient'
import type {
  CurrentUser,
  PassengerQrIssueResult,
  PaginatedResult,
  PaginationParams,
  RideRequestApi,
  UserCabinetApi,
} from './contracts'
import { mapRideRequest, mapUserCabinetData, toPageQuery } from './sharedMappers'

export async function getCurrentUser(): Promise<CurrentUser> {
  return apiRequest<CurrentUser>('/api/users/me')
}

export async function updateCurrentUserLanguage(language: 'lt' | 'pl' | 'en' | 'ru'): Promise<CurrentUser> {
  return apiRequest<CurrentUser>('/api/users/me/language', {
    method: 'PATCH',
    body: { language },
  })
}

export async function completeOnboarding(): Promise<{ success: boolean }> {
  return apiRequest<{ success: boolean }>('/api/users/me/complete-onboarding', { method: 'POST' })
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

export async function rateRideAsPassenger(
  requestId: string,
  payload: { score: number; comment?: string },
): Promise<RideRequest> {
  const item = await apiRequest<RideRequestApi>(`/api/ride-requests/${requestId}/rate`, {
    method: 'POST',
    body: payload,
  })
  return mapRideRequest(item)
}

export async function listServiceZones(
  authMode: 'bearer' | 'cookie' = 'bearer',
  params?: PaginationParams
): Promise<PaginatedResult<ServiceZone>> {
  return apiRequest<PaginatedResult<ServiceZone>>(`/api/service-zones?${toPageQuery(params)}`, { authMode })
}

export async function listPublicMapMarks(
  authMode: 'bearer' | 'cookie' = 'bearer',
  params?: PaginationParams
): Promise<PaginatedResult<MapMark>> {
  return apiRequest<PaginatedResult<MapMark>>(`/api/map-marks/public?${toPageQuery(params)}`, { authMode })
}

export async function getPricing(authMode: 'bearer' | 'cookie' = 'bearer'): Promise<PricingSettings> {
  const result = await apiRequest<PricingSettings>('/api/pricing', { authMode })
  return mapPricingSettings(result)
}

export async function getRideQuote(
  params: { fromLat: number; fromLng: number; toLat: number; toLng: number },
  authMode: 'bearer' | 'cookie' = 'bearer',
): Promise<RideQuote> {
  const q = new URLSearchParams({
    fromLat: String(params.fromLat),
    fromLng: String(params.fromLng),
    toLat: String(params.toLat),
    toLng: String(params.toLng),
  })
  return apiRequest<RideQuote>(`/api/ride-quote?${q}`, { authMode })
}

export async function getUserCabinet(params?: PaginationParams): Promise<UserCabinetData> {
  const response = await apiRequest<UserCabinetApi>(`/api/users/me/cabinet?${toPageQuery(params)}`)
  return mapUserCabinetData(response)
}

export async function issuePassengerQrSale(points: number): Promise<PassengerQrIssueResult> {
  return apiRequest<PassengerQrIssueResult>('/api/points/qr/issue', {
    method: 'POST',
    body: { points },
  })
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
