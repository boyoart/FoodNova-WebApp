import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import toast from 'react-hot-toast'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import ErrorBoundary from './components/ErrorBoundary'
import FloatingCartButton from './components/FloatingCartButton'
import PWAInstallPrompt from './components/PWAInstallPrompt'
import HomePage from './pages/HomePage'
import ProductsPage from './pages/ProductsPage'
import CartPage from './pages/CartPage'
import CheckoutPage from './pages/CheckoutPage'
import LoginPage from './pages/LoginPage'
import OnboardingPage from './pages/OnboardingPage'
import AuthLandingPage from './pages/AuthLandingPage'
import RegisterPage from './pages/RegisterPage'
import OrderHistoryPage from './pages/OrderHistoryPage'
import AdminLoginPage from './pages/AdminLoginPage'
import AdminDashboard from './pages/AdminDashboard'
import AdminOrders from './pages/AdminOrders'
import AdminStock from './pages/AdminStock'
import AdminPayments from './pages/AdminPayments'
import AdminBroadcasts from './pages/AdminBroadcasts'
import AdminCustomers from './pages/AdminCustomers'
import AdminAuditLogs from './pages/AdminAuditLogs'
import AdminUsers from './pages/AdminUsers'
import AdminRiders from './pages/AdminRiders'
import AdminCancellations from './pages/AdminCancellations'
import AdminExports from './pages/AdminExports'
import AdminReports from './pages/AdminReports'
import PrivacyPolicy from './pages/PrivacyPolicy'
import TermsPage from './pages/TermsPage'
import FAQPage from './pages/FAQPage'
import PoliciesPage from './pages/PoliciesPage'
import TrackOrderPage from './pages/TrackOrderPage'
import ContactPage from './pages/ContactPage'
import NotFoundPage from './pages/NotFoundPage'
import ProfilePage from './pages/ProfilePage'
import InboxPage from './pages/InboxPage'
import InvoicePage from './pages/InvoicePage'
import { useAuthStore } from './store/authStore'
import {
  enforceSessionTimeout,
  SESSION_EXPIRED_EVENT,
  startSessionWatcher,
  stopSessionWatcher,
  updateLastActivity,
} from './utils/sessionManager'
import './modal-scroll-fix.css'


function RootEntry() {
  const hasToken = !!localStorage.getItem('token')
  const isGuest = localStorage.getItem('guestMode') === 'true'
  const onboardingCompleted = localStorage.getItem('foodnova_onboarding_complete') === 'true' || localStorage.getItem('onboardingCompleted') === 'true'

  if (!onboardingCompleted) {
    return <Navigate to="/onboarding" replace />
  }

  if (!hasToken && !isGuest) {
    return <Navigate to="/auth" replace />
  }

  return <HomePage />
}

function RequireCustomerAuth({ children }) {
  const hasToken = !!localStorage.getItem('token')
  if (!hasToken) return <Navigate to="/auth" replace />
  return children
}

function SessionSupervisor() {
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    const handleExpired = (event) => {
      useAuthStore.setState({ user: null, admin: null, isAuthenticated: false, isAdmin: false })
      toast.error('Session expired. Please log in again.')
      navigate(event.detail?.role === 'admin' ? '/admin/login' : '/auth', { replace: true })
    }

    window.addEventListener(SESSION_EXPIRED_EVENT, handleExpired)
    startSessionWatcher()

    return () => {
      window.removeEventListener(SESSION_EXPIRED_EVENT, handleExpired)
      stopSessionWatcher()
    }
  }, [navigate])

  useEffect(() => {
    if (!enforceSessionTimeout()) updateLastActivity()
  }, [location.pathname, location.search])

  return null
}

function App() {
  return (
    <BrowserRouter>
      <ErrorBoundary>
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
          <SessionSupervisor />
          <Navbar />
          <main style={{ flex: 1, paddingTop: '60px' }}>
            <Routes>
              <Route path="/" element={<RootEntry />} />
              <Route path="/onboarding" element={<OnboardingPage />} />
              <Route path="/auth" element={<AuthLandingPage />} />
              <Route path="/products" element={<ProductsPage />} />
              <Route path="/cart" element={<CartPage />} />
              <Route path="/checkout" element={<RequireCustomerAuth><CheckoutPage /></RequireCustomerAuth>} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/orders" element={<RequireCustomerAuth><OrderHistoryPage /></RequireCustomerAuth>} />
              <Route path="/orders/:orderId/invoice" element={<RequireCustomerAuth><InvoicePage /></RequireCustomerAuth>} />
              <Route path="/profile" element={<RequireCustomerAuth><ProfilePage /></RequireCustomerAuth>} />
              <Route path="/inbox" element={<RequireCustomerAuth><InboxPage /></RequireCustomerAuth>} />
              <Route path="/inbox/*" element={<RequireCustomerAuth><InboxPage /></RequireCustomerAuth>} />
              <Route path="/notifications" element={<RequireCustomerAuth><InboxPage /></RequireCustomerAuth>} />
              <Route path="/customer/inbox" element={<RequireCustomerAuth><InboxPage /></RequireCustomerAuth>} />
              <Route path="/admin/login" element={<AdminLoginPage />} />
              <Route path="/admin/dashboard" element={<AdminDashboard />} />
              <Route path="/admin/orders" element={<AdminOrders />} />
              <Route path="/admin/cancellations" element={<AdminCancellations />} />
              <Route path="/admin/riders" element={<AdminRiders />} />
              <Route path="/admin/orders/:orderId/invoice" element={<InvoicePage />} />
              <Route path="/admin/stock" element={<AdminStock />} />
              <Route path="/admin/payments" element={<AdminPayments />} />
              <Route path="/admin/broadcasts" element={<AdminBroadcasts />} />
              <Route path="/admin/customers" element={<AdminCustomers />} />
              <Route path="/admin/audit-logs" element={<AdminAuditLogs />} />
              <Route path="/admin/users" element={<AdminUsers />} />
              <Route path="/admin/reports" element={<AdminReports />} />
              <Route path="/admin/exports" element={<AdminExports />} />
              <Route path="/privacy" element={<PrivacyPolicy />} />
              <Route path="/terms" element={<TermsPage />} />
              <Route path="/faq" element={<FAQPage />} />
              <Route path="/policies" element={<PoliciesPage />} />
              <Route path="/tracking" element={<RequireCustomerAuth><TrackOrderPage /></RequireCustomerAuth>} />
              <Route path="/track-order" element={<RequireCustomerAuth><TrackOrderPage /></RequireCustomerAuth>} />
              <Route path="/contact" element={<ContactPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </main>
          <Footer />
          <FloatingCartButton />
          <PWAInstallPrompt />
          <Toaster position="bottom-right" />
        </div>
      </ErrorBoundary>
    </BrowserRouter>
  )
}

export default App
