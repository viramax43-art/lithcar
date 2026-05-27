import { useMemo } from 'react'
import { Car, CaretDown, CaretRight, Clock, Lightning, MagnifyingGlass, Path, X } from '@phosphor-icons/react'

import { STATUS_CONFIG } from '../constants'
import type { AdminSidebarProps } from './AdminSidebar.types'

type RequestsSuggestionsProps = Pick<
  AdminSidebarProps,
  | 'activeTab'
  | 'filterStatus'
  | 'setFilterStatus'
  | 'requests'
  | 'requestsTotal'
  | 'isLoadingMoreRequests'
  | 'onLoadMoreRequests'
  | 'searchQuery'
  | 'setSearchQuery'
  | 'selectedReqId'
  | 'setSelectedReqId'
  | 'setAssignModalReqIds'
  | 'suggestions'
  | 'selectedGroupId'
  | 'setSelectedGroupId'
  | 'groupColorMap'
>

const REQUEST_STATUSES = [
  'all',
  'pending',
  'assigned',
  'en_route_to_pickup',
  'awaiting_passenger',
  'in_progress',
  'completed',
]

export function AdminSidebarRequestsSuggestionsSection({
  activeTab,
  filterStatus,
  setFilterStatus,
  requests,
  requestsTotal,
  isLoadingMoreRequests,
  onLoadMoreRequests,
  searchQuery,
  setSearchQuery,
  selectedReqId,
  setSelectedReqId,
  setAssignModalReqIds,
  suggestions,
  selectedGroupId,
  setSelectedGroupId,
  groupColorMap,
}: RequestsSuggestionsProps) {
  const filteredRequests = useMemo(() => {
    if (!searchQuery.trim()) return requests
    const q = searchQuery.toLowerCase()
    return requests.filter(
      (r) =>
        r.passengerName.toLowerCase().includes(q) ||
        r.from.address.toLowerCase().includes(q) ||
        r.to.address.toLowerCase().includes(q)
    )
  }, [requests, searchQuery])

  const canLoadMore = requests.length < requestsTotal

  if (activeTab !== 'requests') return null

  return (
    <>
      {/* Optimization panel — always visible when suggestions exist */}
      {suggestions.length > 0 && (
        <div className="mb-4 space-y-2.5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted flex items-center gap-1.5">
              <Lightning size={12} weight="fill" className="text-amber-500" />
              Оптимизированные маршруты
            </p>
          </div>
          {suggestions.map((suggestion) => {
            const selected = selectedGroupId === suggestion.id
            const color = groupColorMap[suggestion.id] ?? '#8B5CF6'
            const groupRequests = requests.filter((request) => suggestion.requestIds.includes(request.id))

            return (
              <div
                key={suggestion.id}
                className={`rounded-card border-[1.5px] overflow-hidden transition-all ${
                  selected ? 'border-black' : 'border-border'
                }`}
                style={{ borderLeftColor: color, borderLeftWidth: 4 }}
              >
                <button
                  onClick={() => setSelectedGroupId(selected ? null : suggestion.id)}
                  className="w-full text-left p-3 hover:bg-surface/60 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Path size={14} weight="bold" style={{ color }} />
                      <span className="text-sm font-bold">Маршрут</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-pill bg-surface text-muted">
                        {suggestion.requestIds.length} пасс.
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-pill bg-accent/10 text-accent-dark">
                        {suggestion.similarity}% совп.
                      </span>
                      {selected ? <CaretDown size={12} weight="bold" /> : <CaretRight size={12} weight="bold" />}
                    </div>
                  </div>
                  <p className="text-[11px] text-muted mt-1.5 leading-snug">{suggestion.reason}</p>
                </button>
                {selected && (
                  <div className="px-3 pb-3 space-y-2 border-t border-border bg-surface/40 pt-2.5">
                    {groupRequests.map((request, idx) => (
                      <div key={request.id} className="flex items-start gap-2 text-[11px]">
                        <span className="w-5 h-5 rounded-full bg-black text-white flex items-center justify-center text-[9px] font-bold flex-shrink-0 mt-0.5">
                          {idx + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold truncate">{request.passengerName}</p>
                          <p className="text-muted truncate">{request.from.address} → {request.to.address}</p>
                        </div>
                      </div>
                    ))}
                    <button
                      onClick={() => setAssignModalReqIds(suggestion.requestIds)}
                      className="mt-2 w-full py-2.5 bg-black text-white text-xs font-bold rounded-xl transition-all active:scale-[0.97] inline-flex items-center justify-center gap-2"
                    >
                      <Car size={14} weight="fill" />
                      Назначить водителя
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Search input */}
      <div className="relative mb-3">
        <MagnifyingGlass size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Поиск по имени или адресу…"
          className="w-full pl-9 pr-9 py-2.5 rounded-xl border-[1.5px] border-border bg-surface text-sm outline-none focus:border-black focus:bg-white transition-colors"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center hover:bg-border rounded-lg transition-colors touch-none"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Status filter pills */}
      <div className="flex items-center gap-2 mb-3 scroll-x-hide pb-1 -mx-1 px-1">
        {REQUEST_STATUSES.map((status) => (
          <button
            key={status}
            onClick={() => setFilterStatus(status)}
            className={`px-3 py-2 rounded-pill text-xs font-semibold whitespace-nowrap transition-colors touch-compact ${
              filterStatus === status ? 'bg-black text-white' : 'bg-surface text-muted hover:text-black'
            }`}
          >
            {status === 'all' ? 'Все' : STATUS_CONFIG[status]?.label ?? status}
          </button>
        ))}
      </div>

      {/* Requests list */}
      <div className="space-y-2.5">
        {filteredRequests.map((request) => {
          const status = STATUS_CONFIG[request.status] ?? STATUS_CONFIG.pending
          const selected = selectedReqId === request.id
          return (
            <button
              key={request.id}
              onClick={() => setSelectedReqId(selected ? null : request.id)}
              className={`w-full text-left p-3.5 rounded-card border-[1.5px] transition-all touch-none ${
                selected ? 'border-black bg-surface' : 'border-border hover:border-muted'
              }`}
            >
              <div className="flex items-center justify-between mb-2.5">
                <span className="text-sm font-bold truncate">{request.passengerName}</span>
                <span
                  className="text-[10px] font-bold px-2 py-0.5 rounded-pill flex-shrink-0 ml-2"
                  style={{ color: status.color, background: status.bg }}
                >
                  {status.label}
                </span>
              </div>
              <div className="flex gap-2.5">
                <div className="flex flex-col items-center pt-1.5 flex-shrink-0">
                  <div className="w-2 h-2 rounded-full bg-point-a" />
                  <div className="w-px flex-1 bg-border my-1" style={{ minHeight: 12 }} />
                  <div className="w-2 h-2 rounded-full bg-point-b" />
                </div>
                <div className="flex-1 min-w-0 text-xs space-y-2">
                  <p className="truncate">{request.from.address}</p>
                  <p className="truncate">{request.to.address}</p>
                </div>
              </div>
              <div className="mt-2.5 pt-2.5 border-t border-border flex items-center justify-between">
                <span className="text-[11px] text-muted flex items-center gap-1.5">
                  <Clock size={11} />
                  {new Date(request.dateTime).toLocaleString('ru-RU', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
                {!request.driverId && (
                  <button
                    onClick={(event) => {
                      event.stopPropagation()
                      setAssignModalReqIds([request.id])
                    }}
                    className="text-[11px] font-bold text-accent-dark bg-accent/10 hover:bg-accent/20 px-3 py-1.5 rounded-pill transition-colors touch-compact"
                  >
                    Назначить
                  </button>
                )}
              </div>
            </button>
          )
        })}
        {filteredRequests.length === 0 && (
          <p className="text-xs text-muted text-center py-12">Заявок не найдено</p>
        )}

        {/* Load more button */}
        {canLoadMore && !searchQuery && (
          <button
            onClick={onLoadMoreRequests}
            disabled={isLoadingMoreRequests}
            className="w-full py-3.5 mt-2 rounded-xl bg-surface hover:bg-border text-sm font-semibold text-muted transition-colors disabled:opacity-50 touch-none"
          >
            {isLoadingMoreRequests ? (
              <span className="inline-flex items-center gap-2">
                <span className="w-3.5 h-3.5 rounded-full border-2 border-muted/30 border-t-muted animate-spin" />
                Загружаем…
              </span>
            ) : (
              `Показать ещё (${requests.length} из ${requestsTotal})`
            )}
          </button>
        )}
      </div>
    </>
  )
}
