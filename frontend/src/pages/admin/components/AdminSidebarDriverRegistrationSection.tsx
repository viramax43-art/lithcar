import { CaretDown, CaretRight, CaretUp, FloppyDisk, Image, Plus, TextAa, TextAlignLeft, Trash, UploadSimple } from '@phosphor-icons/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { getInitialDriverRegistrationUi } from '../../../lib/adminUiState'
import {
  createFieldFromPreset,
  fieldTypeLabelKey,
  getAvailableProfilePresets,
  mergeEditorToSchema,
  splitSchemaForEditor,
  type FieldPresetId,
  type FormBuilderEditorState,
} from '../../../lib/driverFormBuilderHelpers'
import { usePersistAdminUiSlice } from '../../../lib/useAdminUiPersistence'
import { SUPPORTED_LANGUAGES } from '../../../i18n/languages'
import { formatDate, formatTime } from '../../../i18n/dateTime'
import { getApplicationCarSummary, getApplicationDisplayName } from '../../../lib/driverApplicationDisplay'
import type { DriverApplication, DriverRegistrationFormField, DriverRegistrationFormSchema } from '../../../types'
import AdminDriverApplicationDetail from './AdminDriverApplicationDetail'
import { inputCls, KeyReveal, Section, type CopyState } from './AdminSidebarShared'

type AdminSidebarDriverRegistrationSectionProps = {
  activeTab: string
  applications: DriverApplication[]
  pendingCount: number
  formSchema: DriverRegistrationFormSchema
  lastApprovedDriverKey: string | null
  selectedApplicationId: string | null
  onSelectedApplicationIdChange: (applicationId: string | null) => void
  copyState: CopyState
  copiedToken: string | null
  copyText: (value: string, token: string) => Promise<void>
  onRefresh: () => Promise<void>
  onSaveFormSchema: (schema: DriverRegistrationFormSchema) => Promise<void>
  onApproveApplication: (applicationId: string) => Promise<string>
  onRejectApplication: (applicationId: string, reason?: string) => Promise<void>
}

const PRESET_ICONS: Partial<Record<FieldPresetId, typeof TextAa>> = {
  customShortText: TextAa,
  customLongText: TextAlignLeft,
  customPhoto: Image,
  customDocument: UploadSimple,
}

export function AdminSidebarDriverRegistrationSection({
  activeTab,
  applications,
  pendingCount,
  formSchema,
  lastApprovedDriverKey,
  selectedApplicationId,
  onSelectedApplicationIdChange,
  copyState,
  copiedToken,
  copyText,
  onRefresh,
  onSaveFormSchema,
  onApproveApplication,
  onRejectApplication,
}: AdminSidebarDriverRegistrationSectionProps) {
  const { t, i18n } = useTranslation()
  const initialDriverRegistrationUi = getInitialDriverRegistrationUi()
  const skipFormSchemaSyncRef = useRef(initialDriverRegistrationUi.formDraft !== null)
  const [showBuilder, setShowBuilder] = useState(initialDriverRegistrationUi.showBuilder)
  const [draft, setDraft] = useState<FormBuilderEditorState>(() => {
    const persisted = initialDriverRegistrationUi.formDraft as DriverRegistrationFormSchema | null
    return splitSchemaForEditor(persisted ?? formSchema)
  })
  const [expandedFieldId, setExpandedFieldId] = useState<string | null>(initialDriverRegistrationUi.expandedFieldId)
  const [showIntroText, setShowIntroText] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const selectedApplication = useMemo(
    () => applications.find((item) => item.id === selectedApplicationId) ?? null,
    [applications, selectedApplicationId],
  )

  const driverRegistrationUiPersistence = useMemo(
    () => ({
      showBuilder,
      expandedFieldId,
      selectedApplicationId,
      formDraft: mergeEditorToSchema(draft),
    }),
    [showBuilder, expandedFieldId, selectedApplicationId, draft],
  )
  usePersistAdminUiSlice('driverRegistration', driverRegistrationUiPersistence)

  useEffect(() => {
    if (skipFormSchemaSyncRef.current) {
      skipFormSchemaSyncRef.current = false
      return
    }
    setDraft(splitSchemaForEditor(formSchema))
  }, [formSchema])

  const pendingApplications = useMemo(
    () => applications.filter((item) => item.status === 'pending'),
    [applications],
  )

  const sortedFields = useMemo(
    () => draft.fields.slice().sort((a, b) => a.order - b.order),
    [draft.fields],
  )

  const availablePresets = useMemo(() => getAvailableProfilePresets(draft.fields), [draft.fields])

  const currentLang = (['lt', 'pl', 'en', 'ru'].includes(i18n.language.slice(0, 2))
    ? i18n.language.slice(0, 2)
    : 'en') as 'lt' | 'pl' | 'en' | 'ru'

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

  const addPresetField = (preset: FieldPresetId) => {
    const newField = createFieldFromPreset(preset, draft.fields.length)
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
      await onSaveFormSchema(mergeEditorToSchema(draft))
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t('common.error'))
    } finally {
      setIsSaving(false)
    }
  }

  const presetLabel = (preset: FieldPresetId): string => {
    const key = `admin.driverFormBuilder.preset.${preset}`
    return t(key, { defaultValue: preset })
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
                  onClick={() => onSelectedApplicationIdChange(application.id)}
                  className="w-full text-left rounded-xl border border-border bg-surface px-3 py-3.5 hover:border-black/20 transition-colors min-h-[44px]"
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
          className="w-full flex items-center justify-between rounded-xl border border-border bg-surface px-3 py-3 text-sm font-semibold min-h-[44px]"
        >
          <span>{showBuilder ? t('admin.driverFormBuilder.hide') : t('admin.driverFormBuilder.open')}</span>
          <CaretDown size={14} className={`transition-transform ${showBuilder ? 'rotate-180' : ''}`} />
        </button>

        {showBuilder && (
          <div className="mt-3 space-y-4">
            <p className="text-xs text-muted leading-relaxed">{t('admin.driverFormBuilder.hint')}</p>

            {/* Profile photo — separate from form fields */}
            <div className="rounded-xl border border-border bg-surface/60 p-3 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-bold">{t('admin.driverFormBuilder.profilePhoto.title')}</p>
                  <p className="text-[11px] text-muted mt-0.5">{t('admin.driverFormBuilder.profilePhoto.hint')}</p>
                </div>
                <label className="flex items-center gap-2 text-xs font-semibold flex-shrink-0">
                  <input
                    type="checkbox"
                    checked={draft.profilePhoto.enabled}
                    onChange={(event) =>
                      setDraft((prev) => ({
                        ...prev,
                        profilePhoto: { ...prev.profilePhoto, enabled: event.target.checked },
                      }))
                    }
                  />
                  {t('admin.driverFormBuilder.profilePhoto.enabled')}
                </label>
              </div>
              {draft.profilePhoto.enabled && (
                <div className="space-y-2 pt-1 border-t border-border/60">
                  <label className="flex items-center gap-2 text-xs font-semibold">
                    <input
                      type="checkbox"
                      checked={draft.profilePhoto.required}
                      onChange={(event) =>
                        setDraft((prev) => ({
                          ...prev,
                          profilePhoto: { ...prev.profilePhoto, required: event.target.checked },
                        }))
                      }
                    />
                    {t('admin.driverFormBuilder.required')}
                  </label>
                  {SUPPORTED_LANGUAGES.map((lang) => (
                    <label key={lang} className="block">
                      <span className="text-[11px] font-bold text-muted">
                        {t('admin.driverFormBuilder.label')} ({t(`language.${lang}`)})
                      </span>
                      <input
                        value={draft.profilePhoto.label[lang]}
                        onChange={(event) =>
                          setDraft((prev) => ({
                            ...prev,
                            profilePhoto: {
                              ...prev.profilePhoto,
                              label: { ...prev.profilePhoto.label, [lang]: event.target.value },
                            },
                          }))
                        }
                        className={`${inputCls} mt-1`}
                      />
                    </label>
                  ))}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setShowIntroText((value) => !value)}
              className="w-full flex items-center justify-between rounded-xl border border-dashed border-border px-3 py-2.5 text-xs font-semibold text-muted min-h-[44px]"
            >
              <span>{t('admin.driverFormBuilder.introText')}</span>
              <CaretDown size={12} className={`transition-transform ${showIntroText ? 'rotate-180' : ''}`} />
            </button>
            {showIntroText && (
              <div className="space-y-2">
                {SUPPORTED_LANGUAGES.map((lang) => (
                  <label key={lang} className="block">
                    <span className="text-[11px] font-bold text-muted">{t(`language.${lang}`)}</span>
                    <textarea
                      value={draft.introText[lang]}
                      onChange={(event) =>
                        setDraft((prev) => ({
                          ...prev,
                          introText: { ...prev.introText, [lang]: event.target.value },
                        }))
                      }
                      rows={2}
                      className={`${inputCls} mt-1`}
                    />
                  </label>
                ))}
              </div>
            )}

            <div className="space-y-2">
              <p className="text-xs font-bold">{t('admin.driverFormBuilder.fieldsTitle')}</p>
              {sortedFields.length === 0 && (
                <p className="text-xs text-muted py-2">{t('admin.driverFormBuilder.fieldsEmpty')}</p>
              )}
              {sortedFields.map((field) => {
                const expanded = expandedFieldId === field.id
                const displayLabel = field.label[currentLang] || field.label.en || field.label.lt || t('admin.driverFormBuilder.untitledField')
                return (
                  <div key={field.id} className="rounded-xl border border-border bg-white">
                    <button
                      type="button"
                      onClick={() => setExpandedFieldId(expanded ? null : field.id)}
                      className="w-full px-3 py-3 flex items-center justify-between gap-2 text-left min-h-[44px]"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">{displayLabel}</p>
                        <p className="text-[11px] text-muted">
                          {t(fieldTypeLabelKey(field))}
                          {' · '}
                          {field.required ? t('admin.driverFormBuilder.required') : t('admin.driverFormBuilder.optional')}
                        </p>
                      </div>
                      <CaretDown size={14} className={`text-muted transition-transform flex-shrink-0 ${expanded ? 'rotate-180' : ''}`} />
                    </button>
                    {expanded && (
                      <div className="px-3 pb-3 space-y-2 border-t border-border pt-3">
                        <label className="flex items-center gap-2 text-xs font-semibold min-h-[44px]">
                          <input
                            type="checkbox"
                            checked={field.required}
                            onChange={(event) => updateField(field.id, { required: event.target.checked })}
                          />
                          {t('admin.driverFormBuilder.required')}
                        </label>
                        {SUPPORTED_LANGUAGES.map((lang) => (
                          <label key={lang} className="block">
                            <span className="text-[11px] font-bold text-muted">
                              {t('admin.driverFormBuilder.label')} ({t(`language.${lang}`)})
                            </span>
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
                        <div className="flex items-center gap-2 pt-1">
                          <button type="button" onClick={() => moveField(field.id, -1)} className="min-h-[44px] min-w-[44px] rounded-lg border border-border flex items-center justify-center">
                            <CaretUp size={16} />
                          </button>
                          <button type="button" onClick={() => moveField(field.id, 1)} className="min-h-[44px] min-w-[44px] rounded-lg border border-border flex items-center justify-center">
                            <CaretDown size={16} />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeField(field.id)}
                            className="min-h-[44px] px-3 rounded-lg border border-red-200 text-red-600 text-xs font-bold inline-flex items-center gap-1"
                          >
                            <Trash size={14} />
                            {t('common.delete', { defaultValue: 'Delete' })}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            <div className="space-y-2">
              <p className="text-xs font-bold">{t('admin.driverFormBuilder.addField')}</p>
              <div className="grid grid-cols-2 gap-2">
                {availablePresets.map((preset) => {
                  const Icon = PRESET_ICONS[preset] ?? Plus
                  return (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => addPresetField(preset)}
                      className="rounded-xl border border-border bg-surface px-3 py-3 text-left hover:border-black/20 transition-colors min-h-[52px]"
                    >
                      <div className="flex items-center gap-2">
                        <Icon size={16} className="text-muted flex-shrink-0" />
                        <span className="text-xs font-bold leading-tight">{presetLabel(preset)}</span>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            <button
              type="button"
              disabled={isSaving}
              onClick={() => void handleSave()}
              className="w-full inline-flex items-center justify-center gap-1.5 h-11 rounded-xl bg-black text-white text-sm font-bold disabled:opacity-50 min-h-[44px]"
            >
              <FloppyDisk size={16} />
              {isSaving ? t('common.loading') : t('common.save')}
            </button>
            {errorMessage && <p className="text-xs text-red-600">{errorMessage}</p>}
          </div>
        )}
      </Section>

      {selectedApplication && (
        <AdminDriverApplicationDetail
          application={selectedApplication}
          formSchema={formSchema}
          onClose={() => {
            onSelectedApplicationIdChange(null)
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
