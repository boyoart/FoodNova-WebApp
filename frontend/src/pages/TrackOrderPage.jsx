import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { FullTrackingEntry } from '../components/OrderTracking'
import EmailVerificationNotice from '../components/EmailVerificationNotice'
import OrderHistoryPage from './OrderHistoryPage'
import { useEffect } from 'react'

export function LegacyOrdersPage() {
  const location = useLocation()
  const { user } = useAuthStore()
  return user?.email_verification_required || new URLSearchParams(location.hash.slice(1)).has('track') ? <Navigate to="/track-order" replace /> : <OrderHistoryPage />
}
export default function TrackOrderPage() {
  const { isAuthenticated, isAdmin, user } = useAuthStore()
  useEffect(() => {
    const meta = document.createElement('meta')
    meta.name = 'robots'; meta.content = 'noindex, nofollow, noarchive'
    document.head.append(meta)
    return () => meta.remove()
  }, [])
  return <div><h1 style={{ textAlign: 'center', margin: '2rem 1rem 0' }}>Track Your FoodNova Order</h1><FullTrackingEntry />
    {isAuthenticated && !isAdmin && (user?.email_verification_required ? <EmailVerificationNotice /> : <OrderHistoryPage />)}</div>
}
