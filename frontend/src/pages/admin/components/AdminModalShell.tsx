import type { ReactNode } from 'react'
import { X } from '@phosphor-icons/react'

import { useEscapeClose } from '../../../lib/useEscapeClose'

interface AdminModalShellProps {
  onClose: () => void
  children: ReactNode
  title?: ReactNode
  subtitle?: ReactNode
  maxWidthClass?: string
}

export default function AdminModalShell({
  onClose,
  children,
  title,
  subtitle,
  maxWidthClass = 'max-w-lg',
}: AdminModalShellProps) {
  useEscapeClose(true, onClose)
  return (
    <div
      className="admin-modal-root fixed inset-0 bg-black/50 flex items-center justify-center z-[3500] p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`admin-modal-panel bg-white rounded-card shadow-card w-full ${maxWidthClass} max-h-[96vh] flex flex-col overflow-hidden`}
        onClick={(event) => event.stopPropagation()}
      >
        {(title || subtitle) && (
          <div className="admin-modal-header flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
            <div className="min-w-0">
              {title && <h2 className="text-base font-bold">{title}</h2>}
              {subtitle && <p className="text-xs text-muted mt-0.5 truncate">{subtitle}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="admin-modal-close p-2.5 hover:bg-surface rounded-xl transition-colors flex-shrink-0"
            >
              <X size={18} />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  )
}
