import type { RideRequest, UserCabinetData, UserCabinetRideHistoryItem } from '../../types'
import type { PaginationParams, RideRequestApi, UserCabinetApi, UserCabinetRideApi } from './contracts'

export function toPageQuery(params?: PaginationParams): string {
  const limit = params?.limit ?? 50
  const offset = params?.offset ?? 0
  return `limit=${encodeURIComponent(String(limit))}&offset=${encodeURIComponent(String(offset))}`
}

export function mapRideRequest(item: RideRequestApi): RideRequest {
  const assignedDriver = item.assignedDriver
    ? {
      id: item.assignedDriver.id,
      name: item.assignedDriver.name,
      photoUrl: item.assignedDriver.photoUrl ?? undefined,
      carBrand: item.assignedDriver.carBrand,
      carModel: item.assignedDriver.carModel,
      carPlate: item.assignedDriver.carPlate,
      vehicleColor: item.assignedDriver.vehicleColor,
      seatsCount: item.assignedDriver.seatsCount,
      rating: item.assignedDriver.rating,
      isOnline: item.assignedDriver.isOnline,
      currentLocation: item.assignedDriver.currentLocation ?? undefined,
    }
    : null
  return {
    id: item.id,
    rideNumber: item.rideNumber,
    passengerName: item.passengerName,
    from: item.fromPoint,
    to: item.toPoint,
    dateTime: item.dateTime,
    dateTimeLocal: item.dateTimeLocal,
    status: item.status,
    groupId: item.groupId,
    driverId: item.driverId,
    pickupChangedByDriver: item.pickupChangedByDriver,
    pickupConfirmedAt: item.pickupConfirmedAt,
    assignedDriver,
    rating: item.rating
      ? {
        canRate: item.rating.canRate,
        myScore: item.rating.myScore,
        myComment: item.rating.myComment,
      }
      : null,
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
    dateTimeLocal: item.dateTimeLocal,
    createdAt: item.createdAt,
    canRateDriver: item.canRateDriver,
  }
}

export function mapUserCabinetData(response: UserCabinetApi): UserCabinetData {
  return {
    userId: response.userId,
    username: response.username,
    pointsBalance: response.pointsBalance,
    rating: response.rating,
    ratingCount: response.ratingCount,
    rideHistory: response.rideHistory.map(mapUserCabinetRide),
    rideHistoryTotal: response.rideHistoryTotal,
    rideHistoryLimit: response.rideHistoryLimit,
    rideHistoryOffset: response.rideHistoryOffset,
  }
}
