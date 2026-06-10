import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, X } from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'
import { resolveApiBaseUrl } from '../../../config/env'
import { formatDate, formatTime } from '../../../i18n/dateTime'
import {
  getApplicationCarSummary,
  getApplicationDisplayName,
  getOrderedApplicationFields,
  isImageFile,
  resolveApplicationFileUrl,
} from '../../../lib/driverApplicationDisplay'
import { useEscapeClose } from '../../../lib/useEscapeClose'
import type { DriverApplication, DriverApplicationStatus, DriverRegistrationFormSchema } from '../../../types'
import { inputCls } from './AdminSidebarShared'

type AdminDriverApplicationDetailProps = {
  application: DriverApplication
  formSchema: DriverRegistrationFormSchema
  onClose: () => void
  onApprove: (applicationId: string) => Promise<string | null>
  onReject: (applicationId: string, reason?: string) => Promise<void>
}

const STATUS_STYLE: Record<DriverApplicationStatus, { color: string; bg: string }> = {
  pending: { color: '#B45309', bg: 'rgba(245,158,11,0.12)' },
  approved: { color: '#15803D', bg: 'rgba(34,197,94,0.12)' },
  rejected: { color: '#B91C1C', bg: 'rgba(239,68,68,0.12)' },
}

export default function AdminDriverApplicationDetail({
  application,
  formSchema,
  onClose,
  onApprove,
  onReject,
}: AdminDriverApplicationDetailProps) {
  const { t, i18n } = useTranslation()
  const [rejectReason, setRejectReason] = useState('')
  const [showRejectForm, setShowRejectForm] = useState(false)
  const [approveArmed, setApproveArmed] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const apiBase = resolveApiBaseUrl()
  const displayName = getApplicationDisplayName(
    application,
    formSchema,
    t('admin.driverApplications.unknownApplicant', { defaultValue: 'New driver' }),
  )
  const carSummary = getApplicationCarSummary(application, formSchema)
  const submittedAt = new Date(application.createdAt)
  const statusStyle = STATUS_STYLE[application.status]
  const fields = getOrderedApplicationFields(application, formSchema, i18n.language)

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [])

  useEscapeClose(!isProcessing, onClose)

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
      setApproveArmed(false)
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

  const modal = (
    <div
      className="fixed inset-0 z-[3500] bg-black/55 flex flex-col sm:items-center sm:justify-center sm:p-4"
      onClick={() => !isProcessing && onClose()}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full sm:max-w-lg h-[100dvh] sm:h-auto sm:max-h-[92dvh] bg-white sm:rounded-card border-border sm:border flex flex-col min-h-0 shadow-card"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex-shrink-0 px-4 pt-3 pb-3 border-b border-border bg-white">
          <div className="flex justify-center sm:hidden pb-2">
            <div className="w-9 h-1 rounded-full bg-border" />
          </div>
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-lg font-extrabold tracking-tight text-black truncate">{displayName}</p>
              {carSummary && <p className="text-sm text-muted mt-0.5 truncate">{carSummary}</p>}
              <p className="text-xs text-muted mt-1">
                {t('admin.driverApplications.submittedAt', {
                  date: formatDate(submittedAt, { day: 'numeric', month: 'long', year: 'numeric' }),
                  time: formatTime(submittedAt, { hour: '2-digit', minute: '2-digit' }),
                  defaultValue: `Submitted ${formatDate(submittedAt)} at ${formatTime(submittedAt)}`,
                })}
              </p>
              {application.username && (
                <p className="text-xs text-muted mt-0.5">
                  {t('admin.driverApplications.telegramContact', {
                    username: application.username,
                    defaultValue: `Telegram: @${application.username}`,
                  })}
                </p>
              )}
            </div>
            <div className="flex flex-col items-end gap-2 flex-shrink-0">
              <button
                type="button"
                onClick={onClose}
                className="w-9 h-9 rounded-2xl bg-surface flex items-center justify-center"
                aria-label={t('common.close')}
              >
                <X size={16} weight="bold" className="text-muted" />
              </button>
              <span
                className="text-[11px] font-bold px-2.5 py-1 rounded-pill whitespace-nowrap"
                style={{ color: statusStyle.color, background: statusStyle.bg }}
              >
                {t(`admin.driverApplications.status.${application.status}`, { defaultValue: application.status })}
              </span>
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-3 scroll-smooth-y">
          {fields.map(({ field, label, value, file }) => (
            <div key={field.id} className="rounded-xl border border-border bg-surface p-3.5">
              <p className="text-xs font-semibold text-muted">{label}</p>
              {value && <p className="text-sm font-medium text-black mt-1.5 whitespace-pre-wrap">{value}</p>}
              {file && (
                <div className="mt-2">
                  {isImageFile(file.contentType, file.fileName) ? (
                    <a
                      href={resolveApplicationFileUrl(file.fileUrl, apiBase)}
                      target="_blank"
                      rel="noreferrer"
                      className="block"
                    >
                      <img
                        src={resolveApplicationFileUrl(file.fileUrl, apiBase)}
                        alt={label}
                        className="w-full max-h-56 object-cover rounded-xl border border-border bg-white"
                      />
                      <p className="text-xs font-semibold text-black mt-2 underline">
                        {t('admin.driverApplications.openPhoto', { defaultValue: 'Open full size' })}
                      </p>
                    </a>
                  ) : (
                    <a
                      href={resolveApplicationFileUrl(file.fileUrl, apiBase)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 mt-1.5 text-sm font-semibold text-black underline"
                    >
                      {t('admin.driverApplications.openDocument', { defaultValue: 'Open document' })}
                    </a>
                  )}
                </div>
              )}
            </div>
          ))}

          {application.rejectionReason && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3.5">
              <p className="text-xs font-semibold text-red-700">
                {t('admin.driverApplications.rejectionReason')}
              </p>
              <p className="text-sm text-red-600 mt-1">{application.rejectionReason}</p>
            </div>
          )}
        </div>

        {application.status === 'pending' && (
          <div
            className="flex-shrink-0 px-4 pt-3 pb-4 border-t border-border bg-white space-y-3"
            style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 0px))' }}
          >
            {showRejectForm ? (
              <>
                <label className="block">
                  <span className="text-xs font-semibold text-muted">
                    {t('admin.driverApplications.rejectReasonLabel')}
                  </span>
                  <textarea
                    value={rejectReason}
                    onChange={(event) => setRejectReason(event.target.value)}
                    rows={3}
                    className={`${inputCls} mt-1.5`}
                    placeholder={t('admin.driverApplications.rejectReasonPlaceholder')}
                  />
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={() => void handleReject()}
                    className="flex-1 h-12 rounded-2xl bg-red-600 text-white text-sm font-bold disabled:opacity-50"
                  >
                    {t('admin.driverApplications.reject')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowRejectForm(false)}
                    className="h-12 px-5 rounded-2xl border border-border text-sm font-semibold"
                  >
                    {t('common.cancel')}
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-xs text-muted">
                  {t('admin.driverApplications.approveHint', {
                    defaultValue: 'After approval the driver will receive an access key in Telegram.',
                  })}
                </p>
                <div className="flex gap-2">
                  {approveArmed ? (
                    <button
                      type="button"
                      disabled={isProcessing}
                      onClick={() => void handleApprove()}
                      className="flex-1 h-12 rounded-2xl bg-green-600 text-white text-sm font-bold inline-flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      <Check size={16} weight="bold" />
                      {t('admin.driverApplications.confirmApprove', { defaultValue: 'Confirm approval' })}
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={isProcessing}
                      onClick={() => setApproveArmed(true)}
                      className="flex-1 h-12 rounded-2xl bg-black text-white text-sm font-bold disabled:opacity-50"
                    >
                      {t('admin.driverApplications.approve')}
                    </button>
                  )}
                  {/* Destructive action is visually secondary so it can't be mistaken for the primary CTA */}
                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={() => {
                      setApproveArmed(false)
                      setShowRejectForm(true)
                    }}
                    className="h-12 px-5 rounded-2xl text-red-600 text-sm font-semibold hover:bg-red-50 transition-colors disabled:opacity-50"
                  >
                    {t('admin.driverApplications.reject')}
                  </button>
                </div>
                {approveArmed && (
                  <button
                    type="button"
                    onClick={() => setApproveArmed(false)}
                    className="w-full text-xs font-semibold text-muted"
                  >
                    {t('common.cancel')}
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {errorMessage && (
          <p className="flex-shrink-0 px-4 pb-3 text-sm text-red-600">{errorMessage}</p>
        )}
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}
