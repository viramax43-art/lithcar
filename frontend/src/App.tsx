import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import OnboardingGate from './components/OnboardingGate'
import NewRequest from './pages/passenger/NewRequest'
import MyRequests from './pages/passenger/MyRequests'
import RequestDetail from './pages/passenger/RequestDetail'
import Profile from './pages/passenger/Profile'
import AdminDashboard from './pages/admin/AdminDashboard'
import DriverCabinet from './pages/driver/DriverCabinet'
import DriverMagicLogin from './pages/driver/DriverMagicLogin'
import DriverQrRedeem from './pages/driver/DriverQrRedeem'
import DriverRegistration from './pages/driver/DriverRegistration'
import BotAddressPicker from './pages/bot/BotAddressPicker'
import { getLastAppShell, isDriverShellActive } from './lib/driverShell'

/**
 * Driver-shell guard (TZ D3).
 *
 * While the driver cabinet is the active shell, passenger routes are not
 * reachable — neither by browser back / Telegram swipe nor by stale links.
 * The only way into the passenger app is an explicit action that calls
 * `exitToPassengerApp()` (driver side menu → "passenger cabinet").
 */
function DriverShellGuard({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  if (isDriverShellActive()) {
    return <Navigate to="/driver" replace state={{ blockedPassengerPath: location.pathname }} />
  }
  return <>{children}</>
}

function PassengerRoute({ children }: { children: React.ReactNode }) {
  return (
    <DriverShellGuard>
      <OnboardingGate>{children}</OnboardingGate>
    </DriverShellGuard>
  )
}

/** If the driver left Telegram mid-session, reopen Mini App on the driver cabinet. */
function HomeEntry() {
  const [ready, setReady] = useState(false)
  const [preferDriver, setPreferDriver] = useState(false)

  useEffect(() => {
    setPreferDriver(getLastAppShell() === 'driver')
    setReady(true)
  }, [])

  if (!ready) return null
  if (preferDriver) return <Navigate to="/driver" replace />
  return (
    <PassengerRoute>
      <NewRequest />
    </PassengerRoute>
  )
}

export default function App() {
  return (
    <BrowserRouter basename="/ride">
      <Routes>
        <Route path="/" element={<HomeEntry />} />
        <Route path="/requests" element={<PassengerRoute><MyRequests /></PassengerRoute>} />
        <Route path="/requests/:id" element={<PassengerRoute><RequestDetail /></PassengerRoute>} />
        <Route path="/profile" element={<PassengerRoute><Profile /></PassengerRoute>} />
        <Route path="/driver/register" element={<DriverRegistration />} />
        <Route path="/driver/enter/:token" element={<DriverMagicLogin />} />
        <Route path="/qr/:token" element={<DriverQrRedeem />} />
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/bot/pick" element={<BotAddressPicker />} />
        <Route path="/driver" element={<DriverCabinet />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
