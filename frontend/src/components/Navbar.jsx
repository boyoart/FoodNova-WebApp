import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Bell, Home, Inbox, LogIn, LogOut, Menu, Package, RefreshCw, ShoppingCart, User, X } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { useCartStore } from '../store/cartStore'
import { notificationsAPI, ordersAPI, profileAPI } from '../services/api'
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
  const [refreshingNotifications, setRefreshingNotifications] = useState(false)
  const notificationRef = useRef(null)

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

      const orders = ordersRes.status === 'fulfilled' ? normalizeOrders(ordersRes.value) : []
      const derivedNotifications = createDerivedNotificationsFromOrders(orders)
      const broadcastNotifications = createBroadcastNotifications()
      const merged = mergeNotifications(backendNotifications, derivedNotifications, broadcastNotifications)
      setNotifications(merged)

      if (countRes.status === 'fulfilled' && backendNotifications.length && !derivedNotifications.length && !broadcastNotifications.length) {
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
    window.addEventListener('foodnova-notifications-updated', handleNotificationUpdate)
    return () => {
      clearInterval(interval)
      window.removeEventListener('foodnova-notifications-updated', handleNotificationUpdate)
    }
  }, [isAuthenticated, isAdmin])

  useEffect(() => {
    if (!notificationsOpen) return undefined

    const handleClickOutside = (event) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target)) {
        setNotificationsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('touchstart', handleClickOutside)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('touchstart', handleClickOutside)
    }
  }, [notificationsOpen])

  const handleLogout = () => {
    logout()
    navigate('/')
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
    if (!notificationsOpen) loadCustomerHeaderData()
  }

  return (
    <nav className="navbar">
      <div className="navbar-container">
        <Link to="/" className="navbar-logo">
          <img src="/logo.png" alt="FoodNova" className="logo-image" onError={(e) => { e.currentTarget.style.display = 'none' }} />
          <span>FoodNova</span>
        </Link>

        <button type="button" className="menu-toggle" onClick={() => setMobileMenuOpen((value) => !value)} aria-label="Toggle navigation menu">
          {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>

        <ul className={`nav-menu ${mobileMenuOpen ? 'active' : ''}`}>
          <li className="nav-item"><Link to="/" className="nav-link"><Home size={18} /><span>Home</span></Link></li>
          <li className="nav-item"><Link to="/products" className="nav-link"><Package size={18} /><span>Products</span></Link></li>

          {isAuthenticated && !isAdmin && (
            <>
              <li className="nav-item"><Link to="/orders" className="nav-link"><span>Orders</span></Link></li>
              <li className="nav-item"><Link to="/profile" className="nav-link"><User size={18} /><span>Profile</span></Link></li>
              <li className="nav-item"><Link to="/inbox" className="nav-link"><Inbox size={18} /><span>Inbox</span></Link></li>
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
              <li className="nav-item"><Link to="/admin/dashboard" className="nav-link">Dashboard</Link></li>
              <li className="nav-item"><Link to="/admin/orders" className="nav-link">Orders</Link></li>
              <li className="nav-item"><Link to="/admin/stock" className="nav-link">Stock</Link></li>
              <li className="nav-item"><Link to="/admin/payments" className="nav-link">Payments</Link></li>
              <li className="nav-item"><Link to="/admin/broadcasts" className="nav-link">Broadcasts</Link></li>
            </>
          )}

          {!isAdmin && <li className="nav-item"><Link to="/cart" className="nav-link cart-link"><ShoppingCart size={20} />{totalCartItems > 0 && <span className="cart-badge">{totalCartItems}</span>}</Link></li>}

          {(isAuthenticated || isAdmin) ? (
            <>
              <li className="nav-item nav-user-card"><span className="nav-avatar">{profile?.avatar_url ? <img src={profile.avatar_url} alt="Avatar" /> : initials}</span><span className="nav-text">Hi, {displayName}</span></li>
              <li className="nav-item"><button type="button" className="nav-link logout-btn" onClick={handleLogout}><LogOut size={18} /><span>Logout</span></button></li>
            </>
          ) : (
            <>
              <li className="nav-item"><Link to="/login" className="nav-link"><LogIn size={18} /><span>Login</span></Link></li>
              <li className="nav-item"><Link to="/register" className="nav-link register-btn">Register</Link></li>
              <li className="nav-item"><Link to="/admin/login" className="nav-link admin-login-link">Admin</Link></li>
            </>
          )}
        </ul>
      </div>
    </nav>
  )
}
