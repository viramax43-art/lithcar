import type { DriverApplication, DriverRegistrationFormSchema } from '../../types'
import { apiRequest, uploadMultipartBearer } from '../http/httpClient'
import type { PaginatedResult, PaginationParams } from './contracts'
import { toPageQuery } from './sharedMappers'

export async function getDriverRegistrationForm(): Promise<DriverRegistrationFormSchema> {
  return apiRequest<DriverRegistrationFormSchema>('/api/driver-registration/form', { authMode: 'none' })
}

export async function getMyDriverApplication(): Promise<DriverApplication | null> {
  return apiRequest<DriverApplication | null>('/api/driver-registration/applications/me')
}

export async function getDriverCabinetEnterUrl(): Promise<{ enterUrl: string }> {
  return apiRequest<{ enterUrl: string }>('/api/driver-registration/driver-access/enter-url')
}

export async function submitDriverApplication(payload: {
  language: 'lt' | 'pl' | 'en' | 'ru'
  answers: Record<string, string>
  files: Record<string, { objectKey: string; fileName: string; contentType: string; sizeBytes: number }>
}): Promise<DriverApplication> {
  return apiRequest<DriverApplication>('/api/driver-registration/applications', {
    method: 'POST',
    body: payload,
  })
}

export async function uploadDriverApplicationFile(file: File): Promise<{
  objectKey: string
  fileName: string
  contentType: string
  sizeBytes: number
  fileUrl: string
}> {
  const formData = new FormData()
  formData.append('file', file)
  return uploadMultipartBearer('/api/driver-registration/files', formData)
}

export async function listDriverApplications(
  params?: PaginationParams & { status?: string },
): Promise<PaginatedResult<DriverApplication> & { pendingCount: number }> {
  const statusPart = params?.status ? `status=${encodeURIComponent(params.status)}&` : ''
  return apiRequest<PaginatedResult<DriverApplication> & { pendingCount: number }>(
    `/api/driver-registration/applications?${statusPart}${toPageQuery(params)}`,
    { authMode: 'cookie' },
  )
}

export async function getDriverApplication(applicationId: string): Promise<DriverApplication> {
  return apiRequest<DriverApplication>(`/api/driver-registration/applications/${applicationId}`, {
    authMode: 'cookie',
  })
}

export async function approveDriverApplication(applicationId: string): Promise<{
  application: DriverApplication
  key: string
}> {
  return apiRequest<{ application: DriverApplication; key: string }>(
    `/api/driver-registration/applications/${applicationId}/approve`,
    { method: 'POST', authMode: 'cookie' },
  )
}

export async function rejectDriverApplication(
  applicationId: string,
  rejectionReason?: string,
): Promise<DriverApplication> {
  return apiRequest<DriverApplication>(`/api/driver-registration/applications/${applicationId}/reject`, {
    method: 'POST',
    body: { rejectionReason: rejectionReason ?? null },
    authMode: 'cookie',
  })
}

export async function getDriverRegistrationSettings(): Promise<DriverRegistrationFormSchema> {
  return apiRequest<DriverRegistrationFormSchema>('/api/driver-registration/settings', { authMode: 'cookie' })
}

export async function updateDriverRegistrationSettings(
  schema: DriverRegistrationFormSchema,
): Promise<DriverRegistrationFormSchema> {
  return apiRequest<DriverRegistrationFormSchema>('/api/driver-registration/settings', {
    method: 'PUT',
    body: schema,
    authMode: 'cookie',
  })
}
