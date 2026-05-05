import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Bell, Home, LogIn, LogOut, Menu, Package, ShoppingCart, User, X } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { useCartStore } from '../store/cartStore'
import { notificationsAPI, profileAPI } from '../services/api'
import './Navbar.css'

export default function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [profile, setProfile] = useState(null)

  const { user, admin, isAuthenticated, isAdmin, logout } = useAuthStore()
  const { getTotalItems } = useCartStore()
  const navigate = useNavigate()
  const location = useLocation()

  const totalCartItems = getTotalItems()
  const activeUser = isAdmin ? admin : user
  const displayName = profile?.full_name || activeUser?.full_name || activeUser?.fullName || activeUser?.name || activeUser?.email || 'User'
  const initials = displayName
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'U'

  useEffect(() => {
    setMobileMenuOpen(false)
    setNotificationsOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!isAuthenticated || isAdmin) {
      setNotifications([])
      setUnreadCount(0)
      setProfile(null)
      return undefined
    }

    const loadCustomerHeaderData = async () => {
      try {
        const [notificationsRes, countRes, profileRes] = await Promise.allSettled([
          notificationsAPI.getAll(),
          notificationsAPI.getUnreadCount(),
          profileAPI.getProfile(),
        ])

        if (notificationsRes.status === 'fulfilled') {
          const body = notificationsRes.value || {}
          setNotifications(body.notifications || body.data || [])
        }

        if (countRes.status === 'fulfilled') {
          const body = countRes.value || {}
          setUnreadCount(Number(body.count || body.data?.count || 0))
        }

        if (profileRes.status === 'fulfilled') {
          const body = profileRes.value || {}
          setProfile(body.profile || body.data?.profile || body.data || null)
        }
      } catch (error) {
        console.warn('Failed to load navbar customer data', error)
      }
    }

    loadCustomerHeaderData()
    const interval = setInterval(loadCustomerHeaderData, 30000)
    return () => clearInterval(interval)
  }, [isAuthenticated, isAdmin])

  const handleLogout = () => {
    logout()
    navigate('/')
  }

  const handleMarkAllRead = async () => {
    try {
      await notificationsAPI.markAllRead()
      setNotifications((current) => current.map((item) => ({ ...item, is_read: true })))
      setUnreadCount(0)
    } catch (error) {
      console.warn('Failed to mark notifications as read', error)
    }
  }

  return (
    <nav className="navbar">
      <div className="navbar-container">
        <Link to="/" className="navbar-logo">
          <img src="/logo.png" alt="FoodNova" className="logo-image" onError={(e) => { e.currentTarget.style.display = 'none' }} />
          <span>FoodNova</span>
        </Link>

        <button
          type="button"
          className="menu-toggle"
          onClick={() => setMobileMenuOpen((value) => !value)}
          aria-label="Toggle navigation menu"
        >
          {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>

        <ul className={`nav-menu ${mobileMenuOpen ? 'active' : ''}`}>
          <li className="nav-item">
            <Link to="/" className="nav-link">
              <Home size={18} />
              <span>Home</span>
            </Link>
          </li>

          <li className="nav-item">
            <Link to="/products" className="nav-link">
              <Package size={18} />
              <span>Products</span>
            </Link>
          </li>

          {isAuthenticated && !isAdmin && (
            <>
              <li className="nav-item">
                <Link to="/orders" className="nav-link">
                  <span>Orders</span>
                </Link>
              </li>

              <li className="nav-item">
                <Link to="/profile" className="nav-link">
                  <User size={18} />
                  <span>Profile</span>
                </Link>
              </li>

              <li className="nav-item nav-bell">
                <button
                  type="button"
                  className="nav-link bell-btn"
                  onClick={() => setNotificationsOpen((value) => !value)}
                  aria-label="Notifications"
                >
                  <Bell size={18} />
                  {unreadCount > 0 && <span className="notif-badge">{unreadCount}</span>}
                </button>

                {notificationsOpen && (
                  <div className="notif-dropdown">
                    <div className="notif-dropdown-header">
                      <strong>Notifications</strong>
                      <button type="button" onClick={handleMarkAllRead}>Mark all as read</button>
                    </div>
                    {notifications.length ? (
                      notifications.slice(0, 8).map((notification) => (
                        <div key={notification.id} className={`notif-item ${notification.is_read ? '' : 'unread'}`}>
                          <strong>{notification.title}</strong>
                          <p>{notification.message}</p>
                        </div>
                      ))
                    ) : (
                      <p className="notif-empty">No notifications yet</p>
                    )}
                  </div>
                )}
              </li>
            </>
          )}

          {isAdmin && (
            <>
              <li className="nav-item">
                <Link to="/admin/dashboard" className="nav-link">Dashboard</Link>
              </li>
              <li className="nav-item">
                <Link to="/admin/orders" className="nav-link">Orders</Link>
              </li>
              <li className="nav-item">
                <Link to="/admin/stock" className="nav-link">Stock</Link>
              </li>
              <li className="nav-item">
                <Link to="/admin/payments" className="nav-link">Payments</Link>
              </li>
            </>
          )}

          {!isAdmin && (
            <li className="nav-item">
              <Link to="/cart" className="nav-link cart-link">
                <ShoppingCart size={20} />
                {totalCartItems > 0 && <span className="cart-badge">{totalCartItems}</span>}
              </Link>
            </li>
          )}

          {(isAuthenticated || isAdmin) ? (
            <>
              <li className="nav-item nav-user-card">
                <span className="nav-avatar">
                  {profile?.avatar_url ? <img src={profile.avatar_url} alt="Avatar" /> : initials}
                </span>
                <span className="nav-text">Hi, {displayName}</span>
              </li>
              <li className="nav-item">
                <button type="button" className="nav-link logout-btn" onClick={handleLogout}>
                  <LogOut size={18} />
                  <span>Logout</span>
                </button>
              </li>
            </>
          ) : (
            <>
              <li className="nav-item">
                <Link to="/login" className="nav-link">
                  <LogIn size={18} />
                  <span>Login</span>
                </Link>
              </li>
              <li className="nav-item">
                <Link to="/register" className="nav-link register-btn">Register</Link>
              </li>
              <li className="nav-item">
                <Link to="/admin/login" className="nav-link admin-login-link">Admin</Link>
              </li>
            </>
          )}
        </ul>
      </div>
    </nav>
  )
}
