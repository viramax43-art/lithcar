import type { AppNotification } from '../../types'
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

export interface AdminSendNotificationPayload {
  pool: 'passenger' | 'driver'
  mode: 'broadcast' | 'single'
  recipientId?: string
  title: string
  body: string
  sendTelegram: boolean
}

export interface AdminSendNotificationResult {
  sentCount: number
}

function passengerBase() {
  return '/api/notifications/passenger'
}

function adminBase() {
  return '/api/admin/notifications'
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

export async function sendAdminNotification(
  payload: AdminSendNotificationPayload,
): Promise<AdminSendNotificationResult> {
  return apiRequest<AdminSendNotificationResult>(`${adminBase()}/send`, {
    method: 'POST',
    body: payload,
    authMode: 'cookie',
  })
}
