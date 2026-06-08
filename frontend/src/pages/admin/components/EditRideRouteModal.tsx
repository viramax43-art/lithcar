import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, X } from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'
import RoutePointsEditor, { type RoutePointsValue } from '../../../components/RoutePointsEditor'
import { patchAdminRideRoute } from '../../../lib/backend'
import type { RideRequest } from '../../../types'
import { isOverridden, type RideDraft } from './AssignDriverModalParts'

interface EditRideRouteModalProps {
  request: RideRequest
  isSaving: boolean
  onClose: () => void
  onSaved: () => void
  onSavingChange: (saving: boolean) => void
}

function toDraft(request: RideRequest): RideDraft {
  return {
    requestId: request.id,
    fromAddress: request.from.address,
    fromLatLng: { lat: request.from.latlng.lat, lng: request.from.latlng.lng },
    toAddress: request.to.address,
    toLatLng: { lat: request.to.latlng.lat, lng: request.to.latlng.lng },
    active: 'from',
    originalFromAddress: request.from.address,
    originalFromLatLng: { lat: request.from.latlng.lat, lng: request.from.latlng.lng },
    originalToAddress: request.to.address,
    originalToLatLng: { lat: request.to.latlng.lat, lng: request.to.latlng.lng },
  }
}

export default function EditRideRouteModal({
  request,
  isSaving,
  onClose,
  onSaved,
  onSavingChange,
}: EditRideRouteModalProps) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState<RideDraft>(() => toDraft(request))
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    setDraft(toDraft(request))
    setErrorMessage(null)
  }, [request])

  const routeValue = useMemo<RoutePointsValue>(
    () => ({
      fromAddress: draft.fromAddress,
      fromLatLng: draft.fromLatLng,
      toAddress: draft.toAddress,
      toLatLng: draft.toLatLng,
    }),
    [draft],
  )

  const handleSave = useCallback(async () => {
    if (!isOverridden(draft)) {
      onClose()
      return
    }
    onSavingChange(true)
    setErrorMessage(null)
    try {
      await patchAdminRideRoute(request.id, {
        fromPoint: {
          address: draft.fromAddress.trim() || draft.originalFromAddress,
          latlng: draft.fromLatLng,
        },
        toPoint: {
          address: draft.toAddress.trim() || draft.originalToAddress,
          latlng: draft.toLatLng,
        },
      })
      onSaved()
      onClose()
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : t('admin.errors.updateRouteFailed', { defaultValue: 'Failed to update route.' }),
      )
    } finally {
      onSavingChange(false)
    }
  }, [draft, onClose, onSaved, onSavingChange, request.id, t])

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[2100] p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-card shadow-card w-full max-w-3xl max-h-[96vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={onClose} className="p-2 hover:bg-surface rounded-xl transition-colors">
              <ArrowLeft size={18} />
            </button>
            <div className="min-w-0">
              <h2 className="text-base font-bold">{t('admin.editRoute.title', { defaultValue: 'Edit route' })}</h2>
              <p className="text-xs text-muted mt-0.5 truncate">
                {request.passengerName} · {t('common.rideShort', { number: request.rideNumber })}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-surface rounded-xl transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <RoutePointsEditor
            value={routeValue}
            onChange={(value) =>
              setDraft((prev) => ({
                ...prev,
                fromAddress: value.fromAddress,
                fromLatLng: value.fromLatLng,
                toAddress: value.toAddress,
                toLatLng: value.toLatLng,
              }))
            }
            mapHeightClassName="h-72"
          />
          {errorMessage && <p className="text-xs text-red-600 mt-3">{errorMessage}</p>}
        </div>

        <div className="px-5 py-4 border-t border-border flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 h-11 rounded-xl border border-border text-sm font-bold"
          >
            {t('common.cancel', { defaultValue: 'Cancel' })}
          </button>
          <button
            type="button"
            disabled={isSaving || !isOverridden(draft)}
            onClick={() => void handleSave()}
            className="flex-1 h-11 rounded-xl bg-black text-white text-sm font-bold disabled:opacity-50"
          >
            {isSaving ? t('common.saving', { defaultValue: 'Saving...' }) : t('common.save', { defaultValue: 'Save' })}
          </button>
        </div>
      </div>
    </div>
  )
}
