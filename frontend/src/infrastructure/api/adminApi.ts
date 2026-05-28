import type { Driver, PricingSettings, RideRequest, ServiceZone } from '../../types'
import { apiRequest, uploadMultipart } from '../http/httpClient'
import type {
  AdminKeyInfo,
  AdminQrSaleAudit,
  AdminSessionUser,
  PaginatedResult,
  PaginationParams,
  RidePointOverride,
  RideRequestApi,
} from './contracts'
import { mapRideRequest, toPageQuery } from './sharedMappers'

export async function listAdminRequests(status: string, params?: PaginationParams): Promise<PaginatedResult<RideRequest>> {
  const statusPart = status && status !== 'all' ? `status=${encodeURIComponent(status)}&` : ''
  const page = await apiRequest<{ items: RideRequestApi[]; total: number; limit: number; offset: number }>(
    `/api/ride-requests?${statusPart}${toPageQuery(params)}`,
    { authMode: 'cookie' }
  )
  return { items: page.items.map(mapRideRequest), total: page.total, limit: page.limit, offset: page.offset }
}

export async function assignDriverBulk(
  requestIds: string[],
  driverId: string,
  pointOverrides?: RidePointOverride[],
): Promise<RideRequest[]> {
  const body: { requestIds: string[]; driverId: string; pointOverrides?: RidePointOverride[] } = { requestIds, driverId }
  if (pointOverrides && pointOverrides.length > 0) body.pointOverrides = pointOverrides
  const updated = await apiRequest<RideRequestApi[]>('/api/ride-requests/assign-bulk', {
    method: 'POST',
    body,
    authMode: 'cookie',
  })
  return updated.map(mapRideRequest)
}

export async function listDrivers(onlineOnly = false, params?: PaginationParams): Promise<PaginatedResult<Driver>> {
  const onlinePart = onlineOnly ? 'onlineOnly=true&' : ''
  return apiRequest<PaginatedResult<Driver>>(`/api/drivers?${onlinePart}${toPageQuery(params)}`, { authMode: 'cookie' })
}

export async function createDriver(payload: {
  userId?: string
  name: string
  photoKey?: string
  carBrand: string
  carModel: string
  carPlate: string
  vehicleColor: string
  seatsCount: number
  licenseNumber?: string
  about: string
  rating?: number
  isOnline?: boolean
  canSellPoints?: boolean
}): Promise<{ driver: Driver; key: string }> {
  return apiRequest<{ driver: Driver; key: string }>('/api/drivers', { method: 'POST', body: payload, authMode: 'cookie' })
}

export async function rotateDriverKey(driverId: string): Promise<{ driver: Driver; key: string }> {
  return apiRequest<{ driver: Driver; key: string }>(`/api/drivers/${driverId}/rotate-key`, {
    method: 'POST',
    authMode: 'cookie',
  })
}

export async function uploadDriverPhoto(file: File): Promise<{ photoKey: string; photoUrl: string }> {
  const formData = new FormData()
  formData.append('file', file)
  return uploadMultipart('/api/drivers/photo', formData)
}

export async function updateDriver(
  driverId: string,
  payload: Partial<{
    name: string
    photoKey: string
    carBrand: string
    carModel: string
    carPlate: string
    vehicleColor: string
    seatsCount: number
    about: string
    rating: number
    isOnline: boolean
    canSellPoints: boolean
  }>
): Promise<Driver> {
  return apiRequest<Driver>(`/api/drivers/${driverId}`, { method: 'PATCH', body: payload, authMode: 'cookie' })
}

export async function deleteDriver(driverId: string): Promise<void> {
  await apiRequest<{ success: boolean }>(`/api/drivers/${driverId}`, { method: 'DELETE', authMode: 'cookie' })
}

export async function createServiceZone(payload: {
  name: string
  color: string
  polygon: { lat: number; lng: number }[]
  isActive: boolean
}): Promise<ServiceZone> {
  return apiRequest<ServiceZone>('/api/service-zones', { method: 'POST', body: payload, authMode: 'cookie' })
}

export async function updateServiceZone(
  zoneId: string,
  payload: Partial<Pick<ServiceZone, 'name' | 'color' | 'polygon' | 'isActive'>>
): Promise<ServiceZone> {
  return apiRequest<ServiceZone>(`/api/service-zones/${zoneId}`, { method: 'PATCH', body: payload, authMode: 'cookie' })
}

export async function deleteServiceZone(zoneId: string): Promise<void> {
  await apiRequest<{ success: boolean }>(`/api/service-zones/${zoneId}`, { method: 'DELETE', authMode: 'cookie' })
}

export async function updatePricing(
  payload: Partial<Pick<PricingSettings, 'pointsPerRide' | 'pointPriceCents' | 'userInfoText' | 'workStartTime' | 'workEndTime' | 'slotIntervalMinutes'>>
): Promise<PricingSettings> {
  const result = await apiRequest<PricingSettings>('/api/pricing', {
    method: 'PATCH',
    body: payload,
    authMode: 'cookie',
  })
  return {
    pointsPerRide: result.pointsPerRide,
    pointPriceCents: result.pointPriceCents,
    userInfoText: result.userInfoText ?? '',
    workStartTime: result.workStartTime ?? '06:00',
    workEndTime: result.workEndTime ?? '19:00',
    slotIntervalMinutes: result.slotIntervalMinutes ?? 30,
  }
}

export async function loginAdminByKey(key: string): Promise<AdminSessionUser> {
  return apiRequest<AdminSessionUser>('/api/admin/session/login', { method: 'POST', body: { key }, authMode: 'cookie' })
}

export async function getAdminSession(): Promise<AdminSessionUser> {
  return apiRequest<AdminSessionUser>('/api/admin/session/me', { authMode: 'cookie' })
}

export async function logoutAdminSession(): Promise<void> {
  await apiRequest<{ success: boolean }>('/api/admin/session/logout', { method: 'POST', authMode: 'cookie' })
}

export async function listAdminKeys(params?: PaginationParams): Promise<PaginatedResult<AdminKeyInfo>> {
  return apiRequest<PaginatedResult<AdminKeyInfo>>(`/api/admin/keys?${toPageQuery(params)}`, { authMode: 'cookie' })
}

export async function createAdminKey(payload: {
  name: string
  role: 'admin' | 'moderator'
}): Promise<{ item: AdminKeyInfo; key: string }> {
  return apiRequest<{ item: AdminKeyInfo; key: string }>('/api/admin/keys', {
    method: 'POST',
    body: payload,
    authMode: 'cookie',
  })
}

export async function rotateAdminKey(keyId: string): Promise<{ item: AdminKeyInfo; key: string }> {
  return apiRequest<{ item: AdminKeyInfo; key: string }>(`/api/admin/keys/${keyId}/rotate`, {
    method: 'POST',
    authMode: 'cookie',
  })
}

export async function revokeAdminKey(keyId: string): Promise<AdminKeyInfo> {
  return apiRequest<AdminKeyInfo>(`/api/admin/keys/${keyId}/revoke`, { method: 'POST', authMode: 'cookie' })
}

export async function deleteAdminKey(keyId: string): Promise<AdminKeyInfo> {
  return apiRequest<AdminKeyInfo>(`/api/admin/keys/${keyId}`, { method: 'DELETE', authMode: 'cookie' })
}

export async function updateAdminKey(
  keyId: string,
  payload: Partial<{ name: string; role: 'admin' | 'moderator' }>
): Promise<AdminKeyInfo> {
  return apiRequest<AdminKeyInfo>(`/api/admin/keys/${keyId}`, { method: 'PATCH', body: payload, authMode: 'cookie' })
}

export async function listAdminQrSales(params?: {
  driverId?: string
  userId?: string
  settlementStatus?: string
  redeemedOnly?: boolean
  limit?: number
  offset?: number
}): Promise<PaginatedResult<AdminQrSaleAudit>> {
  const search = new URLSearchParams()
  if (params?.driverId) search.set('driverId', params.driverId)
  if (params?.userId) search.set('userId', params.userId)
  if (params?.settlementStatus) search.set('settlementStatus', params.settlementStatus)
  if (typeof params?.redeemedOnly === 'boolean') search.set('redeemedOnly', String(params.redeemedOnly))
  search.set('limit', String(params?.limit ?? 100))
  search.set('offset', String(params?.offset ?? 0))
  return apiRequest<PaginatedResult<AdminQrSaleAudit>>(`/api/admin/qr-sales?${search.toString()}`, { authMode: 'cookie' })
}
