import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Bell, Home, LogIn, LogOut, Menu, Package, RefreshCw, ShoppingCart, User, X } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { useCartStore } from '../store/cartStore'
import { notificationsAPI, ordersAPI, profileAPI } from '../services/api'
import './Navbar.css'

const getLocalReadKeys = () => {
  try {
    return JSON.parse(localStorage.getItem('foodnova_read_notification_keys') || '[]')
  } catch {
    return []
  }
}

const setLocalReadKeys = (keys) => {
  localStorage.setItem('foodnova_read_notification_keys', JSON.stringify([...new Set(keys)]))
}

const normalizeOrders = (body) => {
  if (Array.isArray(body)) return body
  if (Array.isArray(body?.data)) return body.data
  if (Array.isArray(body?.orders)) return body.orders
  return []
}

const getOutForDeliveryMessage = (orderCode) =>
  `Your order ${orderCode} is out for delivery. The dispatch rider will provide the delivery confirmation code when they arrive. Enter it in the app only after you have received your order.`

const sanitizeBackendNotifications = (items = []) =>
  items
    .filter((item) => String(item.title || '').toLowerCase() !== 'delivery code generated')
    .map((item) => {
      const title = String(item.title || '').toLowerCase()
      if (title === 'out for delivery') {
        return {
          ...item,
          message: getOutForDeliveryMessage(item.order_code || 'your order'),
        }
      }
      return item
    })

const createDerivedNotificationsFromOrders = (orders = []) => {
  const readKeys = new Set(getLocalReadKeys())
  const derived = []

  orders.forEach((order) => {
    const orderCode = order.order_code || `FN-${String(order.id || '').padStart(5, '0')}`
    const paymentStatus = String(order.payment_status || '').toLowerCase()
    const orderStatus = String(order.order_status || order.fulfillment_status || '').toLowerCase()
    const serviceNote = order.service_note || order.admin_note

    const push = (keySuffix, title, message, category = 'order') => {
      const key = `order-${order.id}-${keySuffix}`
      derived.push({
        id: key,
        local_key: key,
        order_id: order.id,
        order_code: orderCode,
        title,
        message,
        category,
        type: 'derived_order_update',
        is_read: readKeys.has(key),
        created_at: order.updated_at || order.created_at || new Date().toISOString(),
      })
    }

    if (paymentStatus === 'receipt_submitted') {
      push('receipt-submitted', 'Receipt Submitted', `Your receipt for order ${orderCode} has been submitted and is awaiting review.`, 'payment')
    }
    if (paymentStatus === 'payment_confirmed') {
      push('payment-confirmed', 'Payment Confirmed', `Your payment for order ${orderCode} has been confirmed.`, 'payment')
    }
    if (paymentStatus === 'payment_rejected') {
      push('payment-rejected', 'Payment Rejected', `Your payment for order ${orderCode} was rejected. Please upload a clearer receipt or contact support.`, 'payment')
    }
    if (orderStatus === 'processing') {
      push('processing', 'Order Processing', `Your order ${orderCode} is now being processed.`, 'order')
    }
    if (orderStatus === 'ready_for_pickup') {
      push('ready-for-pickup', 'Ready for Pickup', `Your order ${orderCode} is ready for pickup.`, 'delivery')
    }
    if (orderStatus === 'out_for_delivery') {
      push('out-for-delivery', 'Out for Delivery', getOutForDeliveryMessage(orderCode), 'delivery')
    }
    if (orderStatus === 'delivered') {
      push('delivered', 'Order Delivered', `Your order ${orderCode} has been marked as delivered.`, 'delivery')
    }
    if (serviceNote) {
      push(`service-${String(serviceNote).slice(0, 30)}`, 'FoodNova Service Update', `Your order ${orderCode} update: ${serviceNote}`, 'service')
    }
  })

  return derived
}

const mergeNotifications = (backendItems = [], derivedItems = []) => {
  const seen = new Set()
  const combined = []

  ;[...sanitizeBackendNotifications(backendItems), ...derivedItems].forEach((item) => {
    const key = item.local_key || `${item.order_id || 'general'}-${item.title}-${item.message}`
    if (seen.has(key)) return
    seen.add(key)
    combined.push(item)
  })

  return combined.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
}

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
      const merged = mergeNotifications(backendNotifications, derivedNotifications)
      setNotifications(merged)

      if (countRes.status === 'fulfilled' && backendNotifications.length && !derivedNotifications.length) {
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
    return () => clearInterval(interval)
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
      const localKeys = notifications.map((item) => item.local_key).filter(Boolean)
      setLocalReadKeys([...getLocalReadKeys(), ...localKeys])
      setNotifications((current) => current.map((item) => ({ ...item, is_read: true })))
      setUnreadCount(0)
    } catch (error) {
      console.warn('Failed to mark notifications as read', error)
    }
  }

  const handleNotificationClick = async (notification) => {
    try {
      if (notification.local_key) {
        setLocalReadKeys([...getLocalReadKeys(), notification.local_key])
      } else if (notification.id) {
        await notificationsAPI.markRead(notification.id).catch(() => null)
      }

      setNotifications((current) => current.map((item) => (
        item.id === notification.id ? { ...item, is_read: true } : item
      )))
      setUnreadCount((current) => Math.max(0, current - (notification.is_read ? 0 : 1)))

      if (notification.order_id) {
        setNotificationsOpen(false)
        navigate('/orders')
      }
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
                          key={notification.id || notification.local_key}
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
