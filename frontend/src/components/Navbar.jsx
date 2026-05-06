import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Bell, Home, Inbox, LogIn, LogOut, Menu, Moon, Package, RefreshCw, ShoppingCart, Sun, User, Users, X } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { useCartStore } from '../store/cartStore'
import { notificationsAPI, ordersAPI, profileAPI, resolveMediaUrl } from '../services/api'
import {
  createBroadcastNotifications,
  createDerivedNotificationsFromOrders,
  getNotificationKey,
  getReadKeys,
  markLocalNotificationRead,
  mergeNotifications,
  normalizeOrders,
  setReadKeys,
} from '../utils/notifications'
import './Navbar.css'

export default function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [profile, setProfile] = useState(null)
  const [avatarOpen, setAvatarOpen] = useState(false)
  const [refreshingNotifications, setRefreshingNotifications] = useState(false)
  const [theme, setTheme] = useState(() => localStorage.getItem('foodnova_theme') || 'light')
  const [logoSrc, setLogoSrc] = useState('/foodnova-logo.png')
  const [logoFailed, setLogoFailed] = useState(false)
  const notificationRef = useRef(null)
  const avatarRef = useRef(null)

  const { user, admin, isAuthenticated, isAdmin, logout } = useAuthStore()
  const { getTotalItems } = useCartStore()
  const navigate = useNavigate()
  const location = useLocation()

  const totalCartItems = getTotalItems()
  const activeUser = isAdmin ? admin : user
  const adminDisplayName = admin?.full_name || admin?.fullName || admin?.name || admin?.email || 'Admin'
  const customerDisplayName = profile?.full_name || user?.full_name || user?.fullName || user?.name || user?.email || 'User'
  const displayName = isAdmin ? adminDisplayName : customerDisplayName
  const avatarUrl = resolveMediaUrl(isAdmin ? (admin?.avatar_url || '') : (profile?.avatar_url || user?.avatar_url || ''))
  const initials = displayName
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'U'

  const isDark = theme === 'dark'

  useEffect(() => {
    const nextTheme = theme === 'dark' ? 'dark' : 'light'
    document.documentElement.classList.remove('theme-light', 'theme-dark')
    document.documentElement.classList.add(`theme-${nextTheme}`)
    document.documentElement.dataset.theme = nextTheme
    localStorage.setItem('foodnova_theme', nextTheme)
  }, [theme])

  const toggleTheme = () => {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'))
  }

  const handleLogoError = () => {
    if (logoSrc === '/foodnova-logo.png') {
      setLogoSrc('/logo.png')
      return
    }

    setLogoFailed(true)
  }

  const isActivePath = (path) => {
    if (path === '/') return location.pathname === '/'
    return location.pathname === path || location.pathname.startsWith(`${path}/`)
  }

  const navLinkClass = (path, extra = '') =>
    ['nav-link', isActivePath(path) ? 'active' : '', extra].filter(Boolean).join(' ')

  const loadCustomerHeaderData = async () => {
    if (!isAuthenticated || isAdmin) return

    try {
      setRefreshingNotifications(true)
      const [notificationsRes, countRes, profileRes, ordersRes] = await Promise.allSettled([
        notificationsAPI.getAll(),
        notificationsAPI.getUnreadCount(),
        profileAPI.getProfile(),
        ordersAPI.getCustomerOrders(),
      ])

      let backendNotifications = []
      if (notificationsRes.status === 'fulfilled') {
        const body = notificationsRes.value || {}
        backendNotifications = body.notifications || body.data || []
      }

      const backendAvailable = notificationsRes.status === 'fulfilled'
      const orders = backendAvailable ? [] : (ordersRes.status === 'fulfilled' ? normalizeOrders(ordersRes.value) : [])
      const derivedNotifications = backendAvailable ? [] : createDerivedNotificationsFromOrders(orders)
      const broadcastNotifications = backendAvailable ? [] : createBroadcastNotifications()
      const merged = backendAvailable ? backendNotifications : mergeNotifications([], derivedNotifications, broadcastNotifications)
      setNotifications(merged)

      if (backendAvailable && countRes.status === 'fulfilled') {
        const body = countRes.value || {}
        setUnreadCount(Number(body.count || body.data?.count || 0))
      } else {
        setUnreadCount(merged.filter((item) => !item.is_read).length)
      }

      if (profileRes.status === 'fulfilled') {
        const body = profileRes.value || {}
        setProfile(body.profile || body.data?.profile || body.data || null)
      }
    } catch (error) {
      console.warn('Failed to load navbar customer data', error)
    } finally {
      setRefreshingNotifications(false)
    }
  }

  useEffect(() => {
    setMobileMenuOpen(false)
    setNotificationsOpen(false)
    setAvatarOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!isAuthenticated || isAdmin) {
      setNotifications([])
      setUnreadCount(0)
      setProfile(null)
      return undefined
    }

    loadCustomerHeaderData()
    const interval = setInterval(loadCustomerHeaderData, 30000)
    const handleNotificationUpdate = () => loadCustomerHeaderData()
    const handleProfileUpdate = () => loadCustomerHeaderData()
    window.addEventListener('foodnova-notifications-updated', handleNotificationUpdate)
    window.addEventListener('foodnova-profile-updated', handleProfileUpdate)
    return () => {
      clearInterval(interval)
      window.removeEventListener('foodnova-notifications-updated', handleNotificationUpdate)
      window.removeEventListener('foodnova-profile-updated', handleProfileUpdate)
    }
  }, [isAuthenticated, isAdmin])

  useEffect(() => {
    if (!notificationsOpen && !avatarOpen) return undefined

    const handleClickOutside = (event) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target)) {
        setNotificationsOpen(false)
      }

      if (avatarRef.current && !avatarRef.current.contains(event.target)) {
        setAvatarOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('touchstart', handleClickOutside)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('touchstart', handleClickOutside)
    }
  }, [notificationsOpen, avatarOpen])

  const handleLogout = () => {
    const wasAdmin = isAdmin
    logout()
    navigate(wasAdmin ? '/admin/login' : '/')
  }

  const handleMarkAllRead = async () => {
    try {
      await notificationsAPI.markAllRead().catch(() => null)
      const keys = notifications.map((item) => getNotificationKey(item)).filter(Boolean)
      setReadKeys([...getReadKeys(), ...keys])
      setNotifications((current) => current.map((item) => ({ ...item, is_read: true })))
      setUnreadCount(0)
    } catch (error) {
      console.warn('Failed to mark notifications as read', error)
    }
  }

  const handleNotificationClick = async (notification) => {
    try {
      markLocalNotificationRead(notification)
      if (notification.id && !String(notification.id).startsWith('order-') && !String(notification.id).startsWith('broadcast-') && !String(notification.id).startsWith('local-')) {
        await notificationsAPI.markRead(notification.id).catch(() => null)
      }

      setNotifications((current) => current.map((item) => (
        getNotificationKey(item) === getNotificationKey(notification) ? { ...item, is_read: true } : item
      )))
      setUnreadCount((current) => Math.max(0, current - (notification.is_read ? 0 : 1)))

      setNotificationsOpen(false)
      if (notification.order_id) navigate('/orders')
      else navigate('/inbox')
    } catch (error) {
      console.warn('Failed to open notification', error)
    }
  }

  const toggleNotifications = () => {
    setNotificationsOpen((value) => !value)
    setAvatarOpen(false)
    if (!notificationsOpen) loadCustomerHeaderData()
  }

  const toggleAvatarMenu = () => {
    setAvatarOpen((value) => !value)
    setNotificationsOpen(false)
  }

  const handleDropdownLogout = () => {
    setAvatarOpen(false)
    handleLogout()
  }

  const customerMenuLinks = [
    { to: '/profile', label: 'Profile' },
    { to: '/orders', label: 'Orders' },
    { to: '/inbox', label: 'Inbox' },
    { to: '/cart', label: 'Cart' },
  ]

  const adminMenuLinks = [
    { to: '/admin/dashboard', label: 'Dashboard' },
    { to: '/admin/orders', label: 'Orders' },
    { to: '/admin/stock', label: 'Stock' },
    { to: '/admin/payments', label: 'Payments' },
    { to: '/admin/broadcasts', label: 'Broadcasts' },
    { to: '/admin/customers', label: 'Customers' },
    { to: '/admin/audit-logs', label: 'Activity Logs' },
  ]

  const avatarMenuLinks = isAdmin ? adminMenuLinks : customerMenuLinks

  const themeToggle = (
    <button
      type="button"
      className="nav-link theme-toggle"
      onClick={toggleTheme}
      title={isDark ? 'Light Mode' : 'Dark Mode'}
      aria-label={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
    >
      {isDark ? <Sun size={18} /> : <Moon size={18} />}
      <span>{isDark ? 'Light Mode' : 'Dark Mode'}</span>
    </button>
  )

  return (
    <nav className="navbar">
      <div className="navbar-container">
        <Link to="/" className="navbar-logo">
          {!logoFailed && <img src={logoSrc} alt="FoodNova" className="logo-image" onError={handleLogoError} />}
          <span className={logoFailed ? 'logo-wordmark visible' : 'logo-wordmark'}>FoodNova</span>
        </Link>

        <button type="button" className="menu-toggle" onClick={() => setMobileMenuOpen((value) => !value)} aria-label="Toggle navigation menu">
          {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>

        <ul className={`nav-menu ${mobileMenuOpen ? 'active' : ''}`}>
          <li className="nav-item"><Link to="/" className={navLinkClass('/')}><Home size={18} /><span>Home</span></Link></li>
          <li className="nav-item"><Link to="/products" className={navLinkClass('/products')}><Package size={18} /><span>Products</span></Link></li>

          {isAuthenticated && !isAdmin && (
            <>
              <li className="nav-item"><Link to="/orders" className={navLinkClass('/orders')}><span>Orders</span></Link></li>
              <li className="nav-item"><Link to="/profile" className={navLinkClass('/profile')}><User size={18} /><span>Profile</span></Link></li>
              <li className="nav-item"><Link to="/inbox" className={navLinkClass('/inbox')}><Inbox size={18} /><span>Inbox</span></Link></li>
              <li className="nav-item nav-bell" ref={notificationRef}>
                <button type="button" className="nav-link bell-btn" onClick={toggleNotifications} aria-label="Notifications">
                  <Bell size={18} />
                  {unreadCount > 0 && <span className="notif-badge">{unreadCount}</span>}
                </button>

                {notificationsOpen && (
                  <div className="notif-dropdown">
                    <div className="notif-dropdown-header">
                      <strong>Notifications</strong>
                      <div className="notif-header-actions">
                        <button type="button" onClick={loadCustomerHeaderData} title="Refresh notifications"><RefreshCw size={14} /> Refresh</button>
                        <button type="button" onClick={handleMarkAllRead}>Mark all as read</button>
                      </div>
                    </div>
                    {refreshingNotifications && <p className="notif-empty">Refreshing...</p>}
                    {notifications.length ? (
                      notifications.slice(0, 10).map((notification) => (
                        <button
                          type="button"
                          key={getNotificationKey(notification)}
                          className={`notif-item notif-button ${notification.is_read ? '' : 'unread'}`}
                          onClick={() => handleNotificationClick(notification)}
                        >
                          <span className="notif-item-top">
                            <strong>{notification.title}</strong>
                            {notification.category && <em>{notification.category}</em>}
                          </span>
                          <p>{notification.message}</p>
                          {notification.order_code && <small>{notification.order_code}</small>}
                        </button>
                      ))
                    ) : (
                      <p className="notif-empty">No notifications yet</p>
                    )}
                    <button type="button" className="notif-view-all" onClick={() => { setNotificationsOpen(false); navigate('/inbox') }}>Open Inbox</button>
                  </div>
                )}
              </li>
            </>
          )}

          {isAdmin && (
            <>
              <li className="nav-item"><Link to="/admin/dashboard" className={navLinkClass('/admin/dashboard')}>Dashboard</Link></li>
              <li className="nav-item"><Link to="/admin/orders" className={navLinkClass('/admin/orders')}>Orders</Link></li>
              <li className="nav-item"><Link to="/admin/stock" className={navLinkClass('/admin/stock')}>Stock</Link></li>
              <li className="nav-item"><Link to="/admin/payments" className={navLinkClass('/admin/payments')}>Payments</Link></li>
              <li className="nav-item"><Link to="/admin/broadcasts" className={navLinkClass('/admin/broadcasts')}>Broadcasts</Link></li>
              <li className="nav-item"><Link to="/admin/customers" className={navLinkClass('/admin/customers')}><Users size={18} /> Customers</Link></li>
              <li className="nav-item"><Link to="/admin/audit-logs" className={navLinkClass('/admin/audit-logs')}>Logs</Link></li>
            </>
          )}

          <li className="nav-item nav-theme">{themeToggle}</li>

          {isAuthenticated && !isAdmin && <li className="nav-item"><Link to="/cart" className={navLinkClass('/cart', 'cart-link')}><ShoppingCart size={20} /><span>Cart</span>{totalCartItems > 0 && <span className="cart-badge">{totalCartItems}</span>}</Link></li>}

          {(isAuthenticated || isAdmin) ? (
            <>
              <li className="nav-item nav-user-menu" ref={avatarRef}>
                <button type="button" className="nav-user-card" onClick={toggleAvatarMenu} aria-haspopup="menu" aria-expanded={avatarOpen}>
                  <span className="nav-avatar">{avatarUrl ? <img src={avatarUrl} alt="Avatar" /> : initials}</span>
                  <span className="nav-text">Hi, {displayName}</span>
                </button>

                {avatarOpen && (
                  <div className="avatar-dropdown" role="menu">
                    <div className="avatar-dropdown-header">
                      <span className="nav-avatar dropdown-avatar">{avatarUrl ? <img src={avatarUrl} alt="Avatar" /> : initials}</span>
                      <div>
                        <strong>{displayName}</strong>
                        <small>{activeUser?.email || (isAdmin ? 'FoodNova admin' : 'FoodNova customer')}</small>
                      </div>
                    </div>

                    <div className="avatar-dropdown-links">
                      {avatarMenuLinks.map((link) => (
                        <Link key={link.to} to={link.to} className={isActivePath(link.to) ? 'active' : ''} role="menuitem">
                          {link.label}
                        </Link>
                      ))}
                    </div>

                    <button type="button" className="avatar-dropdown-logout" onClick={handleDropdownLogout}>
                      <LogOut size={16} /> Logout
                    </button>
                  </div>
                )}
              </li>
              <li className="nav-item"><button type="button" className="nav-link logout-btn" onClick={handleLogout}><LogOut size={18} /><span>Logout</span></button></li>
            </>
          ) : (
            <>
              <li className="nav-item"><Link to="/login" className={navLinkClass('/login')}><LogIn size={18} /><span>Login</span></Link></li>
              <li className="nav-item"><Link to="/register" className={navLinkClass('/register', 'register-btn')}>Register</Link></li>
            </>
          )}
        </ul>
      </div>
    </nav>
  )
}
