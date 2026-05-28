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
  fromPoint: { address: string; latlng: { lat: number; lng: number } }
  toPoint: { address: string; latlng: { lat: number; lng: number } }
  dateTime: string
  status: RideRequest['status']
  groupId?: string
  driverId?: string
  pickupChangedByDriver: boolean
  pickupConfirmedAt: string | null
  assignedDriver?: {
    id: string
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

export interface UserCabinetRideApi {
  id: string
  rideNumber: number
  fromPoint: { address: string; latlng: { lat: number; lng: number } }
  toPoint: { address: string; latlng: { lat: number; lng: number } }
  status: RideRequest['status']
  dateTime: string
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

export type {
  Driver,
  DriverCabinetData,
  GroupSuggestion,
  PricingSettings,
  ServiceZone,
  UserCabinetData,
  UserCabinetRideHistoryItem,
}
