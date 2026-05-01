import { useState, useEffect } from 'react'
import { useAuthStore } from '../store/authStore'
import { ordersAPI } from '../services/api'
import { formatPrice } from '../utils/formatters'
import toast from 'react-hot-toast'
import { Package, Clock, CheckCircle, AlertCircle } from 'lucide-react'
import './OrderHistoryPage.css'

export default function OrderHistoryPage() {
  const { isAuthenticated } = useAuthStore()
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (isAuthenticated) {
      fetchOrders()
    }
  }, [isAuthenticated])

  const fetchOrders = async () => {
    try {
      setLoading(true)
      const res = await ordersAPI.getCustomerOrders()
      setOrders(res.data || [])
    } catch (error) {
      toast.error('Failed to load orders')
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  if (!isAuthenticated) {
    return (
      <div className="order-history-page">
        <div className="not-logged-in">
          <p>Please login to view your orders</p>
        </div>
      </div>
    )
  }

  const getStatusIcon = (status) => {
    switch (status) {
      case 'pending_payment':
        return <AlertCircle size={20} />
      case 'processing':
        return <Clock size={20} />
      case 'completed':
        return <CheckCircle size={20} />
      default:
        return <Package size={20} />
    }
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'pending_payment':
        return 'status-warning'
      case 'processing':
        return 'status-info'
      case 'completed':
        return 'status-success'
      default:
        return 'status-default'
    }
  }

  if (loading) {
    return (
      <div className="order-history-page">
        <div className="loading">Loading orders...</div>
      </div>
    )
  }

  if (orders.length === 0) {
    return (
      <div className="order-history-page">
        <div className="empty-state">
          <Package size={48} />
          <p>You haven't placed any orders yet</p>
        </div>
      </div>
    )
  }

  return (
    <div className="order-history-page">
      <h1>Your Orders</h1>

      <div className="orders-list">
        {orders.map((order) => (
          <div key={order.id} className="order-card">
            <div className="order-header">
              <div>
                <h3>Order #{order.id}</h3>
                <p className="order-date">
                  {new Date(order.created_at).toLocaleDateString()}
                </p>
              </div>
              <div className={`order-status ${getStatusColor(order.status)}`}>
                {getStatusIcon(order.status)}
                <span>{order.status.replace('_', ' ').toUpperCase()}</span>
              </div>
            </div>

            <div className="order-items">
              {order.items?.map((item, idx) => (
                <div key={idx} className="order-item">
                  <span>{item.product_name} x {item.quantity}</span>
                  <span>{formatPrice(item.price * item.quantity)}</span>
                </div>
              ))}
            </div>

            <div className="order-footer">
              <div className="order-total">
                Total: <strong>{formatPrice(order.total_amount)}</strong>
              </div>
              <p className="order-address">📍 {order.delivery_address}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
