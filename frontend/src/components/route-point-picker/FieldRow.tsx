import { MagnifyingGlass, X } from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'

interface FieldRowProps {
  dotClass: string
  label: string
  value: string
  placeholder: string
  active: boolean
  onClick: () => void
  onClear?: () => void
  onSearch: () => void
}

export function FieldRow({ dotClass, label, value, placeholder, active, onClick, onClear, onSearch }: FieldRowProps) {
  const { t } = useTranslation()

  return (
    <div
      className={`flex items-center gap-1.5 pr-1.5 rounded-xl border min-h-[56px] transition-colors ${
        active ? 'border-black bg-white' : 'border-transparent bg-surface/60'
      }`}
    >
      <button
        type="button"
        onClick={onClick}
        className="flex items-center gap-3 flex-1 min-w-0 pl-3 pr-2 py-3 text-left"
      >
        <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 mt-0.5 self-start ${dotClass}`} />
        <span className="flex-1 min-w-0 block">
          <span className="block text-[10px] font-bold uppercase tracking-wider text-muted leading-none">{label}</span>
          <span
            className={`block text-sm font-semibold mt-1.5 leading-snug ${
              value ? 'text-black truncate' : 'text-muted/80 font-medium line-clamp-2'
            }`}
          >
            {value || placeholder}
          </span>
        </span>
      </button>
      <button
        type="button"
        onClick={onSearch}
        className="p-2.5 rounded-lg hover:bg-surface transition-colors flex-shrink-0 touch-compact"
        title={t('common.searchAddress', { defaultValue: 'Search address' })}
      >
        <MagnifyingGlass size={14} className="text-muted" />
      </button>
      {onClear && (
        <button
          type="button"
          onClick={onClear}
          className="p-2.5 rounded-lg hover:bg-surface transition-colors flex-shrink-0 touch-compact"
          title={t('common.clear', { defaultValue: 'Clear' })}
        >
          <X size={14} className="text-muted" />
        </button>
      )}
    </div>
  )
}
