import { useEffect, useMemo, useState } from 'react'

import { getInitialSidebarUi } from '../../../lib/adminUiState'
import { usePersistAdminUiSlice } from '../../../lib/useAdminUiPersistence'
import { CaretRight, Clock, MagnifyingGlass, X } from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'

import RatingBadge from '../../../components/RatingBadge'
import InlineConfirm from './InlineConfirm'
import { formatRideDateTime } from '../../../i18n/dateTime'
import { matchesPeriodFilter } from '../../../lib/periodFilter'
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
  | 'handleUnassignDriver'
  | 'unassigningRequestId'
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
  handleUnassignDriver,
  unassigningRequestId,
}: RequestsSuggestionsProps) {
  const { t } = useTranslation()
  const initialSidebarUi = getInitialSidebarUi()
  const [manualGroupIds, setManualGroupIds] = useState<string[]>(initialSidebarUi.manualGroupIds)

  const sidebarGroupsPersistence = useMemo(() => ({ manualGroupIds }), [manualGroupIds])
  usePersistAdminUiSlice('sidebar', sidebarGroupsPersistence)

  const getPickupColor = (status?: string): string => {
    if (status === 'completed') return '#22C55E'
    return '#F59E0B'
  }

  const getDropoffColor = (status?: string): string => {
    if (status === 'completed') return '#22C55E'
    return '#3B82F6'
  }

  const requestsInDateTimeWindow = useMemo(() => {
    return requests.filter((request) =>
      matchesPeriodFilter(
        { dateTime: request.dateTime, dateTimeLocal: request.dateTimeLocal },
        { filterDate, filterDateEnd, filterTime, filterTimeEnd },
      ),
    )
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
          placeholder={t('admin.requests.searchPlaceholder', { defaultValue: 'Search by name or address...' })}
          className="w-full pl-9 pr-9 py-2.5 rounded-xl border-[1.5px] border-border bg-surface text-sm outline-none focus:border-black focus:bg-white transition-colors"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center hover:bg-border rounded-lg transition-colors touch-none"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {manualGroupIds.length > 0 && (
        <div className="mb-3 rounded-xl border border-violet-200 bg-violet-50/60 px-3 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold text-violet-700">
              {t('admin.requests.groupSelected', { count: manualGroupIds.length, defaultValue: `Selected in group: ${manualGroupIds.length}` })}
            </p>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setManualGroupIds([])}
                className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-white border border-violet-200 text-violet-700 hover:bg-violet-100 transition-colors touch-compact"
              >
                {t('common.clear', { defaultValue: 'Clear' })}
              </button>
              <button
                onClick={() => setAssignModalReqIds(manualGroupIds)}
                className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-black text-white hover:bg-black/90 transition-colors touch-compact"
              >
                {t('admin.requests.assignGroup', { defaultValue: 'Assign group' })}
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
            <div
              key={request.id}
              className={`w-full p-3.5 rounded-card border-[1.5px] transition-all ${
                selected ? 'border-black bg-surface' : inManualGroup ? 'border-violet-400 bg-violet-50/30' : 'border-border hover:border-muted'
              }`}
            >
              {/* Selectable area is a real button; footer actions live outside to avoid nested interactive elements */}
              <button
                type="button"
                onClick={() => setSelectedReqId(selected ? null : request.id)}
                className="w-full text-left block cursor-pointer"
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
                        title={t(colorGroup.labelKey, { defaultValue: colorGroup.labelKey })}
                      />
                    ) : null
                  })()}
                  <div className="min-w-0">
                    <span className="text-sm font-bold truncate block">{request.passengerName}</span>
                    <RatingBadge
                      rating={request.passengerRating ?? 5}
                      ratingCount={request.passengerRatingCount}
                      size="sm"
                    />
                  </div>
                </div>
                <span
                  className="text-[10px] font-bold px-2 py-0.5 rounded-pill flex-shrink-0 ml-2"
                  style={{ color: status.color, background: status.bg }}
                >
                  {t(status.labelKey, { defaultValue: status.labelKey })}
                </span>
              </div>
              <p className="text-[11px] text-muted -mt-1 mb-2">{t('passenger.rideNumber', { number: request.rideNumber, defaultValue: `Ride number: ${request.rideNumber}` })}</p>
              {request.driverId && request.status !== 'completed' && (
                <p className="text-[10px] font-bold text-green-700 bg-green-50 border border-green-200 rounded-pill px-2 py-1 inline-flex mb-2">
                  {t('passenger.driverAssigned', { defaultValue: 'Driver assigned' })}
                </p>
              )}
              <div className="flex gap-2.5">
                <div className="flex flex-col items-center pt-1.5 flex-shrink-0">
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: getPickupColor(request.status) }}
                  />
                  <div className="w-px flex-1 bg-border my-1" style={{ minHeight: 12 }} />
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: getDropoffColor(request.status) }}
                  />
                </div>
                <div className="flex-1 min-w-0 text-xs space-y-2">
                  <p className="truncate">{request.from.address}</p>
                  <p className="truncate">{request.to.address}</p>
                </div>
              </div>
              </button>
              <div className="mt-2.5 pt-2.5 border-t border-border flex items-center justify-between">
                <span className="text-[11px] text-muted flex items-center gap-1.5">
                  <Clock size={11} />
                  {formatRideDateTime(request, {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => {
                      setManualGroupIds((prev) => prev.includes(request.id) ? prev.filter((id) => id !== request.id) : [...prev, request.id])
                    }}
                    className={`text-[11px] font-bold px-3 py-2 rounded-pill transition-colors min-h-[44px] ${
                      inManualGroup
                        ? 'text-violet-700 bg-violet-100 border border-violet-300'
                        : 'text-violet-700 bg-violet-50 hover:bg-violet-100 border border-violet-200'
                    }`}
                  >
                    {inManualGroup
                      ? t('common.remove', { defaultValue: 'Remove' })
                      : t('admin.requests.toGroup', { defaultValue: 'To group' })}
                  </button>
                  {!request.driverId && (
                    <button
                      onClick={() => setAssignModalReqIds([request.id])}
                      className="text-[11px] font-bold text-accent-dark bg-accent/10 hover:bg-accent/20 px-3 py-2 rounded-pill transition-colors min-h-[44px]"
                    >
                      {t('admin.requests.assign', { defaultValue: 'Assign' })}
                    </button>
                  )}
                  {request.driverId && request.status === 'assigned' && (
                    unassigningRequestId === request.id ? (
                      <span className="min-h-[44px] inline-flex items-center px-3 text-[11px] font-semibold text-muted">
                        {t('common.updating')}
                      </span>
                    ) : (
                      <InlineConfirm
                        label={t('admin.requests.unassignDriver')}
                        confirmLabel={t('admin.requests.confirmUnassignDriver')}
                        onConfirm={() => void handleUnassignDriver(request.id)}
                        className="min-h-[44px]"
                      />
                    )
                  )}
                </div>
              </div>
            </div>
          )
        })}
        {filteredRequests.length === 0 && (
          <p className="text-xs text-muted text-center py-12">{t('admin.requests.empty', { defaultValue: 'No requests found' })}</p>
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
                {t('common.loading', { defaultValue: 'Loading...' })}
              </span>
            ) : (
              t('common.showMoreWithCount', {
                loaded: requests.length,
                total: requestsTotal,
                defaultValue: `Show more (${requests.length} of ${requestsTotal})`,
              })
            )}
          </button>
        )}
      </div>
    </>
  )
}
