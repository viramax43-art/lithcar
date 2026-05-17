import { create } from 'zustand'
import type { RideRequest, Driver, GroupSuggestion, LatLng, ServiceZone, PricingSettings } from '../types'
import { mockRequests, mockDrivers, mockSuggestions, mockServiceZones } from '../data/mock'

interface AppState {
  requests: RideRequest[]
  drivers: Driver[]
  suggestions: GroupSuggestion[]
  serviceZones: ServiceZone[]
  pricing: PricingSettings

  addRequest: (req: Omit<RideRequest, 'id' | 'createdAt' | 'status'>) => void
  assignDriver: (requestIds: string[], driverId: string) => void
  updateRequestStatus: (requestId: string, status: RideRequest['status']) => void
  updateDriverLocation: (driverId: string, location: LatLng) => void

  addServiceZone: (zone: Omit<ServiceZone, 'id' | 'createdAt'>) => void
  updateServiceZone: (zoneId: string, updates: Partial<Pick<ServiceZone, 'name' | 'color' | 'polygon' | 'isActive'>>) => void
  deleteServiceZone: (zoneId: string) => void

  updatePricing: (updates: Partial<PricingSettings>) => void
}

export const useStore = create<AppState>((set) => ({
  requests: mockRequests,
  drivers: mockDrivers,
  suggestions: mockSuggestions,
  serviceZones: mockServiceZones,
  pricing: { pointsPerRide: 10, pointPriceCents: 50 },

  addRequest: (req) =>
    set((state) => ({
      requests: [
        ...state.requests,
        {
          ...req,
          id: `req-${Date.now()}`,
          status: 'pending' as const,
          createdAt: new Date().toISOString(),
        },
      ],
    })),

  assignDriver: (requestIds, driverId) =>
    set((state) => ({
      requests: state.requests.map((r) =>
        requestIds.includes(r.id) ? { ...r, status: 'assigned' as const, driverId } : r
      ),
    })),

  updateRequestStatus: (requestId, status) =>
    set((state) => ({
      requests: state.requests.map((r) => (r.id === requestId ? { ...r, status } : r)),
    })),

  updateDriverLocation: (driverId, location) =>
    set((state) => ({
      drivers: state.drivers.map((d) =>
        d.id === driverId ? { ...d, currentLocation: location } : d
      ),
    })),

  addServiceZone: (zone) =>
    set((state) => ({
      serviceZones: [
        ...state.serviceZones,
        { ...zone, id: `zone-${Date.now()}`, createdAt: new Date().toISOString() },
      ],
    })),

  updateServiceZone: (zoneId, updates) =>
    set((state) => ({
      serviceZones: state.serviceZones.map((z) =>
        z.id === zoneId ? { ...z, ...updates } : z
      ),
    })),

  deleteServiceZone: (zoneId) =>
    set((state) => ({
      serviceZones: state.serviceZones.filter((z) => z.id !== zoneId),
    })),

  updatePricing: (updates) =>
    set((state) => ({
      pricing: { ...state.pricing, ...updates },
    })),
}))
