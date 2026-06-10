import type { AppNotification, InfoBlock } from '../../types'
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
  title: string
  body: string
  audience?: 'all' | 'user'
  targetUsername?: string | null
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
  params?: PaginationParams & { unreadOnly?: boolean },
): Promise<PaginatedResult<AppNotification>> {
  const unreadPart = params?.unreadOnly ? 'unreadOnly=true&' : ''
  return apiRequest<NotificationPageApi>(`${passengerBase()}?${unreadPart}${toPageQuery(params)}`)
}

export async function getPassengerUnreadCount(): Promise<number> {
  const result = await apiRequest<UnreadCountApi>(`${passengerBase()}/unread-count`)
  return result.count
}

export async function markPassengerNotificationRead(notificationId: string): Promise<AppNotification> {
  return apiRequest<AppNotification>(`${passengerBase()}/${notificationId}/read`, { method: 'PATCH' })
}

export async function markAllPassengerNotificationsRead(): Promise<void> {
  await apiRequest<UnreadCountApi>(`${passengerBase()}/read-all`, { method: 'POST' })
}

export async function listDriverNotifications(
  params?: PaginationParams & { unreadOnly?: boolean },
): Promise<PaginatedResult<AppNotification>> {
  const unreadPart = params?.unreadOnly ? 'unreadOnly=true&' : ''
  return apiRequest<NotificationPageApi>(`/api/driver/notifications?${unreadPart}${toPageQuery(params)}`, {
    authMode: 'cookie',
  })
}

export async function getDriverUnreadCount(): Promise<number> {
  const result = await apiRequest<UnreadCountApi>('/api/driver/notifications/unread-count', { authMode: 'cookie' })
  return result.count
}

export async function markDriverNotificationRead(notificationId: string): Promise<AppNotification> {
  return apiRequest<AppNotification>(`/api/driver/notifications/${notificationId}/read`, {
    method: 'PATCH',
    authMode: 'cookie',
  })
}

export async function markAllDriverNotificationsRead(): Promise<void> {
  await apiRequest<UnreadCountApi>('/api/driver/notifications/read-all', { method: 'POST', authMode: 'cookie' })
}

export async function listAdminNotifications(
  params?: PaginationParams & { unreadOnly?: boolean },
): Promise<PaginatedResult<AppNotification>> {
  const unreadPart = params?.unreadOnly ? 'unreadOnly=true&' : ''
  return apiRequest<NotificationPageApi>(`${adminBase()}?${unreadPart}${toPageQuery(params)}`, { authMode: 'cookie' })
}

export async function getAdminUnreadCount(): Promise<number> {
  const result = await apiRequest<UnreadCountApi>(`${adminBase()}/unread-count`, { authMode: 'cookie' })
  return result.count
}

export async function markAdminNotificationRead(notificationId: string): Promise<AppNotification> {
  return apiRequest<AppNotification>(`${adminBase()}/${notificationId}/read`, {
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
