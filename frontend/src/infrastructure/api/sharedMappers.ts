import type { RideRequest, UserCabinetData, UserCabinetRideHistoryItem, DriverRideOffer, PassengerRideOffer, MatchedPassengerRideOffer, MatchedRideRequest } from '../../types'
import type { PaginationParams, RideRequestApi, UserCabinetApi, UserCabinetRideApi, DriverRideOfferApi, PassengerRideOfferApi, MatchedPassengerRideOfferApi, MatchedRideRequestApi } from './contracts'

export function toPageQuery(params?: PaginationParams): string {
  const limit = params?.limit ?? 50
  const offset = params?.offset ?? 0
  return `limit=${encodeURIComponent(String(limit))}&offset=${encodeURIComponent(String(offset))}`
}

export function mapRideRequest(item: RideRequestApi): RideRequest {
  const assignedDriver = item.assignedDriver
    ? {
      id: item.assignedDriver.id,
      userId: item.assignedDriver.userId ?? null,
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
    passengerRating: item.passengerRating ?? 5,
    passengerRatingCount: item.passengerRatingCount ?? 0,
    from: item.fromPoint,
    to: item.toPoint,
    dateTime: item.dateTime,
    dateTimeLocal: item.dateTimeLocal,
    status: item.status,
    groupId: item.groupId,
    driverId: item.driverId,
    offerId: item.offerId ?? null,
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

export function mapDriverRideOffer(item: DriverRideOfferApi): DriverRideOffer {
  return {
    id: item.id,
    driverId: item.driverId,
    from: item.fromPoint,
    to: item.toPoint,
    dateTime: item.dateTime,
    dateTimeLocal: item.dateTimeLocal,
    totalSeats: item.totalSeats,
    seatsAvailable: item.seatsAvailable,
    status: item.status,
    bookingsCount: item.bookingsCount,
    carBrand: item.carBrand,
    carModel: item.carModel,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  }
}

export function mapPassengerRideOffer(item: PassengerRideOfferApi): PassengerRideOffer {
  return {
    id: item.id,
    from: item.fromPoint,
    to: item.toPoint,
    dateTime: item.dateTime,
    dateTimeLocal: item.dateTimeLocal,
    seatsAvailable: item.seatsAvailable,
    totalSeats: item.totalSeats,
    quotedPoints: item.quotedPoints,
    bookedByMe: item.bookedByMe ?? false,
    myRequestId: item.myRequestId ?? null,
    driver: {
      id: item.driver.id,
      name: item.driver.name,
      photoUrl: item.driver.photoUrl,
      carModel: item.driver.carModel,
      carPlate: item.driver.carPlate,
      rating: item.driver.rating,
      seatsCount: item.driver.seatsCount,
      telegramUsername: item.driver.telegramUsername ?? null,
    },
  }
}

export function mapMatchedPassengerRideOffer(item: MatchedPassengerRideOfferApi): MatchedPassengerRideOffer {
  const base = mapPassengerRideOffer(item)
  return {
    ...base,
    matchScore: item.matchScore,
    matchReason: item.matchReason ?? null,
    match: item.match,
  }
}

export function mapMatchedRideRequest(item: MatchedRideRequestApi): MatchedRideRequest {
  return {
    id: item.id,
    rideNumber: item.rideNumber,
    passengerName: item.passengerName,
    passengerTelegramUsername: item.passengerTelegramUsername ?? null,
    passengerRating: item.passengerRating ?? 5,
    passengerRatingCount: item.passengerRatingCount ?? 0,
    from: item.fromPoint,
    to: item.toPoint,
    dateTime: item.dateTime,
    dateTimeLocal: item.dateTimeLocal,
    status: item.status,
    quotedPoints: item.quotedPoints ?? null,
    matchScore: item.matchScore,
    matchReason: item.matchReason ?? null,
    match: item.match,
  }
}
