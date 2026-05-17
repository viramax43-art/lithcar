import { CaretDown, CaretRight, Clock } from '@phosphor-icons/react'

import { STATUS_CONFIG } from '../constants'
import type { AdminSidebarProps } from './AdminSidebar.types'

type RequestsSuggestionsProps = Pick<
  AdminSidebarProps,
  | 'activeTab'
  | 'filterStatus'
  | 'setFilterStatus'
  | 'requests'
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
  'grouped',
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
  selectedReqId,
  setSelectedReqId,
  setAssignModalReqIds,
  suggestions,
  selectedGroupId,
  setSelectedGroupId,
  groupColorMap,
}: RequestsSuggestionsProps) {
  if (activeTab === 'requests') {
    return (
      <>
        <div className="flex items-center gap-2 mb-3 overflow-x-auto pb-1 -mx-1 px-1">
          {REQUEST_STATUSES.map((status) => (
            <button
              key={status}
              onClick={() => setFilterStatus(status)}
              className={`px-3 py-1.5 rounded-pill text-xs font-semibold whitespace-nowrap transition-colors ${
                filterStatus === status ? 'bg-black text-white' : 'bg-surface text-muted hover:text-black'
              }`}
            >
              {status === 'all' ? 'Все' : STATUS_CONFIG[status]?.label ?? status}
            </button>
          ))}
        </div>
        <div className="space-y-2">
          {requests.map((request) => {
            const status = STATUS_CONFIG[request.status] ?? STATUS_CONFIG.pending
            const selected = selectedReqId === request.id
            return (
              <button
                key={request.id}
                onClick={() => setSelectedReqId(selected ? null : request.id)}
                className={`w-full text-left p-3 rounded-card border-[1.5px] transition-all ${
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
                  <span className="text-[10px] text-muted flex items-center gap-1">
                    <Clock size={10} />
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
                      className="text-[10px] font-bold text-accent-dark bg-accent/10 hover:bg-accent/20 px-2.5 py-1 rounded-pill transition-colors"
                    >
                      Назначить
                    </button>
                  )}
                </div>
              </button>
            )
          })}
          {requests.length === 0 && (
            <p className="text-xs text-muted text-center py-12">Заявок не найдено</p>
          )}
        </div>
      </>
    )
  }

  if (activeTab !== 'suggestions') {
    return null
  }

  return (
    <div className="space-y-3">
      {suggestions.map((suggestion) => {
        const selected = selectedGroupId === suggestion.id
        const color = groupColorMap[suggestion.id] ?? '#858585'
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
              className="w-full text-left p-4 hover:bg-surface/60 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold">Группа</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-pill bg-surface text-muted">
                    {suggestion.requestIds.length} заявок
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold">{suggestion.similarity}%</span>
                  {selected ? <CaretDown size={14} weight="bold" /> : <CaretRight size={14} weight="bold" />}
                </div>
              </div>
              <p className="text-xs text-muted mt-2">{suggestion.reason}</p>
            </button>
            {selected && (
              <div className="px-4 pb-4 space-y-2 border-t border-border bg-surface/40 pt-3">
                {groupRequests.map((request) => (
                  <div key={request.id} className="flex items-center gap-2 text-[11px]">
                    <span className="w-1.5 h-1.5 rounded-full bg-point-a flex-shrink-0" />
                    <span className="truncate">{request.from.address}</span>
                    <span className="text-muted">→</span>
                    <span className="w-1.5 h-1.5 rounded-full bg-point-b flex-shrink-0" />
                    <span className="truncate">{request.to.address}</span>
                  </div>
                ))}
                <button
                  onClick={() => setAssignModalReqIds(suggestion.requestIds)}
                  className="mt-2 w-full py-2.5 bg-black text-white text-xs font-bold rounded-xl transition-all active:scale-[0.97]"
                >
                  Назначить водителя на группу
                </button>
              </div>
            )}
          </div>
        )
      })}
      {suggestions.length === 0 && (
        <p className="text-xs text-muted text-center py-12">Группировок пока нет</p>
      )}
    </div>
  )
}
