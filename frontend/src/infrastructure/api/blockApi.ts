import { apiRequest } from '../http/httpClient'
import type { BlockedUserApi } from './contracts'

export function blockUser(userId: string): Promise<{ success: boolean }> {
  return apiRequest('/api/users/me/blocks', {
    method: 'POST',
    body: { userId },
  })
}

export function unblockUser(userId: string): Promise<{ success: boolean }> {
  return apiRequest(`/api/users/me/blocks/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
  })
}

export async function listBlockedUsers(): Promise<{ items: BlockedUserApi[]; total: number }> {
  return apiRequest('/api/users/me/blocks')
}

export function blockUserAsDriver(userId: string): Promise<{ success: boolean }> {
  return apiRequest('/api/driver/cabinet/blocks', {
    method: 'POST',
    authMode: 'cookie',
    body: { userId },
  })
}

export function unblockUserAsDriver(userId: string): Promise<{ success: boolean }> {
  return apiRequest(`/api/driver/cabinet/blocks/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
    authMode: 'cookie',
  })
}

export async function listBlockedUsersAsDriver(): Promise<{ items: BlockedUserApi[]; total: number }> {
  return apiRequest('/api/driver/cabinet/blocks', { authMode: 'cookie' })
}
