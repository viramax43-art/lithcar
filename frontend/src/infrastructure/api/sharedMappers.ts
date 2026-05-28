import type { RideRequest, UserCabinetData, UserCabinetRideHistoryItem } from '../../types'
import type { PaginationParams, RideRequestApi, UserCabinetApi, UserCabinetRideApi } from './contracts'

export function toPageQuery(params?: PaginationParams): string {
  const limit = params?.limit ?? 50
  const offset = params?.offset ?? 0
  return `limit=${encodeURIComponent(String(limit))}&offset=${encodeURIComponent(String(offset))}`
}

export function mapRideRequest(item: RideRequestApi): RideRequest {
  return {
    id: item.id,
    rideNumber: item.rideNumber,
    passengerName: item.passengerName,
    from: item.fromPoint,
    to: item.toPoint,
    dateTime: item.dateTime,
    status: item.status,
    groupId: item.groupId,
    driverId: item.driverId,
    pickupChangedByDriver: item.pickupChangedByDriver,
    pickupConfirmedAt: item.pickupConfirmedAt,
    createdAt: item.createdAt,
  }
}

export function mapUserCabinetRide(item: UserCabinetRideApi): UserCabinetRideHistoryItem {
  return {
    id: item.id,
    rideNumber: item.rideNumber,
    from: item.fromPoint,
    to: item.toPoint,
    status: item.status,
    dateTime: item.dateTime,
    createdAt: item.createdAt,
  }
}

export function mapUserCabinetData(response: UserCabinetApi): UserCabinetData {
  return {
    userId: response.userId,
    username: response.username,
    pointsBalance: response.pointsBalance,
    rideHistory: response.rideHistory.map(mapUserCabinetRide),
    rideHistoryTotal: response.rideHistoryTotal,
    rideHistoryLimit: response.rideHistoryLimit,
    rideHistoryOffset: response.rideHistoryOffset,
  }
}
