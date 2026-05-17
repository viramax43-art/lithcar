import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import NewRequest from './pages/passenger/NewRequest'
import MyRequests from './pages/passenger/MyRequests'
import RequestDetail from './pages/passenger/RequestDetail'
import Profile from './pages/passenger/Profile'
import AdminDashboard from './pages/admin/AdminDashboard'
import DriverCabinet from './pages/driver/DriverCabinet'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<NewRequest />} />
        <Route path="/requests" element={<MyRequests />} />
        <Route path="/requests/:id" element={<RequestDetail />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/driver" element={<DriverCabinet />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
