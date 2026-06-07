import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { resolveApiBaseUrl } from '../../../config/env'
import { resolveDriverFormText } from '../../../lib/driverFormText'
import type { DriverApplication, DriverRegistrationFormSchema } from '../../../types'
import InlineConfirm from './InlineConfirm'
import { inputCls } from './AdminSidebarShared'

type AdminDriverApplicationDetailProps = {
  application: DriverApplication
  formSchema: DriverRegistrationFormSchema
  onClose: () => void
  onApprove: (applicationId: string) => Promise<string | null>
  onReject: (applicationId: string, reason?: string) => Promise<void>
}

export default function AdminDriverApplicationDetail({
  application,
  formSchema,
  onClose,
  onApprove,
  onReject,
}: AdminDriverApplicationDetailProps) {
  const { t } = useTranslation()
  const [rejectReason, setRejectReason] = useState('')
  const [showRejectForm, setShowRejectForm] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const fieldsById = Object.fromEntries(formSchema.fields.map((field) => [field.id, field]))
  const language = application.language

  const handleApprove = async () => {
    setIsProcessing(true)
    setErrorMessage(null)
    try {
      await onApprove(application.id)
      onClose()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t('common.error'))
    } finally {
      setIsProcessing(false)
    }
  }

  const handleReject = async () => {
    setIsProcessing(true)
    setErrorMessage(null)
    try {
      await onReject(application.id, rejectReason.trim() || undefined)
      onClose()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t('common.error'))
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[80] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="w-full sm:max-w-lg max-h-[92dvh] overflow-hidden bg-white rounded-t-card sm:rounded-card border border-border flex flex-col">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-black">{t('admin.driverApplications.detailTitle')}</p>
            <p className="text-xs text-muted mt-0.5">
              {application.username || application.userId} · {application.status}
            </p>
          </div>
          <button type="button" onClick={onClose} className="touch-compact text-sm font-semibold text-muted">
            {t('common.close')}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 scroll-smooth-y">
          {Object.entries(application.answers).map(([fieldId, value]) => {
            const field = fieldsById[fieldId]
            const label = field ? resolveDriverFormText(field.label, language) : fieldId
            return (
              <div key={fieldId} className="rounded-xl border border-border bg-surface p-3">
                <p className="text-xs font-bold uppercase tracking-wide text-muted">{label}</p>
                <p className="text-sm text-black mt-1 whitespace-pre-wrap">{value}</p>
              </div>
            )
          })}

          {Object.entries(application.files).map(([fieldId, file]) => {
            const field = fieldsById[fieldId]
            const label = field ? resolveDriverFormText(field.label, language) : fieldId
            const fileUrl = file.fileUrl.startsWith('http')
              ? file.fileUrl
              : `${resolveApiBaseUrl()}${file.fileUrl}`
            return (
              <div key={fieldId} className="rounded-xl border border-border bg-surface p-3">
                <p className="text-xs font-bold uppercase tracking-wide text-muted">{label}</p>
                <a href={fileUrl} target="_blank" rel="noreferrer" className="text-sm font-semibold text-black underline mt-1 inline-block">
                  {file.fileName}
                </a>
              </div>
            )
          })}

          {application.rejectionReason && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3">
              <p className="text-xs font-bold text-red-700">{t('admin.driverApplications.rejectionReason')}</p>
              <p className="text-sm text-red-600 mt-1">{application.rejectionReason}</p>
            </div>
          )}
        </div>

        {application.status === 'pending' && (
          <div className="p-4 border-t border-border space-y-3">
            {showRejectForm ? (
              <>
                <label className="block">
                  <span className="text-xs font-bold text-muted">{t('admin.driverApplications.rejectReasonLabel')}</span>
                  <textarea
                    value={rejectReason}
                    onChange={(event) => setRejectReason(event.target.value)}
                    rows={3}
                    className={`${inputCls} mt-1`}
                    placeholder={t('admin.driverApplications.rejectReasonPlaceholder')}
                  />
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={() => void handleReject()}
                    className="flex-1 h-10 rounded-pill bg-red-600 text-white text-sm font-bold disabled:opacity-50"
                  >
                    {t('admin.driverApplications.reject')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowRejectForm(false)}
                    className="h-10 px-4 rounded-pill border border-border text-sm font-semibold"
                  >
                    {t('common.cancel')}
                  </button>
                </div>
              </>
            ) : (
              <div className="flex gap-2">
                <div className="flex-1">
                  <InlineConfirm
                    label={t('admin.driverApplications.approve')}
                    confirmLabel={t('admin.driverApplications.approveConfirm')}
                    onConfirm={() => {
                      if (!isProcessing) void handleApprove()
                    }}
                  />
                </div>
                <button
                  type="button"
                  disabled={isProcessing}
                  onClick={() => setShowRejectForm(true)}
                  className="flex-1 h-10 rounded-pill border border-border text-sm font-bold"
                >
                  {t('admin.driverApplications.reject')}
                </button>
              </div>
            )}
          </div>
        )}

        {errorMessage && <p className="px-4 pb-4 text-sm text-red-600">{errorMessage}</p>}
      </div>
    </div>
  )
}
