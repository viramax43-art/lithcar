import type { NominatimSearchResult } from '../../lib/geocode'
import type { LatLng, ServiceZone } from '../../types'

export interface RoutePointPickerModel {
  activeField: 'from' | 'to'
  setActiveField: (field: 'from' | 'to') => void
  fromPoint: LatLng | null
  toPoint: LatLng | null
  fromAddress: string
  toAddress: string
  activeIsFrom: boolean
  isPinLive: boolean
  pinReadyForConfirm: boolean
  pickupToast: string | null
  setPickupToast?: (message: string | null) => void
  isPanning: boolean
  isResolving: boolean
  pinAddress: string
  showSearch: boolean
  setShowSearch: (open: boolean) => void
  setSearchQuery: (query: string) => void
  setSearchResults: (results: NominatimSearchResult[]) => void
  searchQuery: string
  searchResults: NominatimSearchResult[]
  isSearching: boolean
  handleSearch: (query: string) => void
  handleSelectSearchResult: (result: NominatimSearchResult) => void
  zoneWarning: string | null
  setZoneWarning?: (message: string | null) => void
  pickupZoneCheckActive?: boolean
  confirmPoint: () => void
  setFromPoint: (point: LatLng | null) => void
  setFromAddress: (address: string) => void
  setToPoint: (point: LatLng | null) => void
  setToAddress: (address: string) => void
  armPinFromMapCenter: () => void
}
