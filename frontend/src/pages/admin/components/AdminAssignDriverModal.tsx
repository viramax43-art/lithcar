import type { Driver, RideRequest } from '../../../types'
import AssignDriverModal from './AssignDriverModal'

export function AdminAssignDriverModal({
  assignModalReqIds,
  requests,
  drivers,
  assignDriverId,
  isAssigning,
  onSelectDriver,
  onClose,
  onSubmit,
}: {
  assignModalReqIds: string[] | null
  requests: RideRequest[]
  drivers: Driver[]
  assignDriverId: string
  isAssigning: boolean
  onSelectDriver: (driverId: string) => void
  onClose: () => void
  onSubmit: () => void
}) {
  if (!assignModalReqIds) return null
  return (
    <AssignDriverModal
      requestIds={assignModalReqIds}
      requests={requests}
      drivers={drivers}
      selectedDriverId={assignDriverId}
      isAssigning={isAssigning}
      onSelectDriver={onSelectDriver}
      onClose={onClose}
      onSubmit={onSubmit}
    />
  )
}
