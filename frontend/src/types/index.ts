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

export interface RideRequest {
  id: string
  passengerName: string
  passengerPhone: string
  from: { address: string; latlng: LatLng }
  to: { address: string; latlng: LatLng }
  dateTime: string
  status: RideStatus
  groupId?: string
  driverId?: string
  createdAt: string
}

export interface Driver {
  id: string
  userId?: string | null
  name: string
  phone: string
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

export interface PricingSettings {
  pointsPerRide: number
  pointPriceCents: number
}

export interface UserCabinetRideHistoryItem {
  id: string
  from: { address: string; latlng: LatLng }
  to: { address: string; latlng: LatLng }
  status: RideStatus
  dateTime: string
  createdAt: string
}

export interface UserCabinetData {
  userId: string
  username: string | null
  pointsBalance: number
  rideHistory: UserCabinetRideHistoryItem[]
  rideHistoryTotal: number
  rideHistoryLimit: number
  rideHistoryOffset: number
}

export interface DriverCabinetRide {
  id: string
  fromAddress: string
  toAddress: string
  fromLatLng: LatLng
  toLatLng: LatLng
  passengerName: string
  passengerPhone: string
  status: RideStatus
  dateTime: string
  createdAt: string
}

export interface DriverCabinetData {
  session: {
    driverId: string
    name: string
    canSellPoints: boolean
  }
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
