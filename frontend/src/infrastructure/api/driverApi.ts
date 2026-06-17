import type { DriverCabinetData, DriverCabinetRide, DriverMapData, DriverRideHistoryItem, DriverRideOffer, RideStatus, MatchedRideRequest } from '../../types'
import { apiRequest } from '../http/httpClient'
import type { DriverQrRedeemResult, DriverQrIssueResult, DriverSessionUser, DriverRideOfferApi, PaginationParams, MatchedRideRequestApi } from './contracts'
import { mapDriverRideOffer, mapMatchedRideRequest, toPageQuery } from './sharedMappers'

export async function bootstrapDriverAccess(): Promise<DriverSessionUser> {
  return apiRequest<DriverSessionUser>('/api/driver-registration/driver-access/bootstrap', {
    method: 'POST',
    withCredentials: true,
  })
}

export async function loginDriverByKey(key: string): Promise<DriverSessionUser> {
  return apiRequest<DriverSessionUser>('/api/driver/session/login', {
    method: 'POST',
    body: { key },
    authMode: 'cookie',
  })
}

export async function getDriverSession(): Promise<DriverSessionUser> {
  return apiRequest<DriverSessionUser>('/api/driver/session/me', { authMode: 'cookie' })
}

export async function logoutDriverSession(): Promise<void> {
  await apiRequest<{ success: boolean }>('/api/driver/session/logout', { method: 'POST', authMode: 'cookie' })
}

export async function getDriverCabinet(params?: PaginationParams): Promise<DriverCabinetData> {
  return apiRequest<DriverCabinetData>(`/api/driver/cabinet?${toPageQuery(params)}`, { authMode: 'cookie' })
}

export async function getDriverRideHistory(params?: PaginationParams): Promise<{
  items: DriverRideHistoryItem[]
  total: number
  limit: number
  offset: number
}> {
  return apiRequest(`/api/driver/cabinet/history?${toPageQuery(params)}`, { authMode: 'cookie' })
}

export async function setDriverRideStatus(rideId: string, status: RideStatus): Promise<DriverCabinetRide> {
  return apiRequest<DriverCabinetRide>(`/api/driver/cabinet/rides/${rideId}/status`, {
    method: 'PATCH',
    body: { status },
    authMode: 'cookie',
  })
}

export async function sendDriverLocation(lat: number, lng: number): Promise<void> {
  await apiRequest<{ success: boolean }>('/api/driver/cabinet/location', {
    method: 'POST',
    body: { lat, lng },
    authMode: 'cookie',
  })
}

export async function setDriverOnlineStatus(isOnline: boolean): Promise<DriverSessionUser> {
  return apiRequest<DriverSessionUser>('/api/driver/cabinet/online', {
    method: 'PATCH',
    body: { isOnline },
    authMode: 'cookie',
  })
}

export async function updateDriverRidePickup(
  rideId: string,
  fromAddress: string,
  fromLat: number,
  fromLng: number,
): Promise<DriverCabinetRide> {
  return apiRequest<DriverCabinetRide>(`/api/driver/cabinet/rides/${rideId}/pickup`, {
    method: 'PATCH',
    body: { fromAddress, fromLat, fromLng },
    authMode: 'cookie',
  })
}

export async function updateDriverRideRoute(
  rideId: string,
  payload: {
    fromPoint?: { address: string; lat: number; lng: number }
    toPoint?: { address: string; lat: number; lng: number }
  },
): Promise<DriverCabinetRide> {
  return apiRequest<DriverCabinetRide>(`/api/driver/cabinet/rides/${rideId}/route`, {
    method: 'PATCH',
    body: payload,
    authMode: 'cookie',
  })
}

export async function resetDriverRidePickup(rideId: string): Promise<DriverCabinetRide> {
  return apiRequest<DriverCabinetRide>(`/api/driver/cabinet/rides/${rideId}/pickup/reset`, {
    method: 'POST',
    authMode: 'cookie',
  })
}

export async function notifyPickupChange(rideId: string): Promise<DriverCabinetRide> {
  return apiRequest<DriverCabinetRide>(`/api/driver/cabinet/rides/${rideId}/notify-pickup-change`, {
    method: 'POST',
    authMode: 'cookie',
  })
}

export async function getDriverMapData(): Promise<DriverMapData> {
  return apiRequest<DriverMapData>('/api/driver/cabinet/map', { authMode: 'cookie' })
}

export async function claimDriverRide(requestId: string, payload?: { offerId?: string }): Promise<DriverCabinetRide> {
  return apiRequest<DriverCabinetRide>(`/api/driver/cabinet/rides/${requestId}/claim`, {
    method: 'POST',
    body: payload ?? {},
    authMode: 'cookie',
  })
}

export async function applyDriverPointAction(
  rideId: string,
  pointType: 'pickup' | 'dropoff',
  action: string,
): Promise<DriverCabinetRide> {
  return apiRequest<DriverCabinetRide>(`/api/driver/cabinet/points/${rideId}/${pointType}/action`, {
    method: 'PATCH',
    body: { action },
    authMode: 'cookie',
  })
}

export async function rateRideAsDriver(
  rideId: string,
  payload: { score: number; comment?: string },
): Promise<DriverCabinetRide> {
  return apiRequest<DriverCabinetRide>(`/api/driver/cabinet/rides/${rideId}/rate`, {
    method: 'POST',
    body: payload,
    authMode: 'cookie',
  })
}

export async function issueDriverQrSale(points: number): Promise<DriverQrIssueResult> {
  return apiRequest<DriverQrIssueResult>('/api/driver/cabinet/qr-sales/issue', {
    method: 'POST',
    body: { points },
    authMode: 'cookie',
  })
}

export async function redeemPassengerQrSale(token: string): Promise<DriverQrRedeemResult> {
  return apiRequest<DriverQrRedeemResult>('/api/points/qr/redeem', {
    method: 'POST',
    body: { token },
    authMode: 'cookie',
  })
}

export async function createDriverOffer(payload: {
  fromPoint: { address: string; latlng: { lat: number; lng: number } }
  toPoint: { address: string; latlng: { lat: number; lng: number } }
  dateTime: string
  totalSeats: number
}): Promise<DriverRideOffer> {
  const created = await apiRequest<DriverRideOfferApi>('/api/driver/offers', {
    method: 'POST',
    body: payload,
    authMode: 'cookie',
  })
  return mapDriverRideOffer(created)
}

export async function listDriverOffers(
  params?: PaginationParams & { status?: 'open' | 'full' | 'cancelled' | 'completed' | 'all' },
): Promise<{ items: DriverRideOffer[]; total: number; limit: number; offset: number }> {
  const query = toPageQuery(params)
  const statusSuffix = params?.status ? `&status=${params.status}` : ''
  const page = await apiRequest<{ items: DriverRideOfferApi[]; total: number; limit: number; offset: number }>(
    `/api/driver/offers?${query}${statusSuffix}`,
    { authMode: 'cookie' },
  )
  return { ...page, items: page.items.map(mapDriverRideOffer) }
}

export async function cancelDriverOffer(id: string): Promise<void> {
  await apiRequest<{ success: boolean }>(`/api/driver/offers/${id}`, {
    method: 'DELETE',
    authMode: 'cookie',
  })
}

export async function listOfferMatchingRequests(
  offerId: string,
  params?: { limit?: number; minScore?: number },
): Promise<{ items: MatchedRideRequest[]; total: number }> {
  const q = new URLSearchParams()
  if (params?.limit != null) q.set('limit', String(params.limit))
  if (params?.minScore != null) q.set('minScore', String(params.minScore))
  const suffix = q.toString() ? `?${q}` : ''
  const page = await apiRequest<{ items: MatchedRideRequestApi[]; total: number }>(
    `/api/driver/offers/${offerId}/matches${suffix}`,
    { authMode: 'cookie' },
  )
  return { items: page.items.map(mapMatchedRideRequest), total: page.total }
}
