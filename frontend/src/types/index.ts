export interface LatLng {
  lat: number
  lng: number
}

export type RideStatus =
  | 'pending'
  | 'grouped'
  | 'assigned'
  | 'en_route_to_pickup'
  | 'awaiting_passenger'
  | 'in_progress'
  | 'completed'

export interface RideRatingContext {
  canRate: boolean
  myScore: number | null
  myComment: string | null
}

export interface RideRequest {
  id: string
  rideNumber: number
  passengerName: string
  from: { address: string; latlng: LatLng }
  to: { address: string; latlng: LatLng }
  dateTime: string
  status: RideStatus
  groupId?: string
  driverId?: string
  pickupChangedByDriver: boolean
  pickupConfirmedAt: string | null
  assignedDriver?: Driver | null
  rating?: RideRatingContext | null
  createdAt: string
}

export interface Driver {
  id: string
  userId?: string | null
  name: string
  photoUrl?: string | null
  carBrand?: string
  carModel: string
  carPlate: string
  vehicleColor?: string
  seatsCount?: number
  licenseNumber?: string
  about?: string
  canSellPoints?: boolean
  keyPrefix?: string
  createdAt?: string
  rating: number
  currentLocation?: LatLng
  isOnline: boolean
}

export interface GroupSuggestion {
  id: string
  requestIds: string[]
  similarity: number
  reason: string
}

export interface ServiceZone {
  id: string
  name: string
  color: string
  polygon: LatLng[]
  isActive: boolean
  createdAt: string
}

export interface MapDrawing {
  id: string
  title: string
  color: string
  strokeWidth: number
  points: LatLng[]
  createdByRole: string
  createdAt: string
}

export type MapMarkVisibility = 'admin_only' | 'public'

export interface MapMark {
  id: string
  title: string
  color: string
  position: LatLng
  visibility: MapMarkVisibility
  photoKey?: string | null
  photoUrl?: string | null
  createdByRole: string
  createdAt: string
}

export type PricingMode = 'fixed' | 'dynamic'

export interface PricingFormulaTier {
  maxCircuity: number
  distanceMultiplier: number
  minuteMultiplier: number
  label: string
}

export interface PricingFormula {
  version: number
  basePriceCents: number
  pricePerKmCents: number
  pricePerMinuteCents: number
  circuityFreeThreshold: number
  circuityPenaltyPerStepCents: number
  minPriceCents: number
  maxPriceCents: number
  minPoints: number
  requireOsrm: boolean
  fallbackSpeedKmh: number
  tiers: PricingFormulaTier[]
}

export interface UserInfoTextI18n {
  lt: string
  pl: string
  en: string
  ru: string
}

export interface PricingSettings {
  pointsPerRide: number
  pointPriceCents: number
  pricingMode: PricingMode
  pricingFormula: PricingFormula
  userInfoText: UserInfoTextI18n
  workStartTime: string
  workEndTime: string
  slotIntervalMinutes: number
}

export interface RideQuoteBreakdownLine {
  key: string
  label: string
  amountCents: number
}

export interface RideQuoteMetrics {
  straightKm: number
  roadKm: number
  durationMin: number
  circuity: number
  avgSpeedKmh: number
  tierLabel: string
  osrmUsed: boolean
}

export interface RideQuote {
  pricingMode: PricingMode
  points: number
  priceCents: number
  priceEur: number
  metrics: RideQuoteMetrics | null
  breakdown: RideQuoteBreakdownLine[]
}

export interface UserCabinetRideHistoryItem {
  id: string
  rideNumber: number
  from: { address: string; latlng: LatLng }
  to: { address: string; latlng: LatLng }
  status: RideStatus
  dateTime: string
  createdAt: string
  canRateDriver: boolean
}

export interface UserCabinetData {
  userId: string
  username: string | null
  pointsBalance: number
  rating: number
  ratingCount: number
  rideHistory: UserCabinetRideHistoryItem[]
  rideHistoryTotal: number
  rideHistoryLimit: number
  rideHistoryOffset: number
}

export interface DriverCabinetRide {
  id: string
  rideNumber: number
  fromAddress: string
  toAddress: string
  fromLatLng: LatLng
  toLatLng: LatLng
  passengerName: string
  status: RideStatus
  dateTime: string
  createdAt: string
  routeOrder: number | null
  pickupChangedByDriver: boolean
  pickupNotifiedAt: string | null
  pickupConfirmedAt: string | null
  rating?: RideRatingContext | null
}

export interface DriverSessionInfo {
  driverId: string
  name: string
  canSellPoints: boolean
  rating: number
  ratingCount: number
}

export interface DriverMapLinks {
  google: string
  apple: string
  yandex: string
  geo: string
}

export interface DriverMapPoint {
  id: string
  rideId: string
  rideNumber: number
  pointType: 'pickup' | 'dropoff'
  passengerName: string
  passengerTelegramId: string
  passengerTelegramUsername: string | null
  address: string
  latLng: LatLng
  rideStatus: RideStatus
  pointStatus: 'pending' | 'en_route' | 'done'
  recommendedOrder: number | null
  canEdit: boolean
  availableActions: string[]
  mapLinks: DriverMapLinks
  dateTime: string
  pickupChangedByDriver: boolean
  pickupNotifiedAt: string | null
  pickupConfirmedAt: string | null
  passengerRating: number
  passengerRatingCount: number
}

export interface DriverMapData {
  session: DriverSessionInfo
  points: DriverMapPoint[]
  activeRides: number
  totalRides: number
}

export interface DriverCabinetData {
  session: DriverSessionInfo
  rides: DriverCabinetRide[]
  driverDebtEur: number
  recentQrSales: Array<{
    saleId: string
    points: number
    eurAmount: number
    redeemedAt: string | null
    settlementStatus: string
  }>
  total: number
  limit: number
  offset: number
}
