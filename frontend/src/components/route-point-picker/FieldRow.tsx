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
      className={`flex items-center gap-1 pr-1 rounded-xl border transition-colors ${
        active ? 'border-black bg-white' : 'border-transparent bg-surface/60'
      }`}
    >
      <button
        type="button"
        onClick={onClick}
        className="flex items-center gap-2.5 flex-1 min-w-0 pl-2.5 pr-1 py-2 text-left"
      >
        <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${dotClass}`} />
        <span className="flex-1 min-w-0 block">
          <span className="block text-[9px] font-bold uppercase tracking-wider text-muted leading-none">{label}</span>
          <span className={`block text-xs font-semibold truncate mt-0.5 ${value ? 'text-black' : 'text-muted/80 font-medium'}`}>
            {value || placeholder}
          </span>
        </span>
      </button>
      <button
        type="button"
        onClick={onSearch}
        className="p-2 rounded-lg hover:bg-surface transition-colors flex-shrink-0 touch-compact"
        title={t('common.searchAddress', { defaultValue: 'Search address' })}
      >
        <MagnifyingGlass size={14} className="text-muted" />
      </button>
      {onClear && (
        <button
          type="button"
          onClick={onClear}
          className="p-2 rounded-lg hover:bg-surface transition-colors flex-shrink-0 touch-compact"
          title={t('common.clear', { defaultValue: 'Clear' })}
        >
          <X size={14} className="text-muted" />
        </button>
      )}
    </div>
  )
}
