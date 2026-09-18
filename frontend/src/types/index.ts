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

export type DriverRideOfferStatus = 'open' | 'full' | 'cancelled' | 'completed'

export interface DriverRideOffer {
  id: string
  driverId: string
  from: { address: string; latlng: LatLng }
  to: { address: string; latlng: LatLng }
  dateTime: string
  dateTimeLocal?: string
  totalSeats: number
  seatsAvailable: number
  status: DriverRideOfferStatus
  bookingsCount: number
  carBrand: string
  carModel: string
  createdAt: string
  updatedAt: string
}

export interface PassengerRideOffer {
  id: string
  from: { address: string; latlng: LatLng }
  to: { address: string; latlng: LatLng }
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
    photoUrl?: string | null
    carModel: string
    carPlate: string
    rating: number
    seatsCount: number
    telegramUsername?: string | null
  }
}

export interface MatchBreakdown {
  pickupDistanceKm: number
  dropoffDistanceKm: number
  timeDeltaMinutes: number | null
}

export interface MatchedPassengerRideOffer extends PassengerRideOffer {
  matchScore: number
  matchReason?: string | null
  match: MatchBreakdown
}

export interface MatchedRideRequest {
  id: string
  rideNumber: number
  passengerName: string
  passengerTelegramUsername?: string | null
  passengerRating: number
  passengerRatingCount: number
  from: { address: string; latlng: LatLng }
  to: { address: string; latlng: LatLng }
  dateTime: string
  dateTimeLocal?: string
  status: RideStatus
  quotedPoints?: number | null
  matchScore: number
  matchReason?: string | null
  match: MatchBreakdown
}

export interface RideRequest {
  id: string
  rideNumber: number
  passengerName: string
  passengerRating?: number
  passengerRatingCount?: number
  from: { address: string; latlng: LatLng }
  to: { address: string; latlng: LatLng }
  dateTime: string
  dateTimeLocal?: string
  status: RideStatus
  groupId?: string
  driverId?: string
  offerId?: string | null
  pickupChangedByDriver: boolean
  pickupConfirmedAt: string | null
  pickupRevision?: number
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
  canSelfAssign?: boolean
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
  userInfoTextProfile: UserInfoTextI18n
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
  dateTimeLocal?: string
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
  passengerRating: number
  passengerRatingCount: number
  status: RideStatus
  dateTime: string
  dateTimeLocal?: string
  createdAt: string
  passengerNumber: number | null
  pickupChangedByDriver: boolean
  pickupNotifiedAt: string | null
  pickupConfirmedAt: string | null
  pickupRevision?: number
  rating?: RideRatingContext | null
}

export interface DriverSessionInfo {
  driverId: string
  name: string
  canSellPoints: boolean
  canSelfAssign: boolean
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
  passengerNumber: number | null
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
  dateTimeLocal?: string
  pickupChangedByDriver: boolean
  pickupNotifiedAt: string | null
  pickupConfirmedAt: string | null
  pickupRevision?: number
  passengerRating: number
  passengerRatingCount: number
  pointKind?: 'mine' | 'available'
}

export interface DriverMapData {
  session: DriverSessionInfo
  points: DriverMapPoint[]
  availablePoints?: DriverMapPoint[]
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

export interface DriverRideHistoryItem {
  id: string
  rideNumber: number
  passengerName: string
  passengerId: string
  passengerRating: number
  passengerRatingCount: number
  fromAddress: string
  toAddress: string
  status: RideStatus
  dateTime: string
  dateTimeLocal?: string
}

export type DriverFormFieldType = 'text' | 'textarea' | 'file'

export type DriverFormDriverField =
  | 'name'
  | 'carBrand'
  | 'carModel'
  | 'carPlate'
  | 'vehicleColor'
  | 'seatsCount'
  | 'licenseNumber'
  | 'about'
  | 'photo'

export interface DriverRegistrationFormField {
  id: string
  type: DriverFormFieldType
  required: boolean
  order: number
  label: UserInfoTextI18n
  placeholder: UserInfoTextI18n
  helpText: UserInfoTextI18n
  driverField?: DriverFormDriverField | null
  accept?: string | null
}

export interface DriverRegistrationFormSchema {
  introText: UserInfoTextI18n
  fields: DriverRegistrationFormField[]
}

export interface DriverApplicationFileEntry {
  objectKey: string
  fileName: string
  contentType: string
  sizeBytes: number
  fileUrl: string
}

export type DriverApplicationStatus = 'pending' | 'approved' | 'rejected'

export interface DriverApplication {
  id: string
  userId: string
  username: string | null
  status: DriverApplicationStatus
  language: 'lt' | 'pl' | 'en' | 'ru'
  answers: Record<string, string>
  files: Record<string, DriverApplicationFileEntry>
  rejectionReason: string | null
  reviewedBy: string | null
  reviewedAt: string | null
  createdDriverId: string | null
  createdAt: string
  updatedAt: string
}

export type NotificationPool = 'passenger' | 'driver' | 'admin'

export type NotificationPayload =
  | { kind: 'driver_application'; applicationId: string; applicantName?: string }
  | Record<string, unknown>

export interface AppNotification {
  id: string
  pool: NotificationPool
  type: string
  title: string
  body: string
  payload: NotificationPayload | null
  readAt: string | null
  createdAt: string
}

export interface InfoBlock {
  id: string
  pool: 'passenger' | 'driver'
  titleI18n: UserInfoTextI18n
  bodyI18n: UserInfoTextI18n
  audience: 'all' | 'user'
  targetUsername: string | null
  isActive: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface BlockedUser {
  userId: string
  username: string | null
  displayName: string
  blockedAt: string
  blockedAtLocal?: string
}
