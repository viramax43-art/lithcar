import { CaretRight, MagnifyingGlass, NavigationArrow, X } from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'
import { isCoarsePointer } from '../../lib/pointer'
import type { RoutePointPickerModel } from './types'

interface RoutePointSearchSheetProps {
  model: RoutePointPickerModel
  variant?: 'overlay' | 'fullscreen'
  safeAreaTop?: string
  safeAreaBottom?: string
}

export default function RoutePointSearchSheet({
  model,
  variant = 'overlay',
  safeAreaTop = 'var(--app-user-safe-top)',
  safeAreaBottom = 'var(--app-user-safe-bottom)',
}: RoutePointSearchSheetProps) {
  const { t } = useTranslation()

  if (!model.showSearch) return null

  const close = () => {
    model.setShowSearch(false)
    model.setSearchResults([])
  }

  const shellClass = variant === 'fullscreen'
    ? 'absolute inset-0 z-[220] bg-white flex flex-col'
    : 'absolute inset-0 z-[600] bg-white md:bg-black/40 md:backdrop-blur-[1px] flex flex-col md:items-center md:justify-start md:pt-20 md:px-4 animate-fade-in'

  const panelClass = variant === 'fullscreen'
    ? 'flex flex-col flex-1 min-h-0 w-full bg-white'
    : 'flex flex-col flex-1 min-h-0 w-full bg-white md:flex-none md:max-w-xl md:rounded-card md:shadow-card md:max-h-[72vh] md:overflow-hidden'

  return (
    <div
      className={shellClass}
      style={{
        paddingTop: variant === 'fullscreen' ? 'var(--app-safe-area-top-total)' : safeAreaTop,
        paddingBottom: variant === 'fullscreen' ? undefined : safeAreaBottom,
      }}
      onClick={variant === 'overlay' ? close : undefined}
    >
      <div className={panelClass} onClick={(event) => event.stopPropagation()}>
        <header className="flex items-center gap-3 px-3 py-3 border-b border-border">
          <button
            type="button"
            onClick={close}
            className="p-2 -ml-1 hover:bg-surface rounded-xl transition-colors"
          >
            <X size={18} />
          </button>
          <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl bg-surface">
            <MagnifyingGlass size={16} className="text-muted flex-shrink-0" />
            <input
              autoFocus={!isCoarsePointer}
              type="text"
              value={model.searchQuery}
              onChange={(e) => model.handleSearch(e.target.value)}
              placeholder={model.activeIsFrom
                ? t('passenger.fromShort', { defaultValue: 'From?' })
                : t('passenger.toShort', { defaultValue: 'To?' })}
              className="flex-1 text-sm font-medium outline-none bg-transparent placeholder:text-muted min-w-0"
            />
            {model.searchQuery && (
              <button
                type="button"
                onClick={() => {
                  model.setSearchQuery('')
                  model.setSearchResults([])
                }}
              >
                <X size={14} className="text-muted" />
              </button>
            )}
          </div>
        </header>
        <div className="flex-1 overflow-y-auto">
          <button
            type="button"
            onClick={close}
            className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface transition-colors border-b border-border/50"
          >
            <div className="w-9 h-9 rounded-full bg-surface flex items-center justify-center">
              <NavigationArrow size={16} weight="fill" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-black">{t('passenger.pickOnMap', { defaultValue: 'Pick point on map' })}</p>
              <p className="text-[11px] text-muted">
                {t('passenger.moveMapToSetPoint', {
                  point: model.activeIsFrom ? 'A' : 'B',
                  defaultValue: `Move map to set point ${model.activeIsFrom ? 'A' : 'B'}`,
                })}
              </p>
            </div>
            <CaretRight size={14} weight="bold" className="text-muted" />
          </button>

          {model.isSearching && (
            <p className="px-4 py-3 text-sm text-muted">{t('common.searching', { defaultValue: 'Searching...' })}</p>
          )}
          {model.searchResults.map((result) => (
            <button
              key={result.place_id}
              type="button"
              onClick={() => model.handleSelectSearchResult(result)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface transition-colors border-b border-border/50 last:border-b-0"
            >
              <div className="w-9 h-9 rounded-full bg-surface flex items-center justify-center flex-shrink-0">
                <MagnifyingGlass size={14} className="text-muted" />
              </div>
              <span className="text-sm text-black flex-1 truncate">{result.display_name}</span>
            </button>
          ))}
          {!model.isSearching && model.searchQuery.length >= 3 && model.searchResults.length === 0 && (
            <p className="px-4 py-3 text-sm text-muted">{t('common.notFound', { defaultValue: 'Nothing found.' })}</p>
          )}
          {model.searchQuery.length < 3 && !model.isSearching && (
            <p className="px-4 py-3 text-sm text-muted">
              {t('passenger.searchMinChars', { defaultValue: 'Start typing address - minimum 3 characters.' })}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
