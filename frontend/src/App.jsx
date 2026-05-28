import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import toast from 'react-hot-toast'
import { App as CapacitorApp } from '@capacitor/app'
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
import AdminAnnouncements from './pages/AdminAnnouncements'
import AdminCustomers from './pages/AdminCustomers'
import AdminAuditLogs from './pages/AdminAuditLogs'
import AdminUsers from './pages/AdminUsers'
import AdminRiders from './pages/AdminRiders'
import AdminRiderVerificationQueue from './pages/AdminRiderVerificationQueue'
import AdminCancellations from './pages/AdminCancellations'
import AdminExports from './pages/AdminExports'
import AdminReports from './pages/AdminReports'
import AdminSettings from './pages/AdminSettings'
import ComingSoonPage from './pages/ComingSoonPage'
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
import DeliveryAppComingSoon from './pages/DeliveryAppComingSoon'
import WebSplashScreen from './components/WebSplashScreen'
import { useAuthStore } from './store/authStore'
import { WEBSITE_SETTINGS_EVENT, getWebsiteSettings, isAdminPath } from './utils/websiteSettings'
import {
  enforceSessionTimeout,
  expireAdminSessionForTesting,
  expireCustomerSessionForTesting,
  startSessionWatcher,
} from './utils/sessionManager'
import './modal-scroll-fix.css'


function RootEntry() {
  const hasToken = !!(localStorage.getItem('token') || localStorage.getItem('foodnova_token'))
  const isGuest = localStorage.getItem('guestMode') === 'true'
  const user = useAuthStore((state) => state.user)
  const onboardingCompleted = localStorage.getItem('foodnova_onboarding_complete') === 'true' || localStorage.getItem('onboardingCompleted') === 'true'

  if (!onboardingCompleted) {
    return <Navigate to="/onboarding" replace />
  }

  if (!hasToken && !isGuest) {
    return <Navigate to="/auth" replace />
  }

  if (user?.role === 'messenger' || user?.delivery_worker_type === 'messenger') {
    return <Navigate to="/delivery-app-coming-soon" replace />
  }

  if (user?.role === 'rider' || user?.delivery_worker_type === 'rider') {
    return <Navigate to="/delivery-app-coming-soon" replace />
  }

  return <HomePage />
}

function RequireCustomerAuth({ children }) {
  const hasToken = !!(localStorage.getItem('token') || localStorage.getItem('foodnova_token'))
  const user = useAuthStore((state) => state.user)
  if (!hasToken) return <Navigate to="/auth" replace />
  if (user?.role === 'messenger') return <Navigate to="/delivery-app-coming-soon" replace />
  if (user?.role === 'rider') return <Navigate to="/delivery-app-coming-soon" replace />
  return children
}

function SessionSupervisor() {
  const navigate = useNavigate()
  const location = useLocation()
  const notifySessionExpired = (message) => {
    useAuthStore.setState({ user: null, admin: null, isAuthenticated: false, isAdmin: false })
    toast.error(message)
  }

  useEffect(() => {
    enforceSessionTimeout({ navigate, notify: notifySessionExpired })
    const stopWatcher = startSessionWatcher({ navigate, notify: notifySessionExpired })
    let appStateHandle

    CapacitorApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive) enforceSessionTimeout({ navigate, notify: notifySessionExpired })
    }).then((handle) => {
      appStateHandle = handle
    }).catch(() => {
      appStateHandle = null
    })

    if (import.meta.env.DEV) {
      window.foodnovaExpireCustomerSession = () => {
        expireCustomerSessionForTesting()
        window.location.reload()
      }
      window.foodnovaExpireAdminSession = () => {
        expireAdminSessionForTesting()
        window.location.reload()
      }
    }

    return () => {
      stopWatcher?.()
      appStateHandle?.remove?.()
      if (import.meta.env.DEV) {
        delete window.foodnovaExpireCustomerSession
        delete window.foodnovaExpireAdminSession
      }
    }
  }, [navigate])

  useEffect(() => {
    enforceSessionTimeout({ navigate, notify: notifySessionExpired })
  }, [location.pathname, location.search])

  return null
}

function WebsiteModeGate() {
  const location = useLocation()
  const navigate = useNavigate()
  const [settings, setSettings] = useState(getWebsiteSettings)

  useEffect(() => {
    const syncSettings = () => setSettings(getWebsiteSettings())
    window.addEventListener(WEBSITE_SETTINGS_EVENT, syncSettings)
    window.addEventListener('storage', syncSettings)
    return () => {
      window.removeEventListener(WEBSITE_SETTINGS_EVENT, syncSettings)
      window.removeEventListener('storage', syncSettings)
    }
  }, [])

  useEffect(() => {
    const isAdminRoute = isAdminPath(location.pathname)
    if (settings.comingSoonEnabled && !isAdminRoute && location.pathname !== '/coming-soon') {
      navigate('/coming-soon', { replace: true })
    }
    if (!settings.comingSoonEnabled && location.pathname === '/coming-soon') {
      navigate('/', { replace: true })
    }
  }, [location.pathname, navigate, settings.comingSoonEnabled])

  return null
}

function App() {
  const [settings, setSettings] = useState(getWebsiteSettings)

  useEffect(() => {
    const syncSettings = () => setSettings(getWebsiteSettings())
    window.addEventListener(WEBSITE_SETTINGS_EVENT, syncSettings)
    window.addEventListener('storage', syncSettings)
    return () => {
      window.removeEventListener(WEBSITE_SETTINGS_EVENT, syncSettings)
      window.removeEventListener('storage', syncSettings)
    }
  }, [])

  return (
    <BrowserRouter>
      <ErrorBoundary>
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
          <SessionSupervisor />
          <WebsiteModeGate />
          {settings.splashEnabled && <WebSplashScreen />}
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
              <Route path="/delivery-app-coming-soon" element={<DeliveryAppComingSoon />} />
              <Route path="/messenger/signup" element={<DeliveryAppComingSoon />} />
              <Route path="/rider/signup" element={<DeliveryAppComingSoon />} />
              <Route path="/messenger/dashboard" element={<DeliveryAppComingSoon />} />
              <Route path="/rider/dashboard" element={<DeliveryAppComingSoon />} />
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
              <Route path="/admin/rider-verification" element={<AdminRiderVerificationQueue />} />
              <Route path="/admin/orders/:orderId/invoice" element={<InvoicePage />} />
              <Route path="/admin/stock" element={<AdminStock />} />
              <Route path="/admin/payments" element={<AdminPayments />} />
              <Route path="/admin/broadcasts" element={<AdminBroadcasts />} />
              <Route path="/admin/announcements" element={<AdminAnnouncements />} />
              <Route path="/admin/customers" element={<AdminCustomers />} />
              <Route path="/admin/audit-logs" element={<AdminAuditLogs />} />
              <Route path="/admin/users" element={<AdminUsers />} />
              <Route path="/admin/reports" element={<AdminReports />} />
              <Route path="/admin/exports" element={<AdminExports />} />
              <Route path="/admin/settings" element={<AdminSettings />} />
              <Route path="/coming-soon" element={<ComingSoonPage />} />
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
