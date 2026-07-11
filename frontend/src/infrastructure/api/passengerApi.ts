import { mapPricingSettings } from '../../lib/pricingDefaults'
import type { GroupSuggestion, MapMark, PassengerRideOffer, PricingSettings, RideQuote, RideRequest, ServiceZone, UserCabinetData, MatchedPassengerRideOffer } from '../../types'
import { apiRequest } from '../http/httpClient'
import type {
  CurrentUser,
  PassengerQrIssueResult,
  PaginatedResult,
  PaginationParams,
  PassengerRideOfferApi,
  MatchedPassengerRideOfferApi,
  RideRequestApi,
  UserCabinetApi,
} from './contracts'
import { mapPassengerRideOffer, mapRideRequest, mapUserCabinetData, mapMatchedPassengerRideOffer, toPageQuery } from './sharedMappers'

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

export async function listMyRequests(
  params?: PaginationParams & { scope?: 'active' | 'completed' },
): Promise<PaginatedResult<RideRequest>> {
  const query = toPageQuery(params)
  const scopeSuffix = params?.scope ? `&scope=${params.scope}` : ''
  const page = await apiRequest<{ items: RideRequestApi[]; total: number; limit: number; offset: number }>(
    `/api/ride-requests/me?${query}${scopeSuffix}`
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

export async function transferPoints(payload: {
  recipientUserId: string
  points: number
}): Promise<{
  success: boolean
  transferId: string
  points: number
  pointsBalance: number
  recipientUserId: string
  recipientUsername: string | null
}> {
  return apiRequest<{
    success: boolean
    transferId: string
    points: number
    pointsBalance: number
    recipientUserId: string
    recipientUsername: string | null
  }>('/api/points/transfer', {
    method: 'POST',
    body: payload,
  })
}

export async function listGroupSuggestions(params?: PaginationParams): Promise<PaginatedResult<GroupSuggestion>> {
  return apiRequest<PaginatedResult<GroupSuggestion>>(`/api/group-suggestions?${toPageQuery(params)}`, {
    authMode: 'cookie',
  })
}

export async function listRideOffers(
  params?: PaginationParams & {
    date?: string
    fromLat?: number
    fromLng?: number
    radiusKm?: number
  },
): Promise<{ items: PassengerRideOffer[]; total: number; limit: number; offset: number }> {
  const query = toPageQuery(params)
  const extra = new URLSearchParams()
  if (params?.date) extra.set('date', params.date)
  if (params?.fromLat != null) extra.set('fromLat', String(params.fromLat))
  if (params?.fromLng != null) extra.set('fromLng', String(params.fromLng))
  if (params?.radiusKm != null) extra.set('radiusKm', String(params.radiusKm))
  const extraSuffix = extra.toString() ? `&${extra.toString()}` : ''
  const page = await apiRequest<{ items: PassengerRideOfferApi[]; total: number; limit: number; offset: number }>(
    `/api/ride-offers?${query}${extraSuffix}`,
  )
  return { ...page, items: page.items.map(mapPassengerRideOffer) }
}

export async function listMatchingRideOffers(params: {
  fromLat: number
  fromLng: number
  toLat: number
  toLng: number
  dateTime?: string
  limit?: number
  minScore?: number
  radiusKm?: number
}): Promise<{ items: MatchedPassengerRideOffer[]; total: number; limit: number; offset: number }> {
  const q = new URLSearchParams({
    fromLat: String(params.fromLat),
    fromLng: String(params.fromLng),
    toLat: String(params.toLat),
    toLng: String(params.toLng),
  })
  if (params.dateTime) q.set('dateTime', params.dateTime)
  if (params.limit != null) q.set('limit', String(params.limit))
  if (params.minScore != null) q.set('minScore', String(params.minScore))
  if (params.radiusKm != null) q.set('radiusKm', String(params.radiusKm))
  const page = await apiRequest<{ items: MatchedPassengerRideOfferApi[]; total: number; limit: number; offset: number }>(
    `/api/ride-offers/matches?${q}`,
  )
  return { ...page, items: page.items.map(mapMatchedPassengerRideOffer) }
}

export async function getRideOffer(id: string): Promise<PassengerRideOffer> {
  const item = await apiRequest<PassengerRideOfferApi>(`/api/ride-offers/${id}`)
  return mapPassengerRideOffer(item)
}

export async function bookRideOffer(id: string, payload?: { passengerName?: string }): Promise<RideRequest> {
  const created = await apiRequest<RideRequestApi>(`/api/ride-offers/${id}/book`, {
    method: 'POST',
    body: payload ?? {},
  })
  return mapRideRequest(created)
}
