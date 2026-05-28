import { useEffect, useMemo, useState } from 'react'
import { CaretRight, Clock, MagnifyingGlass, X } from '@phosphor-icons/react'

import { MAP_COLOR_GROUPS, STATUS_CONFIG } from '../constants'
import type { AdminSidebarProps } from './AdminSidebar.types'

type RequestsSuggestionsProps = Pick<
  AdminSidebarProps,
  | 'activeTab'
  | 'filterDate'
  | 'filterDateEnd'
  | 'filterTime'
  | 'filterTimeEnd'
  | 'enabledColors'
  | 'requests'
  | 'requestsTotal'
  | 'isLoadingMoreRequests'
  | 'onLoadMoreRequests'
  | 'searchQuery'
  | 'setSearchQuery'
  | 'selectedReqId'
  | 'setSelectedReqId'
  | 'setAssignModalReqIds'
>

export function AdminSidebarRequestsSuggestionsSection({
  activeTab,
  filterDate,
  filterDateEnd,
  filterTime,
  filterTimeEnd,
  enabledColors,
  requests,
  requestsTotal,
  isLoadingMoreRequests,
  onLoadMoreRequests,
  searchQuery,
  setSearchQuery,
  selectedReqId,
  setSelectedReqId,
  setAssignModalReqIds,
}: RequestsSuggestionsProps) {
  const [manualGroupIds, setManualGroupIds] = useState<string[]>([])

  const requestsInDateTimeWindow = useMemo(() => {
    return requests.filter((request) => {
      const reqDate = new Date(request.dateTime)

      if (filterDate) {
        const startDate = new Date(`${filterDate}T00:00:00`)
        const endDate = filterDateEnd
          ? new Date(`${filterDateEnd}T23:59:59`)
          : new Date(`${filterDate}T23:59:59`)
        if (reqDate < startDate || reqDate > endDate) return false
      }

      if (filterTime) {
        const [startH, startM] = filterTime.split(':').map(Number)
        const reqMinutes = reqDate.getHours() * 60 + reqDate.getMinutes()
        const startMinutes = startH * 60 + startM
        if (filterTimeEnd) {
          const [endH, endM] = filterTimeEnd.split(':').map(Number)
          const endMinutes = endH * 60 + endM
          if (reqMinutes < startMinutes || reqMinutes > endMinutes) return false
        } else if (reqMinutes < startMinutes || reqMinutes > startMinutes + 30) {
          return false
        }
      }

      return true
    })
  }, [requests, filterDate, filterDateEnd, filterTime, filterTimeEnd])

  const filteredRequests = useMemo(() => {
    // Apply color filter (status group)
    const enabledStatuses = new Set(
      MAP_COLOR_GROUPS.filter((g) => enabledColors.has(g.key)).flatMap((g) => g.statuses),
    )
    const byColor = requestsInDateTimeWindow.filter((r) => enabledStatuses.has(r.status))

    if (!searchQuery.trim()) return byColor
    const q = searchQuery.toLowerCase()
    return byColor.filter(
      (r) =>
        String(r.rideNumber).includes(q) ||
        r.passengerName.toLowerCase().includes(q) ||
        r.from.address.toLowerCase().includes(q) ||
        r.to.address.toLowerCase().includes(q)
    )
  }, [requestsInDateTimeWindow, enabledColors, searchQuery])

  const canLoadMore = requests.length < requestsTotal

  useEffect(() => {
    const visibleIds = new Set(filteredRequests.map((r) => r.id))
    setManualGroupIds((prev) => prev.filter((id) => visibleIds.has(id)))
  }, [filteredRequests])

  if (activeTab !== 'requests') return null

  return (
    <>
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

      {manualGroupIds.length > 0 && (
        <div className="mb-3 rounded-xl border border-violet-200 bg-violet-50/60 px-3 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold text-violet-700">
              Выбрано в группу: {manualGroupIds.length}
            </p>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setManualGroupIds([])}
                className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-white border border-violet-200 text-violet-700 hover:bg-violet-100 transition-colors touch-compact"
              >
                Очистить
              </button>
              <button
                onClick={() => setAssignModalReqIds(manualGroupIds)}
                className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-black text-white hover:bg-black/90 transition-colors touch-compact"
              >
                Назначить группу
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Requests list */}
      <div className="space-y-2.5">
        {filteredRequests.map((request) => {
          const status = STATUS_CONFIG[request.status] ?? STATUS_CONFIG.pending
          const selected = selectedReqId === request.id
          const inManualGroup = manualGroupIds.includes(request.id)
          return (
            <button
              key={request.id}
              onClick={() => setSelectedReqId(selected ? null : request.id)}
              className={`w-full text-left p-3.5 rounded-card border-[1.5px] transition-all touch-none ${
                selected ? 'border-black bg-surface' : inManualGroup ? 'border-violet-400 bg-violet-50/30' : 'border-border hover:border-muted'
              }`}
            >
              <div className="flex items-center justify-between mb-2.5 gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  {/* Color dot matching map marker color */}
                  {(() => {
                    const colorGroup = MAP_COLOR_GROUPS.find((g) => g.statuses.includes(request.status))
                    return colorGroup ? (
                      <span
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0 border border-white shadow-sm"
                        style={{ backgroundColor: colorGroup.hex }}
                        title={colorGroup.label}
                      />
                    ) : null
                  })()}
                  <span className="text-sm font-bold truncate">{request.passengerName}</span>
                </div>
                <span
                  className="text-[10px] font-bold px-2 py-0.5 rounded-pill flex-shrink-0 ml-2"
                  style={{ color: status.color, background: status.bg }}
                >
                  {status.label}
                </span>
              </div>
              <p className="text-[11px] text-muted -mt-1 mb-2">Поездка №{request.rideNumber}</p>
              {request.driverId && request.status !== 'completed' && (
                <p className="text-[10px] font-bold text-green-700 bg-green-50 border border-green-200 rounded-pill px-2 py-1 inline-flex mb-2">
                  Водитель назначен
                </p>
              )}
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
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={(event) => {
                      event.stopPropagation()
                      setManualGroupIds((prev) => prev.includes(request.id) ? prev.filter((id) => id !== request.id) : [...prev, request.id])
                    }}
                    className={`text-[11px] font-bold px-3 py-1.5 rounded-pill transition-colors touch-compact ${
                      inManualGroup
                        ? 'text-violet-700 bg-violet-100 border border-violet-300'
                        : 'text-violet-700 bg-violet-50 hover:bg-violet-100 border border-violet-200'
                    }`}
                  >
                    {inManualGroup ? 'Убрать' : 'В группу'}
                  </button>
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
