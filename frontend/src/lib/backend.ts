import type {
  DriverCabinetData,
  Driver,
  GroupSuggestion,
  PricingSettings,
  RideRequest,
  ServiceZone,
  UserCabinetData,
  UserCabinetRideHistoryItem,
} from '../types'

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE'

interface ApiOptions {
  method?: HttpMethod
  body?: unknown
  authMode?: 'bearer' | 'cookie' | 'none'
}

interface TokenResponse {
  access_token: string
}

export interface PaginationParams {
  limit?: number
  offset?: number
}

export interface PaginatedResult<T> {
  items: T[]
  total: number
  limit: number
  offset: number
}

interface CurrentUser {
  user_id: string
  username: string | null
  role: string
  created_at: string
  onboarding_completed: boolean
}

export interface AdminSessionUser {
  role: 'chief_admin' | 'admin' | 'moderator'
  name: string
}

export interface AdminKeyInfo {
  id: string
  name: string
  role: string
  keyPrefix: string
  isActive: boolean
  createdAt: string
  lastUsedAt: string | null
}

export interface DriverSessionUser {
  driverId: string
  name: string
  canSellPoints: boolean
}

export interface DriverQrIssueResult {
  saleId: string
  token: string
  qrUrl: string
  points: number
  eurAmount: number
}

export interface DriverQrRedeemResult {
  success: boolean
  saleId: string
  pointsAdded: number
  pointsBalance: number
  eurAmount: number
  debtStatus: string
  driverId: string
  driverName: string
}

export interface AdminQrSaleAudit {
  saleId: string
  tokenPreview: string
  driverId: string
  driverName: string | null
  userId: string | null
  username: string | null
  pointsAmount: number
  eurAmount: number
  settlementStatus: string
  createdAt: string
  redeemedAt: string | null
  events: Array<{
    id: string
    action: string
    actorType: string
    actorId: string
    payload: Record<string, unknown>
    createdAt: string
  }>
}

interface RideRequestApi {
  id: string
  passengerId: string
  passengerName: string
  passengerPhone: string
  fromPoint: { address: string; latlng: { lat: number; lng: number } }
  toPoint: { address: string; latlng: { lat: number; lng: number } }
  dateTime: string
  status: RideRequest['status']
  groupId?: string
  driverId?: string
  createdAt: string
}

interface UserCabinetRideApi {
  id: string
  fromPoint: { address: string; latlng: { lat: number; lng: number } }
  toPoint: { address: string; latlng: { lat: number; lng: number } }
  status: RideRequest['status']
  dateTime: string
  createdAt: string
}

interface UserCabinetApi {
  userId: string
  username: string | null
  pointsBalance: number
  rideHistory: UserCabinetRideApi[]
  rideHistoryTotal: number
  rideHistoryLimit: number
  rideHistoryOffset: number
}

const TOKEN_KEY = 'ride_access_token'
const API_TARGET = ((import.meta.env.VITE_API_TARGET as string | undefined) ?? 'local').toLowerCase()
let tokenRefreshPromise: Promise<string> | null = null

function resolveApiBaseUrl(): string {
  const fallbackLocal = 'http://localhost:8000'
  const fallbackRemote = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? fallbackLocal
  const localUrl = (import.meta.env.VITE_API_BASE_URL_LOCAL as string | undefined) ?? fallbackLocal
  const remoteUrl = (import.meta.env.VITE_API_BASE_URL_REMOTE as string | undefined) ?? fallbackRemote
  return (API_TARGET === 'remote' ? remoteUrl : localUrl).replace(/\/$/, '')
}

const API_BASE_URL = resolveApiBaseUrl()
const ENABLE_BROWSER_TEST_AUTH =
  (import.meta.env.VITE_ENABLE_BROWSER_TEST_AUTH as string | undefined) ??
  (API_TARGET === 'remote' ? 'false' : 'true')

function getTelegramInitData(): string {
  const fromWindow = (window as Window & { Telegram?: { WebApp?: { initData?: string } } })
    .Telegram?.WebApp?.initData
  const fromEnv = (import.meta.env.VITE_TELEGRAM_INIT_DATA as string | undefined) ?? ''
  const fromStorage = localStorage.getItem('ride_init_data') ?? ''
  if (fromWindow || fromEnv || fromStorage) {
    return fromWindow || fromEnv || fromStorage
  }
  if (ENABLE_BROWSER_TEST_AUTH === 'false') {
    return ''
  }
  return 'test:7370074938:hrd:hrdlean'
}

export function clearAccessToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}

export function getAccessToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

function saveAccessToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

async function loginWithTelegramInitData(initData: string): Promise<string> {
  const response = await fetch(`${API_BASE_URL}/api/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ initData }),
  })
  if (!response.ok) {
    throw new Error('Не удалось выполнить авторизацию через Telegram initData.')
  }
  const body: TokenResponse = await response.json()
  saveAccessToken(body.access_token)
  return body.access_token
}

function getRequiredInitData(): string {
  const initData = getTelegramInitData()
  if (!initData) {
    throw new Error(
      'Не найден Telegram initData. Откройте приложение через Telegram или запишите initData в localStorage (ride_init_data).'
    )
  }
  return initData
}

async function refreshAccessToken(): Promise<string> {
  if (tokenRefreshPromise) {
    return tokenRefreshPromise
  }
  tokenRefreshPromise = (async () => {
    const initData = getRequiredInitData()
    return loginWithTelegramInitData(initData)
  })()
  try {
    return await tokenRefreshPromise
  } finally {
    tokenRefreshPromise = null
  }
}

export async function ensureAccessToken(forceRefresh = false): Promise<string> {
  const cachedToken = getAccessToken()
  if (cachedToken && !forceRefresh) return cachedToken
  return refreshAccessToken()
}

async function apiRequest<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const { method = 'GET', body, authMode = 'bearer' } = options

  const performRequest = async (forceRefreshToken = false): Promise<Response> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }

    if (authMode === 'bearer') {
      const token = await ensureAccessToken(forceRefreshToken)
      headers.Authorization = `Bearer ${token}`
    }

    return fetch(`${API_BASE_URL}${path}`, {
      method,
      credentials: authMode === 'cookie' ? 'include' : undefined,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  }

  let response = await performRequest(false)
  if (response.status === 401 && authMode === 'bearer') {
    clearAccessToken()
    response = await performRequest(true)
  }

  if (!response.ok) {
    const message = await response.text()
    if (response.status === 401 && authMode === 'bearer') {
      clearAccessToken()
    }
    throw new Error(message || `API request failed (${response.status})`)
  }

  if (response.status === 204) {
    return undefined as T
  }
  return (await response.json()) as T
}

function mapRideRequest(item: RideRequestApi): RideRequest {
  return {
    id: item.id,
    passengerName: item.passengerName,
    passengerPhone: item.passengerPhone,
    from: item.fromPoint,
    to: item.toPoint,
    dateTime: item.dateTime,
    status: item.status,
    groupId: item.groupId,
    driverId: item.driverId,
    createdAt: item.createdAt,
  }
}

function mapUserCabinetRide(item: UserCabinetRideApi): UserCabinetRideHistoryItem {
  return {
    id: item.id,
    from: item.fromPoint,
    to: item.toPoint,
    status: item.status,
    dateTime: item.dateTime,
    createdAt: item.createdAt,
  }
}

function toPageQuery(params?: PaginationParams): string {
  const limit = params?.limit ?? 50
  const offset = params?.offset ?? 0
  return `limit=${encodeURIComponent(String(limit))}&offset=${encodeURIComponent(String(offset))}`
}

export async function getCurrentUser(): Promise<CurrentUser> {
  return apiRequest<CurrentUser>('/api/users/me')
}

export async function listMyRequests(params?: PaginationParams): Promise<PaginatedResult<RideRequest>> {
  const page = await apiRequest<{ items: RideRequestApi[]; total: number; limit: number; offset: number }>(
    `/api/ride-requests/me?${toPageQuery(params)}`
  )
  return {
    items: page.items.map(mapRideRequest),
    total: page.total,
    limit: page.limit,
    offset: page.offset,
  }
}

export async function getRequestById(requestId: string): Promise<RideRequest> {
  const item = await apiRequest<RideRequestApi>(`/api/ride-requests/${requestId}`)
  return mapRideRequest(item)
}

export async function createRequest(payload: {
  passengerName: string
  passengerPhone: string
  from: { address: string; latlng: { lat: number; lng: number } }
  to: { address: string; latlng: { lat: number; lng: number } }
  dateTime: string
}): Promise<RideRequest> {
  const created = await apiRequest<RideRequestApi>('/api/ride-requests', {
    method: 'POST',
    body: {
      passengerName: payload.passengerName,
      passengerPhone: payload.passengerPhone,
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
    passengerPhone: string
    from: { address: string; latlng: { lat: number; lng: number } }
    to: { address: string; latlng: { lat: number; lng: number } }
    dateTime: string
  }>
): Promise<RideRequest> {
  const updated = await apiRequest<RideRequestApi>(`/api/ride-requests/${requestId}`, {
    method: 'PATCH',
    body: {
      passengerName: payload.passengerName,
      passengerPhone: payload.passengerPhone,
      fromPoint: payload.from,
      toPoint: payload.to,
      dateTime: payload.dateTime,
    },
  })
  return mapRideRequest(updated)
}

export async function deleteRequest(requestId: string): Promise<void> {
  await apiRequest<{ success: boolean }>(`/api/ride-requests/${requestId}`, { method: 'DELETE' })
}

export async function listAdminRequests(status: string, params?: PaginationParams): Promise<PaginatedResult<RideRequest>> {
  const statusPart = status && status !== 'all' ? `status=${encodeURIComponent(status)}&` : ''
  const page = await apiRequest<{ items: RideRequestApi[]; total: number; limit: number; offset: number }>(
    `/api/ride-requests?${statusPart}${toPageQuery(params)}`,
    { authMode: 'cookie' }
  )
  return {
    items: page.items.map(mapRideRequest),
    total: page.total,
    limit: page.limit,
    offset: page.offset,
  }
}

export interface RidePointOverride {
  requestId: string
  fromPoint?: { address: string; latlng: { lat: number; lng: number } }
  toPoint?: { address: string; latlng: { lat: number; lng: number } }
}

export async function assignDriverBulk(
  requestIds: string[],
  driverId: string,
  pointOverrides?: RidePointOverride[],
): Promise<RideRequest[]> {
  const body: { requestIds: string[]; driverId: string; pointOverrides?: RidePointOverride[] } = {
    requestIds,
    driverId,
  }
  if (pointOverrides && pointOverrides.length > 0) {
    body.pointOverrides = pointOverrides
  }
  const updated = await apiRequest<RideRequestApi[]>('/api/ride-requests/assign-bulk', {
    method: 'POST',
    body,
    authMode: 'cookie',
  })
  return updated.map(mapRideRequest)
}

export async function listDrivers(
  onlineOnly = false,
  params?: PaginationParams
): Promise<PaginatedResult<Driver>> {
  const onlinePart = onlineOnly ? 'onlineOnly=true&' : ''
  const page = await apiRequest<{ items: Driver[]; total: number; limit: number; offset: number }>(
    `/api/drivers?${onlinePart}${toPageQuery(params)}`,
    { authMode: 'cookie' }
  )
  return page
}

export async function createDriver(payload: {
  userId?: string
  name: string
  phone: string
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
  return apiRequest<{ driver: Driver; key: string }>('/api/drivers', {
    method: 'POST',
    body: payload,
    authMode: 'cookie',
  })
}

export async function rotateDriverKey(driverId: string): Promise<{ driver: Driver; key: string }> {
  return apiRequest<{ driver: Driver; key: string }>(`/api/drivers/${driverId}/rotate-key`, {
    method: 'POST',
    authMode: 'cookie',
  })
}

export async function uploadDriverPhoto(file: File): Promise<{ photoKey: string; photoUrl: string }> {
  const response = await fetch(`${API_BASE_URL}/api/drivers/photo`, {
    method: 'POST',
    credentials: 'include',
    body: (() => {
      const formData = new FormData()
      formData.append('file', file)
      return formData
    })(),
  })
  if (!response.ok) {
    const message = await response.text()
    throw new Error(message || `Upload failed (${response.status})`)
  }
  return (await response.json()) as { photoKey: string; photoUrl: string }
}

export async function updateDriver(
  driverId: string,
  payload: Partial<{
    name: string
    phone: string
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
  return apiRequest<Driver>(`/api/drivers/${driverId}`, {
    method: 'PATCH',
    body: payload,
    authMode: 'cookie',
  })
}

export async function deleteDriver(driverId: string): Promise<void> {
  await apiRequest<{ success: boolean }>(`/api/drivers/${driverId}`, {
    method: 'DELETE',
    authMode: 'cookie',
  })
}

export async function listServiceZones(
  authMode: 'bearer' | 'cookie' = 'bearer',
  params?: PaginationParams
): Promise<PaginatedResult<ServiceZone>> {
  const page = await apiRequest<{ items: ServiceZone[]; total: number; limit: number; offset: number }>(
    `/api/service-zones?${toPageQuery(params)}`,
    { authMode }
  )
  return page
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

export async function getPricing(authMode: 'bearer' | 'cookie' = 'bearer'): Promise<PricingSettings> {
  const result = await apiRequest<{ pointsPerRide: number; pointPriceCents: number }>('/api/pricing', { authMode })
  return { pointsPerRide: result.pointsPerRide, pointPriceCents: result.pointPriceCents }
}

export async function updatePricing(
  payload: Partial<Pick<PricingSettings, 'pointsPerRide' | 'pointPriceCents'>>
): Promise<PricingSettings> {
  const result = await apiRequest<{ pointsPerRide: number; pointPriceCents: number }>('/api/pricing', {
    method: 'PATCH',
    body: payload,
    authMode: 'cookie',
  })
  return { pointsPerRide: result.pointsPerRide, pointPriceCents: result.pointPriceCents }
}

export async function listGroupSuggestions(params?: PaginationParams): Promise<PaginatedResult<GroupSuggestion>> {
  return apiRequest<PaginatedResult<GroupSuggestion>>(`/api/group-suggestions?${toPageQuery(params)}`, { authMode: 'cookie' })
}

export async function loginAdminByKey(key: string): Promise<AdminSessionUser> {
  return apiRequest<AdminSessionUser>('/api/admin/session/login', {
    method: 'POST',
    body: { key },
    authMode: 'cookie',
  })
}

export async function getAdminSession(): Promise<AdminSessionUser> {
  return apiRequest<AdminSessionUser>('/api/admin/session/me', { authMode: 'cookie' })
}

export async function logoutAdminSession(): Promise<void> {
  await apiRequest<{ success: boolean }>('/api/admin/session/logout', {
    method: 'POST',
    authMode: 'cookie',
  })
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
  return apiRequest<AdminKeyInfo>(`/api/admin/keys/${keyId}/revoke`, {
    method: 'POST',
    authMode: 'cookie',
  })
}

export async function deleteAdminKey(keyId: string): Promise<AdminKeyInfo> {
  return apiRequest<AdminKeyInfo>(`/api/admin/keys/${keyId}`, {
    method: 'DELETE',
    authMode: 'cookie',
  })
}

export async function updateAdminKey(
  keyId: string,
  payload: Partial<{ name: string; role: 'admin' | 'moderator' }>
): Promise<AdminKeyInfo> {
  return apiRequest<AdminKeyInfo>(`/api/admin/keys/${keyId}`, {
    method: 'PATCH',
    body: payload,
    authMode: 'cookie',
  })
}

export async function getUserCabinet(params?: PaginationParams): Promise<UserCabinetData> {
  const response = await apiRequest<UserCabinetApi>(`/api/users/me/cabinet?${toPageQuery(params)}`)
  return {
    userId: response.userId,
    username: response.username,
    pointsBalance: response.pointsBalance,
    rideHistory: response.rideHistory.map(mapUserCabinetRide),
    rideHistoryTotal: response.rideHistoryTotal,
    rideHistoryLimit: response.rideHistoryLimit,
    rideHistoryOffset: response.rideHistoryOffset,
  }
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
  await apiRequest<{ success: boolean }>('/api/driver/session/logout', {
    method: 'POST',
    authMode: 'cookie',
  })
}

export async function getDriverCabinet(params?: PaginationParams): Promise<DriverCabinetData> {
  return apiRequest<DriverCabinetData>(`/api/driver/cabinet?${toPageQuery(params)}`, { authMode: 'cookie' })
}

export async function setDriverRideStatus(
  rideId: string,
  status: import('../types').RideStatus,
): Promise<import('../types').DriverCabinetRide> {
  return apiRequest<import('../types').DriverCabinetRide>(
    `/api/driver/cabinet/rides/${rideId}/status`,
    {
      method: 'PATCH',
      body: { status },
      authMode: 'cookie',
    },
  )
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

export async function redeemDriverQrSale(token: string): Promise<DriverQrRedeemResult> {
  return apiRequest<DriverQrRedeemResult>('/api/points/qr/redeem', {
    method: 'POST',
    body: { token },
  })
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
  return apiRequest<PaginatedResult<AdminQrSaleAudit>>(`/api/admin/qr-sales?${search.toString()}`, {
    authMode: 'cookie',
  })
}
