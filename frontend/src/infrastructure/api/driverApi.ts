import type { DriverCabinetData, DriverCabinetRide, RideStatus } from '../../types'
import { apiRequest } from '../http/httpClient'
import type { DriverQrIssueResult, DriverSessionUser, PaginationParams } from './contracts'
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

export async function issueDriverQrSale(points: number): Promise<DriverQrIssueResult> {
  return apiRequest<DriverQrIssueResult>('/api/driver/cabinet/qr-sales/issue', {
    method: 'POST',
    body: { points },
    authMode: 'cookie',
  })
}
