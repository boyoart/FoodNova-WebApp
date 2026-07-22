import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import ErrorBoundary from './components/ErrorBoundary'
import FloatingCartButton from './components/FloatingCartButton'
import HomePage from './pages/HomePage'
import ProductsPage from './pages/ProductsPage'
import CartPage from './pages/CartPage'
import CheckoutPage from './pages/CheckoutPage'
import LoginPage from './pages/LoginPage'
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
import { AdminAnnouncements, AdminBanners, AdminCategories, AdminComingSoonSubscribers, AdminDeliveryZones, AdminReports, AdminWebsiteSettings } from './pages/AdminExpansion'
import PrivacyPolicy from './pages/PrivacyPolicy'
import TermsPage from './pages/TermsPage'
import ContactPage from './pages/ContactPage'
import NotFoundPage from './pages/NotFoundPage'
import ProfilePage from './pages/ProfilePage'
import InboxPage from './pages/InboxPage'
import InvoicePage from './pages/InvoicePage'
import './modal-scroll-fix.css'

function App() {
  return (
    <BrowserRouter>
      <ErrorBoundary>
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
          <Navbar />
          <main style={{ flex: 1, paddingTop: '60px' }}>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/products" element={<ProductsPage />} />
              <Route path="/cart" element={<CartPage />} />
              <Route path="/checkout" element={<CheckoutPage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/orders" element={<OrderHistoryPage />} />
              <Route path="/orders/:orderId/invoice" element={<InvoicePage />} />
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/inbox" element={<InboxPage />} />
              <Route path="/inbox/*" element={<InboxPage />} />
              <Route path="/notifications" element={<InboxPage />} />
              <Route path="/customer/inbox" element={<InboxPage />} />
              <Route path="/admin/login" element={<AdminLoginPage />} />
              <Route path="/admin/dashboard" element={<AdminDashboard />} />
              <Route path="/admin/orders" element={<AdminOrders />} />
              <Route path="/admin/riders" element={<AdminRiders />} />
              <Route path="/admin/orders/:orderId/invoice" element={<InvoicePage />} />
              <Route path="/admin/stock" element={<AdminStock />} />
              <Route path="/admin/payments" element={<AdminPayments />} />
              <Route path="/admin/broadcasts" element={<AdminBroadcasts />} />
              <Route path="/admin/customers" element={<AdminCustomers />} />
              <Route path="/admin/audit-logs" element={<AdminAuditLogs />} />
              <Route path="/admin/users" element={<AdminUsers />} />
              <Route path="/admin/reports" element={<AdminReports />} />
              <Route path="/admin/banners" element={<AdminBanners />} />
              <Route path="/admin/announcements" element={<AdminAnnouncements />} />
              <Route path="/admin/delivery-zones" element={<AdminDeliveryZones />} />
              <Route path="/admin/website-settings" element={<AdminWebsiteSettings />} />
              <Route path="/admin/coming-soon-subscribers" element={<AdminComingSoonSubscribers />} />
              <Route path="/admin/categories" element={<AdminCategories />} />
              <Route path="/privacy" element={<PrivacyPolicy />} />
              <Route path="/terms" element={<TermsPage />} />
              <Route path="/contact" element={<ContactPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </main>
          <Footer />
          <FloatingCartButton />
          <Toaster position="bottom-right" />
        </div>
      </ErrorBoundary>
    </BrowserRouter>
  )
}

export default App
