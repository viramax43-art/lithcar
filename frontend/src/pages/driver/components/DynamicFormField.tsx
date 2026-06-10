import { FileArrowUp, X } from '@phosphor-icons/react'
import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { resolveDriverFormText } from '../../../lib/driverFormText'
import type { DriverApplicationFileEntry, DriverRegistrationFormField } from '../../../types'

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024

type DynamicFormFieldProps = {
  field: DriverRegistrationFormField
  language: string
  value: string
  fileEntry: DriverApplicationFileEntry | null
  error?: string | null
  disabled?: boolean
  isUploading?: boolean
  onValueChange: (value: string) => void
  onFileSelect: (file: File) => Promise<void>
  onFileClear: () => void
  onFileError?: (message: string) => void
}

export function DynamicFormField({
  field,
  language,
  value,
  fileEntry,
  error,
  disabled,
  isUploading,
  onValueChange,
  onFileSelect,
  onFileClear,
  onFileError,
}: DynamicFormFieldProps) {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)
  const label = resolveDriverFormText(field.label, language)
  const placeholder = resolveDriverFormText(field.placeholder, language)
  const helpText = resolveDriverFormText(field.helpText, language)

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (file.size > MAX_FILE_SIZE_BYTES) {
      onFileError?.(t('driverRegistration.fileTooLarge'))
      return
    }
    try {
      await onFileSelect(file)
    } catch (error) {
      onFileError?.(error instanceof Error ? error.message : t('common.error'))
    }
  }

  if (field.type === 'textarea') {
    return (
      <label className="block">
        <span className="text-sm font-bold text-black">
          {label}
          {field.required && <span className="text-red-500 ml-1">*</span>}
        </span>
        <textarea
          value={value}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(event) => onValueChange(event.target.value)}
          rows={4}
          className="mt-2 w-full rounded-xl border-[1.5px] border-border bg-surface px-3 py-2.5 text-sm text-black outline-none focus:border-black"
        />
        {helpText && <p className="text-xs text-muted mt-1.5">{helpText}</p>}
        {error && <p className="text-xs text-red-600 mt-1.5">{error}</p>}
      </label>
    )
  }

  if (field.type === 'file') {
    return (
      <div>
        <p className="text-sm font-bold text-black">
          {label}
          {field.required && <span className="text-red-500 ml-1">*</span>}
        </p>
        <input
          ref={inputRef}
          type="file"
          accept={field.accept || 'image/*,application/pdf'}
          className="hidden"
          disabled={disabled}
          onChange={(event) => void handleFileChange(event)}
        />
        {fileEntry ? (
          <div className="mt-2 rounded-xl border border-border bg-surface px-3 py-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-black truncate">{fileEntry.fileName}</p>
              <p className="text-xs text-muted">
                {(fileEntry.sizeBytes / 1024).toFixed(0)} KB
              </p>
            </div>
            <button
              type="button"
              disabled={disabled}
              onClick={onFileClear}
              className="touch-compact w-9 h-9 rounded-xl border border-border bg-white flex items-center justify-center"
              aria-label={t('common.delete')}
            >
              <X size={16} />
            </button>
          </div>
        ) : isUploading ? (
          <div className="mt-2 w-full rounded-xl border border-dashed border-border bg-surface px-4 py-6 flex flex-col items-center gap-2">
            <div className="w-6 h-6 rounded-full border-2 border-border border-t-black animate-spin" />
            <span className="text-sm font-semibold text-black">
              {t('driverRegistration.uploadingFile', { defaultValue: 'Uploading file...' })}
            </span>
          </div>
        ) : (
          <button
            type="button"
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
            className="mt-2 w-full rounded-xl border border-dashed border-border bg-surface px-4 py-6 flex flex-col items-center gap-2 transition-colors hover:border-black/30"
          >
            <FileArrowUp size={24} className="text-muted" />
            <span className="text-sm font-semibold text-black">{t('driverRegistration.attachFile')}</span>
            <span className="text-xs text-muted">{t('driverRegistration.fileLimit')}</span>
          </button>
        )}
        {helpText && <p className="text-xs text-muted mt-1.5">{helpText}</p>}
        {error && <p className="text-xs text-red-600 mt-1.5">{error}</p>}
      </div>
    )
  }

  return (
    <label className="block">
      <span className="text-sm font-bold text-black">
        {label}
        {field.required && <span className="text-red-500 ml-1">*</span>}
      </span>
      <input
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(event) => onValueChange(event.target.value)}
        className="mt-2 w-full h-11 rounded-xl border-[1.5px] border-border bg-surface px-3 text-sm text-black outline-none focus:border-black"
      />
      {helpText && <p className="text-xs text-muted mt-1.5">{helpText}</p>}
      {error && <p className="text-xs text-red-600 mt-1.5">{error}</p>}
    </label>
  )
}
