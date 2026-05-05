import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, CheckCircle, RefreshCw, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { notificationsAPI, ordersAPI } from '../services/api'
import {
  createBroadcastNotifications,
  createDerivedNotificationsFromOrders,
  deleteLocalNotification,
  getNotificationKey,
  getReadKeys,
  markLocalNotificationRead,
  mergeNotifications,
  normalizeOrders,
  setReadKeys,
} from '../utils/notifications'
import './InboxPage.css'

export default function InboxPage() {
  const navigate = useNavigate()
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')

  const loadInbox = async () => {
    try {
      setLoading(true)
      const [notificationsRes, ordersRes] = await Promise.allSettled([
        notificationsAPI.getAll(),
        ordersAPI.getCustomerOrders(),
      ])

      const backendBody = notificationsRes.status === 'fulfilled' ? notificationsRes.value || {} : {}
      const backendNotifications = backendBody.notifications || backendBody.data || []
      const orders = ordersRes.status === 'fulfilled' ? normalizeOrders(ordersRes.value) : []
      const derived = createDerivedNotificationsFromOrders(orders)
      const broadcasts = createBroadcastNotifications()
      setNotifications(mergeNotifications(backendNotifications, derived, broadcasts))
    } catch (error) {
      console.error('Failed to load inbox', error)
      toast.error('Failed to load inbox')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadInbox()
  }, [])

  const filteredNotifications = notifications.filter((item) => {
    if (filter === 'all') return true
    if (filter === 'unread') return !item.is_read
    return item.category === filter || item.type === filter
  })

  const markOneRead = async (notification) => {
    markLocalNotificationRead(notification)
    if (notification.id && !String(notification.id).startsWith('order-') && !String(notification.id).startsWith('broadcast-') && !String(notification.id).startsWith('local-')) {
      await notificationsAPI.markRead(notification.id).catch(() => null)
    }
    setNotifications((current) => current.map((item) => getNotificationKey(item) === getNotificationKey(notification) ? { ...item, is_read: true } : item))
    window.dispatchEvent(new Event('foodnova-notifications-updated'))
  }

  const markAllRead = async () => {
    await notificationsAPI.markAllRead().catch(() => null)
    setReadKeys([...getReadKeys(), ...notifications.map((item) => getNotificationKey(item))])
    setNotifications((current) => current.map((item) => ({ ...item, is_read: true })))
    window.dispatchEvent(new Event('foodnova-notifications-updated'))
    toast.success('Inbox marked as read')
  }

  const deleteNotification = (notification) => {
    deleteLocalNotification(notification)
    setNotifications((current) => current.filter((item) => getNotificationKey(item) !== getNotificationKey(notification)))
    toast.success('Notification deleted from inbox')
  }

  const handleOpen = async (notification) => {
    await markOneRead(notification)
    if (notification.order_id) navigate('/orders')
  }

  return (
    <div className="inbox-page">
      <div className="inbox-header">
        <div>
          <h1><Bell size={30} /> Inbox</h1>
          <p>View FoodNova order updates, service messages, and broadcasts.</p>
        </div>
        <div className="inbox-actions">
          <button type="button" className="btn-secondary" onClick={loadInbox}><RefreshCw size={16} /> Refresh</button>
          <button type="button" className="btn-primary" onClick={markAllRead}><CheckCircle size={16} /> Mark all read</button>
        </div>
      </div>

      <div className="inbox-filters">
        {['all', 'unread', 'payment', 'order', 'delivery', 'service', 'broadcast'].map((item) => (
          <button key={item} type="button" className={filter === item ? 'active' : ''} onClick={() => setFilter(item)}>
            {item.charAt(0).toUpperCase() + item.slice(1)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="inbox-empty">Loading inbox...</div>
      ) : filteredNotifications.length === 0 ? (
        <div className="inbox-empty">No notifications found.</div>
      ) : (
        <div className="inbox-list">
          {filteredNotifications.map((notification) => (
            <div key={getNotificationKey(notification)} className={`inbox-card ${notification.is_read ? '' : 'unread'}`}>
              <button type="button" className="inbox-main" onClick={() => handleOpen(notification)}>
                <div className="inbox-card-top">
                  <h3>{notification.title}</h3>
                  <span>{notification.category || notification.type || 'update'}</span>
                </div>
                <p>{notification.message}</p>
                <div className="inbox-meta">
                  {notification.order_code && <strong>{notification.order_code}</strong>}
                  <small>{notification.created_at ? new Date(notification.created_at).toLocaleString() : ''}</small>
                </div>
              </button>
              <div className="inbox-card-actions">
                {!notification.is_read && <button type="button" onClick={() => markOneRead(notification)}>Mark read</button>}
                <button type="button" className="delete-btn" onClick={() => deleteNotification(notification)}><Trash2 size={15} /> Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
