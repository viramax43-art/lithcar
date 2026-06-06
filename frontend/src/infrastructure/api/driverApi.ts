import type { DriverCabinetData, DriverCabinetRide, DriverMapData, RideStatus } from '../../types'
import { apiRequest } from '../http/httpClient'
import type { DriverQrRedeemResult, DriverQrIssueResult, DriverSessionUser, PaginationParams } from './contracts'
import { toPageQuery } from './sharedMappers'

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

export async function claimDriverRide(requestId: string): Promise<DriverCabinetRide> {
  return apiRequest<DriverCabinetRide>(`/api/driver/cabinet/rides/${requestId}/claim`, {
    method: 'POST',
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
