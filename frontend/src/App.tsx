import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import OnboardingGate from './components/OnboardingGate'
import NewRequest from './pages/passenger/NewRequest'
import MyRequests from './pages/passenger/MyRequests'
import RequestDetail from './pages/passenger/RequestDetail'
import Profile from './pages/passenger/Profile'
import AdminDashboard from './pages/admin/AdminDashboard'
import DriverCabinet from './pages/driver/DriverCabinet'
import DriverMagicLogin from './pages/driver/DriverMagicLogin'
import DriverRegistration from './pages/driver/DriverRegistration'

function PassengerRoute({ children }: { children: React.ReactNode }) {
  return <OnboardingGate>{children}</OnboardingGate>
}

export default function App() {
  return (
    <BrowserRouter basename="/ride">
      <Routes>
        <Route path="/" element={<PassengerRoute><NewRequest /></PassengerRoute>} />
        <Route path="/requests" element={<PassengerRoute><MyRequests /></PassengerRoute>} />
        <Route path="/requests/:id" element={<PassengerRoute><RequestDetail /></PassengerRoute>} />
        <Route path="/profile" element={<PassengerRoute><Profile /></PassengerRoute>} />
        <Route path="/driver/register" element={<DriverRegistration />} />
        <Route path="/driver/enter/:token" element={<DriverMagicLogin />} />
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/driver" element={<DriverCabinet />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
