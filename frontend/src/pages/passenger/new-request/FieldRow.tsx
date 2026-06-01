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
      onClick={onClick}
      className={`flex items-center gap-2.5 px-2.5 py-2 rounded-xl border transition-colors cursor-pointer ${
        active ? 'border-black bg-white' : 'border-transparent bg-surface/60'
      }`}
    >
      <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${dotClass}`} />
      <div className="flex-1 min-w-0">
        <p className="text-[9px] font-bold uppercase tracking-wider text-muted leading-none">{label}</p>
        <p className={`text-xs font-semibold truncate mt-0.5 ${value ? 'text-black' : 'text-muted/80 font-medium'}`}>
          {value || placeholder}
        </p>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation()
          onSearch()
        }}
        className="p-1.5 -mr-1 rounded-lg hover:bg-surface transition-colors flex-shrink-0"
        title={t('common.searchAddress', { defaultValue: 'Search address' })}
      >
        <MagnifyingGlass size={14} className="text-muted" />
      </button>
      {onClear && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onClear()
          }}
          className="p-1.5 rounded-lg hover:bg-surface transition-colors flex-shrink-0"
          title={t('common.clear', { defaultValue: 'Clear' })}
        >
          <X size={14} className="text-muted" />
        </button>
      )}
    </div>
  )
}
