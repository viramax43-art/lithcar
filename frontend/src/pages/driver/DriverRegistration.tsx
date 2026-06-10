import { ArrowLeft, CheckCircle, Clock, SealWarning } from '@phosphor-icons/react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import LanguageSwitcher from '../../components/LanguageSwitcher'
import { useEnsurePassengerSession } from '../../application/session/useEnsurePassengerSession'
import { resolveDriverFormText } from '../../lib/driverFormText'
import { enterDriverCabinet } from '../../lib/driverPortal'
import {
  getDriverRegistrationForm,
  getMyDriverApplication,
  submitDriverApplication,
  updateCurrentUserLanguage,
  uploadDriverApplicationFile,
} from '../../lib/backend'
import { hapticNotification, hapticSelection } from '../../lib/telegram'
import type { AppLanguage } from '../../i18n/languages'
import { normalizeLanguage } from '../../i18n/languages'
import type { DriverApplication, DriverApplicationFileEntry, DriverRegistrationFormSchema } from '../../types'
import { DynamicFormField } from './components/DynamicFormField'

export default function DriverRegistration() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const session = useEnsurePassengerSession()
  const [schema, setSchema] = useState<DriverRegistrationFormSchema | null>(null)
  const [application, setApplication] = useState<DriverApplication | null>(null)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [files, setFiles] = useState<Record<string, DriverApplicationFileEntry>>({})
  const [uploadingFields, setUploadingFields] = useState<Record<string, boolean>>({})
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isEnteringDriverCabinet, setIsEnteringDriverCabinet] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const handleOpenDriverCabinet = async () => {
    setIsEnteringDriverCabinet(true)
    setErrorMessage(null)
    try {
      await enterDriverCabinet()
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : t('driverRegistration.openCabinetFailed', { defaultValue: 'Failed to open driver cabinet.' }),
      )
    } finally {
      setIsEnteringDriverCabinet(false)
    }
  }

  const sortedFields = useMemo(
    () => (schema?.fields ?? []).slice().sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)),
    [schema],
  )

  useEffect(() => {
    if (!session.isReady) return
    let cancelled = false
    void (async () => {
      setIsLoading(true)
      try {
        const [formSchema, myApplication] = await Promise.all([
          getDriverRegistrationForm(),
          getMyDriverApplication(),
        ])
        if (cancelled) return
        setSchema(formSchema)
        setApplication(myApplication)
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : t('common.error'))
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [session.isReady, t])

  const introText = schema ? resolveDriverFormText(schema.introText, i18n.language) : ''

  const validateClient = (): boolean => {
    if (!schema) return false
    const nextErrors: Record<string, string> = {}
    for (const field of sortedFields) {
      if (!field.required) continue
      if (field.type === 'file') {
        if (!files[field.id]) nextErrors[field.id] = t('driverRegistration.fieldRequired')
      } else if (!answers[field.id]?.trim()) {
        nextErrors[field.id] = t('driverRegistration.fieldRequired')
      }
    }
    setFieldErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const handleSubmit = async () => {
    if (!schema || !validateClient()) return
    hapticSelection()
    setIsSubmitting(true)
    setErrorMessage(null)
    try {
      const language = normalizeLanguage(i18n.language) as AppLanguage
      const submitted = await submitDriverApplication({
        language,
        answers,
        files: Object.fromEntries(
          Object.entries(files).map(([fieldId, entry]) => [
            fieldId,
            {
              objectKey: entry.objectKey,
              fileName: entry.fileName,
              contentType: entry.contentType,
              sizeBytes: entry.sizeBytes,
            },
          ]),
        ),
      })
      setApplication(submitted)
      hapticNotification('success')
    } catch (error) {
      hapticNotification('error')
      setErrorMessage(error instanceof Error ? error.message : t('common.error'))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleFileSelect = async (fieldId: string, file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      setFieldErrors((prev) => ({ ...prev, [fieldId]: t('driverRegistration.fileTooLarge') }))
      return
    }
    setUploadingFields((prev) => ({ ...prev, [fieldId]: true }))
    try {
      const uploaded = await uploadDriverApplicationFile(file)
      setFiles((prev) => ({
        ...prev,
        [fieldId]: {
          objectKey: uploaded.objectKey,
          fileName: uploaded.fileName,
          contentType: uploaded.contentType,
          sizeBytes: uploaded.sizeBytes,
          fileUrl: uploaded.fileUrl,
        },
      }))
      setFieldErrors((prev) => {
        const next = { ...prev }
        delete next[fieldId]
        return next
      })
    } finally {
      setUploadingFields((prev) => {
        const next = { ...prev }
        delete next[fieldId]
        return next
      })
    }
  }

  if (!session.isReady || isLoading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-white user-safe-top user-safe-bottom">
        <p className="text-sm text-muted">{t('common.loading')}</p>
      </div>
    )
  }

  if (application?.status === 'pending') {
    return (
      <div className="min-h-[100dvh] bg-white user-safe-top user-safe-bottom px-5 py-4">
        <button type="button" onClick={() => navigate('/profile')} className="touch-compact inline-flex items-center gap-2 text-sm font-semibold text-black">
          <ArrowLeft size={18} />
          {t('common.close')}
        </button>
        <div className="mt-10 flex flex-col items-center text-center px-4">
          <div className="w-16 h-16 rounded-2xl bg-surface border border-border flex items-center justify-center">
            <Clock size={32} weight="duotone" className="text-black" />
          </div>
          <h1 className="text-xl font-black text-black mt-5">{t('driverRegistration.pendingTitle')}</h1>
          <p className="text-sm text-muted mt-2">{t('driverRegistration.pendingDescription')}</p>
        </div>
      </div>
    )
  }

  if (application?.status === 'approved') {
    return (
      <div className="min-h-[100dvh] bg-white user-safe-top user-safe-bottom px-5 py-4">
        <button type="button" onClick={() => navigate('/profile')} className="touch-compact inline-flex items-center gap-2 text-sm font-semibold text-black">
          <ArrowLeft size={18} />
          {t('common.close')}
        </button>
        <div className="mt-10 flex flex-col items-center text-center px-4">
          <div className="w-16 h-16 rounded-2xl bg-surface border border-border flex items-center justify-center">
            <CheckCircle size={32} weight="duotone" className="text-emerald-600" />
          </div>
          <h1 className="text-xl font-black text-black mt-5">{t('driverRegistration.approvedTitle')}</h1>
          <p className="text-sm text-muted mt-2">{t('driverRegistration.approvedDescription')}</p>
          <button
            type="button"
            onClick={() => void handleOpenDriverCabinet()}
            disabled={isEnteringDriverCabinet}
            className="mt-6 h-11 px-5 rounded-pill bg-black text-white text-sm font-bold disabled:opacity-60"
          >
            {isEnteringDriverCabinet
              ? t('driverRegistration.openingCabinet', { defaultValue: 'Opening...' })
              : t('driverRegistration.openCabinet')}
          </button>
        </div>
      </div>
    )
  }

  const showRejectedBanner = application?.status === 'rejected'

  return (
    <div className="min-h-[100dvh] bg-white user-safe-top user-safe-bottom">
      <div className="sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-border px-5 py-3 flex items-center justify-between gap-3">
        <button type="button" onClick={() => navigate(-1)} className="touch-compact inline-flex items-center gap-2 text-sm font-semibold text-black">
          <ArrowLeft size={18} />
          {t('common.close')}
        </button>
        <LanguageSwitcher
          variant="header"
          onChangeLanguage={async (language) => {
            await updateCurrentUserLanguage(language)
          }}
        />
      </div>

      <div className="px-5 py-5 pb-8 max-w-lg mx-auto">
        <h1 className="text-2xl font-black text-black">{t('driverRegistration.title')}</h1>
        {introText && <p className="text-sm text-muted mt-2">{introText}</p>}

        {showRejectedBanner && (
          <div className="mt-4 rounded-card border border-red-200 bg-red-50 p-4">
            <div className="flex items-start gap-3">
              <SealWarning size={20} className="text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-red-700">{t('driverRegistration.rejectedTitle')}</p>
                {application.rejectionReason && (
                  <p className="text-sm text-red-600 mt-1">{application.rejectionReason}</p>
                )}
                <p className="text-xs text-red-600/80 mt-2">{t('driverRegistration.resubmitHint')}</p>
              </div>
            </div>
          </div>
        )}

        <form
          onSubmit={(event) => {
            event.preventDefault()
            if (!isSubmitting && schema && Object.keys(uploadingFields).length === 0) void handleSubmit()
          }}
        >
        <div className="mt-6 space-y-5">
          {sortedFields.map((field) => (
            <DynamicFormField
              key={field.id}
              field={field}
              language={i18n.language}
              value={answers[field.id] ?? ''}
              fileEntry={files[field.id] ?? null}
              error={fieldErrors[field.id]}
              disabled={isSubmitting}
              isUploading={Boolean(uploadingFields[field.id])}
              onValueChange={(value) => {
                setAnswers((prev) => ({ ...prev, [field.id]: value }))
                setFieldErrors((prev) => {
                  const next = { ...prev }
                  delete next[field.id]
                  return next
                })
              }}
              onFileSelect={(file) => handleFileSelect(field.id, file)}
              onFileError={(message) => setFieldErrors((prev) => ({ ...prev, [field.id]: message }))}
              onFileClear={() => {
                setFiles((prev) => {
                  const next = { ...prev }
                  delete next[field.id]
                  return next
                })
              }}
            />
          ))}
        </div>

        {errorMessage && <p className="text-sm text-red-600 mt-4">{errorMessage}</p>}

        <button
          type="submit"
          disabled={isSubmitting || !schema || Object.keys(uploadingFields).length > 0}
          className="mt-6 w-full h-12 rounded-pill bg-black text-white text-sm font-bold disabled:opacity-50 hover:bg-zinc-800 transition-colors"
        >
          {isSubmitting ? t('driverRegistration.submitting') : t('driverRegistration.submit')}
        </button>
        </form>
      </div>
    </div>
  )
}
