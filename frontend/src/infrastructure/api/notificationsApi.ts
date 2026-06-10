import type { AppNotification, InfoBlock, UserInfoTextI18n } from '../../types'
import { apiRequest } from '../http/httpClient'
import type { PaginatedResult, PaginationParams } from './contracts'
import { toPageQuery } from './sharedMappers'

interface NotificationPageApi {
  items: AppNotification[]
  total: number
  limit: number
  offset: number
}

interface UnreadCountApi {
  count: number
}

interface InfoBlockPageApi {
  items: InfoBlock[]
  total: number
}

export interface CreateInfoBlockPayload {
  pool: 'passenger' | 'driver'
  titleI18n: UserInfoTextI18n
  bodyI18n: UserInfoTextI18n
  audience?: 'all' | 'user'
  targetUsername?: string | null
}

export interface NotificationListParams extends PaginationParams {
  unreadOnly?: boolean
  lang?: string
}

function notificationQuery(params?: NotificationListParams): string {
  const parts: string[] = []
  if (params?.unreadOnly) parts.push('unreadOnly=true')
  if (params?.lang) parts.push(`lang=${encodeURIComponent(params.lang)}`)
  const page = toPageQuery(params)
  if (page) parts.push(page.replace(/^&/, ''))
  return parts.length > 0 ? `${parts.join('&')}` : ''
}

function withNotificationQuery(base: string, params?: NotificationListParams): string {
  const query = notificationQuery(params)
  return query ? `${base}?${query}` : base
}

function passengerBase() {
  return '/api/notifications/passenger'
}

function adminBase() {
  return '/api/admin/notifications'
}

function infoBlocksBase() {
  return '/api/admin/info-blocks'
}

export async function listPassengerNotifications(
  params?: NotificationListParams,
): Promise<PaginatedResult<AppNotification>> {
  return apiRequest<NotificationPageApi>(withNotificationQuery(passengerBase(), params))
}

export async function getPassengerUnreadCount(): Promise<number> {
  const result = await apiRequest<UnreadCountApi>(`${passengerBase()}/unread-count`)
  return result.count
}

export async function markPassengerNotificationRead(
  notificationId: string,
  lang?: string,
): Promise<AppNotification> {
  const suffix = lang ? `?lang=${encodeURIComponent(lang)}` : ''
  return apiRequest<AppNotification>(`${passengerBase()}/${notificationId}/read${suffix}`, { method: 'PATCH' })
}

export async function markAllPassengerNotificationsRead(): Promise<void> {
  await apiRequest<UnreadCountApi>(`${passengerBase()}/read-all`, { method: 'POST' })
}

export async function listDriverNotifications(
  params?: NotificationListParams,
): Promise<PaginatedResult<AppNotification>> {
  return apiRequest<NotificationPageApi>(withNotificationQuery('/api/driver/notifications', params), {
    authMode: 'cookie',
  })
}

export async function getDriverUnreadCount(): Promise<number> {
  const result = await apiRequest<UnreadCountApi>('/api/driver/notifications/unread-count', { authMode: 'cookie' })
  return result.count
}

export async function markDriverNotificationRead(
  notificationId: string,
  lang?: string,
): Promise<AppNotification> {
  const suffix = lang ? `?lang=${encodeURIComponent(lang)}` : ''
  return apiRequest<AppNotification>(`/api/driver/notifications/${notificationId}/read${suffix}`, {
    method: 'PATCH',
    authMode: 'cookie',
  })
}

export async function markAllDriverNotificationsRead(): Promise<void> {
  await apiRequest<UnreadCountApi>('/api/driver/notifications/read-all', { method: 'POST', authMode: 'cookie' })
}

export async function listAdminNotifications(
  params?: NotificationListParams,
): Promise<PaginatedResult<AppNotification>> {
  return apiRequest<NotificationPageApi>(withNotificationQuery(adminBase(), params), { authMode: 'cookie' })
}

export async function getAdminUnreadCount(): Promise<number> {
  const result = await apiRequest<UnreadCountApi>(`${adminBase()}/unread-count`, { authMode: 'cookie' })
  return result.count
}

export async function markAdminNotificationRead(
  notificationId: string,
  lang?: string,
): Promise<AppNotification> {
  const suffix = lang ? `?lang=${encodeURIComponent(lang)}` : ''
  return apiRequest<AppNotification>(`${adminBase()}/${notificationId}/read${suffix}`, {
    method: 'PATCH',
    authMode: 'cookie',
  })
}

export async function markAllAdminNotificationsRead(): Promise<void> {
  await apiRequest<UnreadCountApi>(`${adminBase()}/read-all`, { method: 'POST', authMode: 'cookie' })
}

export async function listAdminInfoBlocks(pool: 'passenger' | 'driver'): Promise<InfoBlock[]> {
  const result = await apiRequest<InfoBlockPageApi>(`${infoBlocksBase()}?pool=${pool}`, { authMode: 'cookie' })
  return result.items
}

export async function createAdminInfoBlock(payload: CreateInfoBlockPayload): Promise<InfoBlock> {
  return apiRequest<InfoBlock>(infoBlocksBase(), {
    method: 'POST',
    body: payload,
    authMode: 'cookie',
  })
}

export async function deleteAdminInfoBlock(infoBlockId: string): Promise<void> {
  await apiRequest<void>(`${infoBlocksBase()}/${infoBlockId}`, { method: 'DELETE', authMode: 'cookie' })
}
