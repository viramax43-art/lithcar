import { CaretDown, CaretRight, CaretUp, FloppyDisk, Plus, Trash } from '@phosphor-icons/react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { SUPPORTED_LANGUAGES } from '../../../i18n/languages'
import { formatDate, formatTime } from '../../../i18n/dateTime'
import { getApplicationCarSummary, getApplicationDisplayName } from '../../../lib/driverApplicationDisplay'
import { EMPTY_USER_INFO_TEXT } from '../../../lib/userInfoText'
import type { DriverApplication, DriverRegistrationFormField, DriverRegistrationFormSchema } from '../../../types'
import AdminDriverApplicationDetail from './AdminDriverApplicationDetail'
import { inputCls, KeyReveal, Section, type CopyState } from './AdminSidebarShared'

type AdminSidebarDriverRegistrationSectionProps = {
  activeTab: string
  applications: DriverApplication[]
  pendingCount: number
  formSchema: DriverRegistrationFormSchema
  lastApprovedDriverKey: string | null
  copyState: CopyState
  copiedToken: string | null
  copyText: (value: string, token: string) => Promise<void>
  onRefresh: () => Promise<void>
  onSaveFormSchema: (schema: DriverRegistrationFormSchema) => Promise<void>
  onApproveApplication: (applicationId: string) => Promise<string>
  onRejectApplication: (applicationId: string, reason?: string) => Promise<void>
}

const FIELD_TYPES = ['text', 'textarea', 'file'] as const
const DRIVER_FIELDS = ['', 'name', 'carBrand', 'carModel', 'carPlate', 'vehicleColor', 'seatsCount', 'licenseNumber', 'about', 'photo'] as const

function makeFieldId(): string {
  return `field_${Date.now().toString(36)}`
}

export function AdminSidebarDriverRegistrationSection({
  activeTab,
  applications,
  pendingCount,
  formSchema,
  lastApprovedDriverKey,
  copyState,
  copiedToken,
  copyText,
  onRefresh,
  onSaveFormSchema,
  onApproveApplication,
  onRejectApplication,
}: AdminSidebarDriverRegistrationSectionProps) {
  const { t } = useTranslation()
  const [showBuilder, setShowBuilder] = useState(false)
  const [draft, setDraft] = useState<DriverRegistrationFormSchema>(formSchema)
  const [expandedFieldId, setExpandedFieldId] = useState<string | null>(null)
  const [selectedApplication, setSelectedApplication] = useState<DriverApplication | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    setDraft(formSchema)
  }, [formSchema])

  const pendingApplications = useMemo(
    () => applications.filter((item) => item.status === 'pending'),
    [applications],
  )

  if (activeTab !== 'drivers') return null

  const updateField = (fieldId: string, patch: Partial<DriverRegistrationFormField>) => {
    setDraft((prev) => ({
      ...prev,
      fields: prev.fields.map((field) => (field.id === fieldId ? { ...field, ...patch } : field)),
    }))
  }

  const moveField = (fieldId: string, direction: -1 | 1) => {
    setDraft((prev) => {
      const sorted = [...prev.fields].sort((a, b) => a.order - b.order)
      const index = sorted.findIndex((field) => field.id === fieldId)
      const target = index + direction
      if (index < 0 || target < 0 || target >= sorted.length) return prev
      const next = [...sorted]
      const temp = next[index].order
      next[index] = { ...next[index], order: next[target].order }
      next[target] = { ...next[target], order: temp }
      return { ...prev, fields: next }
    })
  }

  const addField = () => {
    const nextOrder = draft.fields.length
    const newField: DriverRegistrationFormField = {
      id: makeFieldId(),
      type: 'text',
      required: false,
      order: nextOrder,
      label: { ...EMPTY_USER_INFO_TEXT, en: 'New field' },
      placeholder: { ...EMPTY_USER_INFO_TEXT },
      helpText: { ...EMPTY_USER_INFO_TEXT },
      driverField: null,
    }
    setDraft((prev) => ({ ...prev, fields: [...prev.fields, newField] }))
    setExpandedFieldId(newField.id)
  }

  const removeField = (fieldId: string) => {
    setDraft((prev) => ({ ...prev, fields: prev.fields.filter((field) => field.id !== fieldId) }))
  }

  const handleSave = async () => {
    setIsSaving(true)
    setErrorMessage(null)
    try {
      await onSaveFormSchema(draft)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t('common.error'))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <>
      <Section
        title={
          pendingCount > 0
            ? `${t('admin.driverApplications.title')} (${pendingCount})`
            : t('admin.driverApplications.title')
        }
      >
        {pendingApplications.length === 0 ? (
          <p className="text-xs text-muted">{t('admin.driverApplications.empty')}</p>
        ) : (
          <div className="space-y-2">
            {pendingApplications.map((application) => {
              const name = getApplicationDisplayName(
                application,
                formSchema,
                t('admin.driverApplications.unknownApplicant', { defaultValue: 'New driver' }),
              )
              const carSummary = getApplicationCarSummary(application, formSchema)
              const submittedAt = new Date(application.createdAt)
              return (
                <button
                  key={application.id}
                  type="button"
                  onClick={() => setSelectedApplication(application)}
                  className="w-full text-left rounded-xl border border-border bg-surface px-3 py-3 hover:border-black/20 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-black truncate">{name}</p>
                      {carSummary && (
                        <p className="text-xs text-muted mt-0.5 truncate">{carSummary}</p>
                      )}
                      <p className="text-[11px] text-muted mt-1">
                        {formatDate(submittedAt, { day: 'numeric', month: 'short' })},{' '}
                        {formatTime(submittedAt, { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-pill bg-amber-100 text-amber-800">
                        {t('admin.driverApplications.status.pending', { defaultValue: 'Under review' })}
                      </span>
                      <CaretRight size={14} className="text-muted" />
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}
        {lastApprovedDriverKey && (
          <div className="mt-3">
            <KeyReveal
              title={t('admin.driverApplications.lastApprovedKey')}
              value={lastApprovedDriverKey}
              onCopy={() => void copyText(lastApprovedDriverKey, 'driver-application:lastApproved')}
              copied={copiedToken === 'driver-application:lastApproved' && copyState === 'ok'}
              copyError={copiedToken === 'driver-application:lastApproved' && copyState === 'error'}
            />
          </div>
        )}
      </Section>

      <Section title={t('admin.driverFormBuilder.title')}>
        <button
          type="button"
          onClick={() => setShowBuilder((value) => !value)}
          className="w-full flex items-center justify-between rounded-xl border border-border bg-surface px-3 py-2.5 text-sm font-semibold"
        >
          <span>{showBuilder ? t('admin.driverFormBuilder.hide') : t('admin.driverFormBuilder.open')}</span>
          <CaretDown size={14} className={`transition-transform ${showBuilder ? 'rotate-180' : ''}`} />
        </button>

        {showBuilder && (
          <div className="mt-3 space-y-3">
            <label className="block">
              <span className="text-xs font-bold text-muted">{t('admin.driverFormBuilder.introText')}</span>
              {SUPPORTED_LANGUAGES.map((lang) => (
                <textarea
                  key={lang}
                  value={draft.introText[lang]}
                  onChange={(event) =>
                    setDraft((prev) => ({
                      ...prev,
                      introText: { ...prev.introText, [lang]: event.target.value },
                    }))
                  }
                  rows={2}
                  className={`${inputCls} mt-1`}
                  placeholder={`${t(`language.${lang}`)}`}
                />
              ))}
            </label>

            <div className="space-y-2">
              {draft.fields
                .slice()
                .sort((a, b) => a.order - b.order)
                .map((field) => {
                  const expanded = expandedFieldId === field.id
                  return (
                    <div key={field.id} className="rounded-xl border border-border bg-white">
                      <button
                        type="button"
                        onClick={() => setExpandedFieldId(expanded ? null : field.id)}
                        className="w-full px-3 py-2.5 flex items-center justify-between gap-2 text-left"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-semibold truncate">{field.label.en || field.id}</p>
                          <p className="text-[11px] text-muted">{field.type} · {field.required ? 'required' : 'optional'}</p>
                        </div>
                        <CaretDown size={14} className={`text-muted transition-transform ${expanded ? 'rotate-180' : ''}`} />
                      </button>
                      {expanded && (
                        <div className="px-3 pb-3 space-y-2 border-t border-border pt-3">
                          <div className="grid grid-cols-2 gap-2">
                            <label className="block col-span-2">
                              <span className="text-[11px] font-bold text-muted">ID</span>
                              <input
                                value={field.id}
                                onChange={(event) => updateField(field.id, { id: event.target.value })}
                                className={`${inputCls} mt-1`}
                              />
                            </label>
                            <label className="block">
                              <span className="text-[11px] font-bold text-muted">{t('admin.driverFormBuilder.type')}</span>
                              <select
                                value={field.type}
                                onChange={(event) => updateField(field.id, { type: event.target.value as DriverRegistrationFormField['type'] })}
                                className={`${inputCls} mt-1`}
                              >
                                {FIELD_TYPES.map((type) => (
                                  <option key={type} value={type}>{type}</option>
                                ))}
                              </select>
                            </label>
                            <label className="block">
                              <span className="text-[11px] font-bold text-muted">{t('admin.driverFormBuilder.driverField')}</span>
                              <select
                                value={field.driverField ?? ''}
                                onChange={(event) =>
                                  updateField(field.id, {
                                    driverField: (event.target.value || null) as DriverRegistrationFormField['driverField'],
                                  })
                                }
                                className={`${inputCls} mt-1`}
                              >
                                {DRIVER_FIELDS.map((value) => (
                                  <option key={value || 'none'} value={value}>
                                    {value || t('admin.driverFormBuilder.noBinding')}
                                  </option>
                                ))}
                              </select>
                            </label>
                          </div>
                          <label className="flex items-center gap-2 text-xs font-semibold">
                            <input
                              type="checkbox"
                              checked={field.required}
                              onChange={(event) => updateField(field.id, { required: event.target.checked })}
                            />
                            {t('admin.driverFormBuilder.required')}
                          </label>
                          {SUPPORTED_LANGUAGES.map((lang) => (
                            <label key={lang} className="block">
                              <span className="text-[11px] font-bold text-muted">{t('admin.driverFormBuilder.label')} ({lang})</span>
                              <input
                                value={field.label[lang]}
                                onChange={(event) =>
                                  updateField(field.id, {
                                    label: { ...field.label, [lang]: event.target.value },
                                  })
                                }
                                className={`${inputCls} mt-1`}
                              />
                            </label>
                          ))}
                          <div className="flex items-center gap-2">
                            <button type="button" onClick={() => moveField(field.id, -1)} className="touch-compact h-8 px-2 rounded-lg border border-border">
                              <CaretUp size={14} />
                            </button>
                            <button type="button" onClick={() => moveField(field.id, 1)} className="touch-compact h-8 px-2 rounded-lg border border-border">
                              <CaretDown size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => removeField(field.id)}
                              className="touch-compact h-8 px-2 rounded-lg border border-red-200 text-red-600"
                            >
                              <Trash size={14} />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={addField}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-pill border border-border text-xs font-bold"
              >
                <Plus size={14} />
                {t('admin.driverFormBuilder.addField')}
              </button>
              <button
                type="button"
                disabled={isSaving}
                onClick={() => void handleSave()}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-pill bg-black text-white text-xs font-bold disabled:opacity-50"
              >
                <FloppyDisk size={14} />
                {isSaving ? t('common.loading') : t('common.save')}
              </button>
            </div>
            {errorMessage && <p className="text-xs text-red-600">{errorMessage}</p>}
          </div>
        )}
      </Section>

      {selectedApplication && (
        <AdminDriverApplicationDetail
          application={selectedApplication}
          formSchema={formSchema}
          onClose={() => {
            setSelectedApplication(null)
            void onRefresh()
          }}
          onApprove={async (applicationId) => {
            const key = await onApproveApplication(applicationId)
            await onRefresh()
            return key
          }}
          onReject={async (applicationId, reason) => {
            await onRejectApplication(applicationId, reason)
            await onRefresh()
          }}
        />
      )}
    </>
  )
}
