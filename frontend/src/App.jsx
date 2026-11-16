import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import ErrorBoundary from './components/ErrorBoundary'
import FloatingCartButton from './components/FloatingCartButton'
import BackToTopButton from './components/BackToTopButton'
import AnalyticsConsent from './components/AnalyticsConsent'
import FloatingOrderTracking, { FullTrackingEntry, OrderTrackingProvider } from './components/OrderTracking'
import HomePage from './pages/HomePage'
import ProductsPage from './pages/ProductsPage'
import CartPage from './pages/CartPage'
import CheckoutPage from './pages/CheckoutPage'
import LoginPage from './pages/LoginPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import RegisterPage from './pages/RegisterPage'
import OrderHistoryPage from './pages/OrderHistoryPage'
import AdminLoginPage from './pages/AdminLoginPage'
import AdminDashboard from './pages/AdminDashboard'
import AdminWebsiteAnalytics from './pages/AdminWebsiteAnalytics'
import AdminLayout from './pages/AdminLayout'
import AdminOrders from './pages/AdminOrders'
import AdminStock from './pages/AdminStock'
import AdminPayments from './pages/AdminPayments'
import AdminBroadcasts from './pages/AdminBroadcasts'
import AdminCustomers from './pages/AdminCustomers'
import AdminAuditLogs from './pages/AdminAuditLogs'
import AdminUsers from './pages/AdminUsers'
import AdminRiders from './pages/AdminRiders'
import AdminRiderKycDetail from './pages/AdminRiderKycDetail'
import { AdminAnnouncements, AdminBanners, AdminCategories, AdminComingSoonSubscribers, AdminDeliveryZones, AdminReports, AdminWebsiteSettings } from './pages/AdminExpansion'
import PrivacyPolicy from './pages/PrivacyPolicy'
import TermsPage from './pages/TermsPage'
import ContactPage from './pages/ContactPage'
import NotFoundPage from './pages/NotFoundPage'
import ProfilePage from './pages/ProfilePage'
import InboxPage from './pages/InboxPage'
import InvoicePage from './pages/InvoicePage'
import AppLandingPage from './pages/AppLandingPage'
import './modal-scroll-fix.css'

function AppLayout() {
  const location = useLocation()
  const isAdminRoute = location.pathname.startsWith('/admin')

  return (
    <div className={isAdminRoute ? 'admin-app-frame' : 'public-app-frame'} style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      {!isAdminRoute && <Navbar />}
      <main style={{ flex: 1 }}>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/products" element={<ProductsPage />} />
              <Route path="/app" element={<AppLandingPage />} />
              <Route path="/cart" element={<CartPage />} />
              <Route path="/checkout" element={<CheckoutPage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/orders" element={<><FullTrackingEntry /><OrderHistoryPage /></>} />
              <Route path="/orders/:orderId/invoice" element={<InvoicePage />} />
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/inbox" element={<InboxPage />} />
              <Route path="/inbox/*" element={<InboxPage />} />
              <Route path="/notifications" element={<InboxPage />} />
              <Route path="/customer/inbox" element={<InboxPage />} />
              <Route path="/admin/login" element={<AdminLoginPage />} />
              <Route path="/admin" element={<AdminLayout />}>
                <Route path="dashboard" element={<AdminDashboard />} />
                <Route path="website-analytics" element={<AdminWebsiteAnalytics />} />
                <Route path="orders" element={<AdminOrders />} />
                <Route path="orders/:orderId/invoice" element={<InvoicePage />} />
                <Route path="riders" element={<AdminRiders />} />
                <Route path="riders/:riderId" element={<AdminRiderKycDetail />} />
                <Route path="stock" element={<AdminStock />} />
                <Route path="payments" element={<AdminPayments />} />
                <Route path="broadcasts" element={<AdminBroadcasts />} />
                <Route path="customers" element={<AdminCustomers />} />
                <Route path="audit-logs" element={<AdminAuditLogs />} />
                <Route path="users" element={<AdminUsers />} />
                <Route path="reports" element={<AdminReports />} />
                <Route path="banners" element={<AdminBanners />} />
                <Route path="announcements" element={<AdminAnnouncements />} />
                <Route path="delivery-zones" element={<AdminDeliveryZones />} />
                <Route path="website-settings" element={<AdminWebsiteSettings />} />
                <Route path="coming-soon-subscribers" element={<AdminComingSoonSubscribers />} />
                <Route path="categories" element={<AdminCategories />} />
              </Route>
              <Route path="/privacy" element={<PrivacyPolicy />} />
              <Route path="/terms" element={<TermsPage />} />
              <Route path="/contact" element={<ContactPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
      </main>
      {!isAdminRoute && <Footer />}
      {!isAdminRoute && <FloatingCartButton />}
      {!isAdminRoute && <BackToTopButton />}
      <AnalyticsConsent />
      <FloatingOrderTracking />
      <Toaster position="bottom-right" />
    </div>
  )
}

function App() {
  return <BrowserRouter><ErrorBoundary><OrderTrackingProvider><AppLayout /></OrderTrackingProvider></ErrorBoundary></BrowserRouter>
}

export default App
