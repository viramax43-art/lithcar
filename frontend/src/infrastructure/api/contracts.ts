import type {
  Driver,
  DriverCabinetData,
  GroupSuggestion,
  PricingSettings,
  RideRequest,
  ServiceZone,
  UserCabinetData,
  UserCabinetRideHistoryItem,
} from '../../types'

export interface PaginationParams {
  limit?: number
  offset?: number
}

export interface PaginatedResult<T> {
  items: T[]
  total: number
  limit: number
  offset: number
}

export interface CurrentUser {
  user_id: string
  username: string | null
  role: string
  language: 'lt' | 'pl' | 'en' | 'ru'
  created_at: string
  onboarding_completed: boolean
}

export interface AdminSessionUser {
  role: 'chief_admin' | 'admin' | 'moderator'
  name: string
}

export interface AdminKeyInfo {
  id: string
  name: string
  role: string
  keyPrefix: string
  isActive: boolean
  createdAt: string
  lastUsedAt: string | null
}

export interface DriverSessionUser {
  driverId: string
  name: string
  canSellPoints: boolean
  canSelfAssign: boolean
  rating: number
  ratingCount: number
}

export interface DriverQrIssueResult {
  saleId: string
  token: string
  qrUrl: string
  points: number
  eurAmount: number
}

export interface PassengerQrIssueResult {
  success: boolean
  saleId: string
  token: string
  qrUrl: string
  points: number
  eurAmount: number
}

export interface DriverQrRedeemResult {
  success: boolean
  saleId: string
  pointsAdded: number
  passengerPointsBalance: number
  eurAmount: number
  debtStatus: string
  driverId: string
  driverName: string
  passengerId: string
}

export interface AdminQrSaleAudit {
  saleId: string
  tokenPreview: string
  driverId: string
  driverName: string | null
  userId: string | null
  username: string | null
  pointsAmount: number
  eurAmount: number
  settlementStatus: string
  createdAt: string
  redeemedAt: string | null
  events: Array<{
    id: string
    action: string
    actorType: string
    actorId: string
    payload: Record<string, unknown>
    createdAt: string
  }>
}

export interface AdminPassenger {
  userId: string
  username: string | null
  pointsBalance: number
}

export interface RidePointOverride {
  requestId: string
  fromPoint?: { address: string; latlng: { lat: number; lng: number } }
  toPoint?: { address: string; latlng: { lat: number; lng: number } }
}

export interface RideRequestApi {
  id: string
  rideNumber: number
  passengerId: string
  passengerName: string
  passengerRating?: number
  passengerRatingCount?: number
  fromPoint: { address: string; latlng: { lat: number; lng: number } }
  toPoint: { address: string; latlng: { lat: number; lng: number } }
  dateTime: string
  dateTimeLocal?: string
  status: RideRequest['status']
  groupId?: string
  driverId?: string
  offerId?: string | null
  pickupChangedByDriver: boolean
  pickupNotifiedAt?: string | null
  pickupConfirmedAt: string | null
  pickupRevision?: number
  assignedDriver?: {
    id: string
    userId?: string | null
    name: string
    photoUrl: string | null
    carBrand: string
    carModel: string
    carPlate: string
    vehicleColor: string
    seatsCount: number
    rating: number
    isOnline: boolean
    currentLocation: { lat: number; lng: number } | null
  } | null
  rating?: {
    canRate: boolean
    myScore: number | null
    myComment: string | null
  } | null
  createdAt: string
}

export interface DriverRideOfferApi {
  id: string
  driverId: string
  fromPoint: { address: string; latlng: { lat: number; lng: number } }
  toPoint: { address: string; latlng: { lat: number; lng: number } }
  dateTime: string
  dateTimeLocal?: string
  totalSeats: number
  seatsAvailable: number
  status: 'open' | 'full' | 'cancelled' | 'completed'
  bookingsCount: number
  carBrand: string
  carModel: string
  createdAt: string
  updatedAt: string
}

export interface PassengerRideOfferApi {
  id: string
  fromPoint: { address: string; latlng: { lat: number; lng: number } }
  toPoint: { address: string; latlng: { lat: number; lng: number } }
  dateTime: string
  dateTimeLocal?: string
  seatsAvailable: number
  totalSeats: number
  quotedPoints: number
  bookedByMe?: boolean
  myRequestId?: string | null
  driver: {
    id: string
    name: string
    photoUrl: string | null
    carModel: string
    carPlate: string
    rating: number
    seatsCount: number
    telegramUsername?: string | null
  }
}

export interface MatchBreakdownApi {
  pickupDistanceKm: number
  dropoffDistanceKm: number
  timeDeltaMinutes: number | null
}

export interface MatchedPassengerRideOfferApi extends PassengerRideOfferApi {
  matchScore: number
  matchReason?: string | null
  match: MatchBreakdownApi
}

export interface MatchedRideRequestApi {
  id: string
  rideNumber: number
  passengerName: string
  passengerTelegramUsername?: string | null
  passengerRating?: number
  passengerRatingCount?: number
  fromPoint: { address: string; latlng: { lat: number; lng: number } }
  toPoint: { address: string; latlng: { lat: number; lng: number } }
  dateTime: string
  dateTimeLocal?: string
  status: RideRequest['status']
  quotedPoints?: number | null
  matchScore: number
  matchReason?: string | null
  match: MatchBreakdownApi
}

export interface UserCabinetRideApi {
  id: string
  rideNumber: number
  fromPoint: { address: string; latlng: { lat: number; lng: number } }
  toPoint: { address: string; latlng: { lat: number; lng: number } }
  status: RideRequest['status']
  dateTime: string
  dateTimeLocal?: string
  createdAt: string
  canRateDriver: boolean
}

export interface UserCabinetApi {
  userId: string
  username: string | null
  pointsBalance: number
  rating: number
  ratingCount: number
  rideHistory: UserCabinetRideApi[]
  rideHistoryTotal: number
  rideHistoryLimit: number
  rideHistoryOffset: number
}

export interface BlockedUserApi {
  userId: string
  username: string | null
  displayName: string
  blockedAt: string
  blockedAtLocal?: string
}

export type {
  Driver,
  DriverCabinetData,
  GroupSuggestion,
  PricingSettings,
  ServiceZone,
  UserCabinetData,
  UserCabinetRideHistoryItem,
}
