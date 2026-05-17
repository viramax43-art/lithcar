import { create } from 'zustand'

type SessionStatus = 'idle' | 'loading' | 'ready' | 'error'

interface AppStoreState {
  passengerSessionStatus: SessionStatus
  passengerSessionError: string | null
  setPassengerSessionStatus: (status: SessionStatus) => void
  setPassengerSessionError: (message: string | null) => void
  resetPassengerSession: () => void
}

export const useAppStore = create<AppStoreState>((set) => ({
  passengerSessionStatus: 'idle',
  passengerSessionError: null,
  setPassengerSessionStatus: (status) => set({ passengerSessionStatus: status }),
  setPassengerSessionError: (message) => set({ passengerSessionError: message }),
  resetPassengerSession: () =>
    set({
      passengerSessionStatus: 'idle',
      passengerSessionError: null,
    }),
}))
