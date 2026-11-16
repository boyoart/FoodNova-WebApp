import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { FullTrackingEntry } from '../components/OrderTracking'
import EmailVerificationNotice from '../components/EmailVerificationNotice'
import OrderHistoryPage from './OrderHistoryPage'

export function LegacyOrdersPage() {
  const location = useLocation()
  const { user } = useAuthStore()
  return user?.email_verification_required || new URLSearchParams(location.hash.slice(1)).has('track') ? <Navigate to="/track-order" replace /> : <OrderHistoryPage />
}
export default function TrackOrderPage() {
  const { isAuthenticated, isAdmin, user } = useAuthStore()
  return <div><h1 style={{ textAlign: 'center', margin: '2rem 1rem 0' }}>Track your FoodNova order</h1><FullTrackingEntry />
    {isAuthenticated && !isAdmin && (user?.email_verification_required ? <EmailVerificationNotice /> : <OrderHistoryPage />)}</div>
}
