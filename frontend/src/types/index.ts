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
  | 'cancelled'

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
  pickupNotifiedAt?: string | null
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
  directionFrom?: string | null
  directionTo?: string | null
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
  /** Minimum A→B distance in km; 0 disables the check. */
  minRideDistanceKm: number
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
  pointsBalance: number
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

export interface PassengerLiveLocation {
  rideId: string
  passengerName: string
  latLng: LatLng
  updatedAt: string
  updatedAtLocal?: string
}

export interface DriverMapData {
  session: DriverSessionInfo
  points: DriverMapPoint[]
  availablePoints?: DriverMapPoint[]
  driverLocation?: LatLng | null
  passengerLocations?: PassengerLiveLocation[]
  activeRides: number
  totalRides: number
  /** Radius (km) actually applied to `availablePoints`; 0 = no limit. */
  availableRadiusKm?: number
  /** Admin-configured default radius (km) for the available-rides filter. */
  defaultAvailableRadiusKm?: number
  /** Available rides hidden by the radius filter in this response. */
  hiddenAvailableRides?: number
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
  | {
      kind: 'ride'
      event: string
      rideId: string
      status?: RideStatus
      /** Вопрос «Поездка состоялась?»: в UI рисуются кнопки [Да]/[Нет]. */
      requiresConfirmation?: boolean
      confirmationKind?: 'ride_completed' | string
      expectedMinutes?: number
      elapsedMinutes?: number
      dueAt?: string | null
    }
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

export type RideChatSenderType = 'driver' | 'passenger' | 'system'

export interface RideChatMessage {
  id: string
  rideId: string
  senderType: RideChatSenderType
  senderName: string
  kind: 'text' | 'quick_reply' | 'system'
  body: string
  payload: Record<string, unknown> | null
  createdAt: string
  mine: boolean
  readByOthers: boolean
}

export interface RideChatParticipant {
  type: 'driver' | 'passenger'
  name: string
  rideId: string
  isMe: boolean
}

export interface RideChatPage {
  rideId: string
  threadKey: string
  items: RideChatMessage[]
  unreadCount: number
  canSend: boolean
  closedReason: string | null
  participants: RideChatParticipant[]
}

/** Состояние жизненного цикла поездки: какие кнопки показывать и какие таймеры активны. */
export interface RideFlowState {
  status: RideStatus
  canChat?: boolean
  canSendMessage?: boolean
  canMarkReady?: boolean
  passengerReady?: boolean
  canBoard?: boolean
  passengerBoarded?: boolean
  passengerBoardedAt?: string | null
  canNudgeDriver?: boolean
  nudgeSecondsLeft?: number
  canCancel?: boolean
  lateCancel?: boolean
  lateCancelFeePercent?: number
  canDisputeStart?: boolean
  disputeSecondsLeft?: number
  canEnRoute?: boolean
  canArrived?: boolean
  canStart?: boolean
  canComplete?: boolean
  canReportNoShow?: boolean
  canExtendWait?: boolean
  canUndo?: boolean
  undoSecondsLeft?: number
  noShowSecondsLeft?: number
  startAvailableInSeconds?: number
  completeAvailableInSeconds?: number
  enRouteAt?: string | null
  arrivedAt?: string | null
  startedAt?: string | null
  waitingSeconds?: number
  waitExtendedUntil?: string | null
  autoNoShowAt?: string | null
  driverWaitingMinutes?: number
  cancelReason?: string | null
  cancelComment?: string | null
  refundedPoints?: number
  driverCompensationPoints?: number
  refundedAt?: string | null
  settlementReason?: string | null
  autoResolvedAt?: string | null
  autoResolveReason?: string | null
  disputeAt?: string | null
  requiresAdminAttention?: boolean
  adminAttentionReason?: string | null
  passengerReadyAt?: string | null
  canEnRouteAt?: string | null
  /** Вопрос «Поездка состоялась?»: водитель начал поездку и не нажал «Завершил». */
  expectedRideMinutes?: number
  estimationSource?: string | null
  completionCheckDueAt?: string | null
  completionCheckAt?: string | null
  completionCheckSecondsLeft?: number
  completionCheckAnswered?: boolean
  completionCheckResult?: string | null
  canConfirmCompletion?: boolean
  completionEscalateAt?: string | null
}

export interface DriverRideFlowPayload {
  rideId: string
  status: RideStatus
  flow: RideFlowState
  chatUnreadCount: number
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
