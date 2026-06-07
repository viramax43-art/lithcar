import { resolveDriverFormText } from './driverFormText'
import type { DriverApplication, DriverRegistrationFormSchema, DriverFormDriverField } from '../types'

function findFieldByDriverField(
  schema: DriverRegistrationFormSchema,
  driverField: DriverFormDriverField,
) {
  return schema.fields.find((field) => field.driverField === driverField)
}

export function getApplicationAnswer(
  application: DriverApplication,
  schema: DriverRegistrationFormSchema,
  driverField: DriverFormDriverField,
): string | null {
  const field = findFieldByDriverField(schema, driverField)
  if (!field) return null
  const value = application.answers[field.id]?.trim()
  return value || null
}

export function getApplicationDisplayName(
  application: DriverApplication,
  schema: DriverRegistrationFormSchema,
  fallback: string,
): string {
  const name = getApplicationAnswer(application, schema, 'name')
  if (name) return name
  if (application.username) return `@${application.username}`
  const firstAnswer = Object.values(application.answers).map((v) => v.trim()).find(Boolean)
  return firstAnswer || fallback
}

export function getApplicationCarSummary(
  application: DriverApplication,
  schema: DriverRegistrationFormSchema,
): string | null {
  const brand = getApplicationAnswer(application, schema, 'carBrand')
  const model = getApplicationAnswer(application, schema, 'carModel')
  const plate = getApplicationAnswer(application, schema, 'carPlate')
  const car = [brand, model].filter(Boolean).join(' ')
  if (car && plate) return `${car} · ${plate}`
  return car || plate || null
}

export function getOrderedApplicationFields(
  application: DriverApplication,
  schema: DriverRegistrationFormSchema,
  uiLanguage: string,
) {
  const sorted = [...schema.fields].sort((a, b) => a.order - b.order)
  return sorted
    .map((field) => {
      const label =
        resolveDriverFormText(field.label, uiLanguage) ||
        resolveDriverFormText(field.label, application.language)
      if (field.type === 'file') {
        const file = application.files[field.id]
        if (!file) return null
        return { field, label, file, value: null as string | null }
      }
      const value = application.answers[field.id]?.trim()
      if (!value) return null
      return { field, label, file: null, value }
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
}

export function resolveApplicationFileUrl(fileUrl: string, apiBase: string): string {
  return fileUrl.startsWith('http') ? fileUrl : `${apiBase}${fileUrl}`
}

export function isImageFile(contentType: string, fileName: string): boolean {
  if (contentType.startsWith('image/')) return true
  return /\.(jpe?g|png|gif|webp|heic)$/i.test(fileName)
}
