import { mapPricingSettings } from '../../lib/pricingDefaults'
import type { Driver, MapMark, PricingSettings, RideQuote, RideRequest, ServiceZone } from '../../types'
import { apiRequest, uploadMultipart } from '../http/httpClient'
import type {
  AdminKeyInfo,
  AdminPanelAccess,
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

export async function patchAdminRideRoute(
  requestId: string,
  payload: {
    fromPoint?: { address: string; latlng: { lat: number; lng: number } }
    toPoint?: { address: string; latlng: { lat: number; lng: number } }
  },
): Promise<RideRequest> {
  const updated = await apiRequest<RideRequestApi>(`/api/ride-requests/${requestId}/route`, {
    method: 'PATCH',
    body: payload,
    authMode: 'cookie',
  })
  return mapRideRequest(updated)
}

export async function assignDriverBulk(
  requestIds: string[],
  driverId: string,
  pointOverrides?: RidePointOverride[],
): Promise<RideRequest[]> {
  const body: { requestIds: string[]; driverId: string; pointOverrides?: RidePointOverride[] } = { requestIds, driverId }
  if (pointOverrides && pointOverrides.length > 0) body.pointOverrides = pointOverrides
  const updated = await apiRequest<RideRequestApi[]>('/api/v1/ride-requests/assign-bulk', {
    method: 'POST',
    body,
    authMode: 'cookie',
  })
  return updated.map(mapRideRequest)
}

export async function unassignAdminDriver(requestId: string): Promise<RideRequest> {
  const updated = await apiRequest<RideRequestApi>(
    `/api/ride-requests/${encodeURIComponent(requestId)}/assignment`,
    { method: 'DELETE', authMode: 'cookie' },
  )
  return mapRideRequest(updated)
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
  isOnline?: boolean
  canSellPoints?: boolean
  canSelfAssign?: boolean
}): Promise<{ driver: Driver; key: string }> {
  return apiRequest<{ driver: Driver; key: string }>('/api/v1/drivers', { method: 'POST', body: payload, authMode: 'cookie' })
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
  return uploadMultipart('/api/v1/drivers/photo', formData)
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
    isOnline: boolean
    canSellPoints: boolean
    canSelfAssign: boolean
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
  directionFrom?: string | null
  directionTo?: string | null
}): Promise<ServiceZone> {
  return apiRequest<ServiceZone>('/api/v1/service-zones', { method: 'POST', body: payload, authMode: 'cookie' })
}

export async function updateServiceZone(
  zoneId: string,
  payload: Partial<Pick<ServiceZone, 'name' | 'color' | 'polygon' | 'isActive' | 'directionFrom' | 'directionTo'>>
): Promise<ServiceZone> {
  return apiRequest<ServiceZone>(`/api/service-zones/${zoneId}`, { method: 'PATCH', body: payload, authMode: 'cookie' })
}

export async function deleteServiceZone(zoneId: string): Promise<void> {
  await apiRequest<{ success: boolean }>(`/api/service-zones/${zoneId}`, { method: 'DELETE', authMode: 'cookie' })
}

export async function updatePricing(
  payload: Partial<
    Pick<
      PricingSettings,
      | 'pointsPerRide'
      | 'pointPriceCents'
      | 'pricingMode'
      | 'pricingFormula'
      | 'userInfoText'
      | 'userInfoTextProfile'
      | 'workStartTime'
      | 'workEndTime'
      | 'slotIntervalMinutes'
    >
  >,
): Promise<PricingSettings> {
  const result = await apiRequest<PricingSettings>('/api/v1/pricing', {
    method: 'PATCH',
    body: payload,
    authMode: 'cookie',
  })
  return mapPricingSettings(result)
}

export async function getRideQuoteAdmin(params: {
  fromLat: number
  fromLng: number
  toLat: number
  toLng: number
}): Promise<RideQuote> {
  const q = new URLSearchParams({
    fromLat: String(params.fromLat),
    fromLng: String(params.fromLng),
    toLat: String(params.toLat),
    toLng: String(params.toLng),
  })
  return apiRequest(`/api/ride-quote?${q}`, { authMode: 'cookie' })
}

export async function loginAdminByKey(key: string): Promise<AdminSessionUser> {
  return apiRequest<AdminSessionUser>('/api/v1/admin/session/login', { method: 'POST', body: { key }, authMode: 'cookie' })
}

export async function getAdminSession(): Promise<AdminSessionUser> {
  return apiRequest<AdminSessionUser>('/api/v1/admin/session/me', { authMode: 'cookie' })
}

/**
 * Passwordless staff sign-in from the Telegram Mini App.
 * Identity comes from `initData` (when provided) or from the passenger session cookie.
 */
export async function bootstrapAdminSession(initData?: string): Promise<AdminSessionUser> {
  return apiRequest<AdminSessionUser>('/api/v1/admin/session/bootstrap', {
    method: 'POST',
    body: initData ? { initData } : {},
    authMode: 'cookie',
  })
}

/** Mini App helper: is the current Telegram/passenger user a staff member? */
export async function getAdminPanelAccess(): Promise<AdminPanelAccess> {
  return apiRequest<AdminPanelAccess>('/api/v1/admin/session/access', { authMode: 'bearer' })
}

export async function logoutAdminSession(): Promise<void> {
  await apiRequest<{ success: boolean }>('/api/v1/admin/session/logout', { method: 'POST', authMode: 'cookie' })
}

export async function listAdminKeys(params?: PaginationParams): Promise<PaginatedResult<AdminKeyInfo>> {
  return apiRequest<PaginatedResult<AdminKeyInfo>>(`/api/admin/keys?${toPageQuery(params)}`, { authMode: 'cookie' })
}

export async function createAdminKey(payload: {
  name: string
  role: 'admin' | 'moderator'
}): Promise<{ item: AdminKeyInfo; key: string }> {
  return apiRequest<{ item: AdminKeyInfo; key: string }>('/api/v1/admin/keys', {
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
  payload: Partial<{ name: string; role: 'admin' | 'moderator'; telegramUsername: string }>
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

export async function listMapMarks(params?: PaginationParams): Promise<PaginatedResult<MapMark>> {
  return apiRequest<PaginatedResult<MapMark>>(`/api/map-marks?${toPageQuery(params)}`, { authMode: 'cookie' })
}

export async function createMapMark(payload: {
  title: string
  color: string
  position: { lat: number; lng: number }
  visibility: 'admin_only' | 'public'
  photoKey?: string
}): Promise<MapMark> {
  return apiRequest<MapMark>('/api/v1/map-marks', {
    method: 'POST',
    body: payload,
    authMode: 'cookie',
  })
}

export async function deleteMapMark(markId: string): Promise<void> {
  await apiRequest<{ success: boolean }>(`/api/map-marks/${markId}`, { method: 'DELETE', authMode: 'cookie' })
}

export async function uploadMapMarkPhoto(file: File): Promise<{ photoKey: string; photoUrl: string }> {
  const formData = new FormData()
  formData.append('file', file)
  return uploadMultipart('/api/v1/map-marks/photo', formData)
}

export interface AdminPassenger {
  userId: string
  username: string | null
  displayName: string | null
  role: string
  language: string
  pointsBalance: number
  rating: number | null
  ratingCount: number
}

export async function getPlatformSettings(): Promise<import('../../lib/platformSettingsDefaults').PlatformSettingsConfig> {
  return apiRequest('/api/admin/platform-settings', { authMode: 'cookie' })
}

export async function updatePlatformSettings(
  patch: Partial<import('../../lib/platformSettingsDefaults').PlatformSettingsConfig>,
): Promise<import('../../lib/platformSettingsDefaults').PlatformSettingsConfig> {
  return apiRequest('/api/admin/platform-settings', {
    method: 'PATCH',
    body: patch,
    authMode: 'cookie',
  })
}

export async function purgeHistory(days?: number): Promise<{ deleted: number }> {
  return apiRequest<{ deleted: number }>('/api/admin/system/purge-history', {
    method: 'POST',
    body: days !== undefined ? { days } : {},
    authMode: 'cookie',
  })
}

export async function listAdminPassengers(
  q = '',
  params?: PaginationParams,
): Promise<PaginatedResult<AdminPassenger>> {
  const search = new URLSearchParams(toPageQuery(params))
  if (q.trim()) search.set('q', q.trim())
  return apiRequest<PaginatedResult<AdminPassenger>>(`/api/admin/passengers?${search.toString()}`, {
    authMode: 'cookie',
  })
}

export async function adjustPassengerPoints(
  userId: string,
  payload: { delta?: number; absolute?: number; reason?: string },
): Promise<AdminPassenger> {
  return apiRequest<AdminPassenger>(`/api/admin/passengers/${encodeURIComponent(userId)}/points`, {
    method: 'PATCH',
    body: payload,
    authMode: 'cookie',
  })
}

export interface RideBrief {
  id: string
  rideNumber: number
  fromAddress: string
  toAddress: string
  dateTime: string
  status: string
  driverId: string | null
  quotedPoints: number | null
  quotedPriceCents: number | null
}

export interface PointsTxnBrief {
  id: string
  amount: number
  transactionType: string
  createdAt: string
}

export interface DossierDriverProfile {
  id: string
  name: string
  carBrand: string
  carModel: string
  carPlate: string
  vehicleColor: string
  seatsCount: number
  about: string
  rating: number
  isOnline: boolean
  canSellPoints: boolean
  canSelfAssign: boolean
}

export interface UserDossier {
  userId: string
  username: string | null
  role: string
  language: string
  pointsBalance: number
  rating: number | null
  ratingCount: number
  createdAt: string
  onboardingCompleted: boolean
  blockedByCount: number
  blockingCount: number
  driver: DossierDriverProfile | null
  ridesAsPassenger: RideBrief[]
  ridesAsDriver: RideBrief[]
  pointsTransactions: PointsTxnBrief[]
}

export async function getUserDossier(userId: string): Promise<UserDossier> {
  return apiRequest<UserDossier>(`/api/admin/passengers/${encodeURIComponent(userId)}/dossier`, {
    authMode: 'cookie',
  })
}
