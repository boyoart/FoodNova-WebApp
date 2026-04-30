import { useState, useEffect } from 'react'
import { useAuthStore } from '../store/authStore'
import { adminAPI } from '../services/api'
import toast from 'react-hot-toast'
import './AdminPages.css'

export default function AdminOrders() {
  const { isAdmin } = useAuthStore()
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    if (isAdmin) {
      fetchOrders()
    }
  }, [isAdmin, filter])

  const fetchOrders = async () => {
    try {
      setLoading(true)
      const params = filter !== 'all' ? { status: filter } : {}
      const res = await adminAPI.getOrders(params)
      setOrders(res.data || [])
    } catch (error) {
      toast.error('Failed to load orders')
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  const handleStatusUpdate = async (orderId, newStatus) => {
    try {
      await adminAPI.updateOrderStatus(orderId, { status: newStatus })
      toast.success('Order status updated')
      fetchOrders()
    } catch (error) {
      toast.error('Failed to update order')
    }
  }

  if (!isAdmin) {
    return <div className="admin-page"><p>Access denied.</p></div>
  }

  return (
    <div className="admin-page">
      <h1>Order Management</h1>

      <div className="filter-tabs">
        {['all', 'pending_payment', 'processing', 'completed'].map(status => (
          <button
            key={status}
            className={`tab ${filter === status ? 'active' : ''}`}
            onClick={() => setFilter(status)}
          >
            {status.replace('_', ' ').toUpperCase()}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="loading">Loading orders...</div>
      ) : orders.length === 0 ? (
        <div className="empty-state">No orders found</div>
      ) : (
        <div className="orders-table">
          <table>
            <thead>
              <tr>
                <th>Order ID</th>
                <th>Customer</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {orders.map(order => (
                <tr key={order.id}>
                  <td>#{order.id}</td>
                  <td>{order.customer_name}</td>
                  <td>${order.total_amount.toFixed(2)}</td>
                  <td>
                    <select
                      value={order.status}
                      onChange={(e) => handleStatusUpdate(order.id, e.target.value)}
                      className="status-select"
                    >
                      <option value="pending_payment">Pending Payment</option>
                      <option value="processing">Processing</option>
                      <option value="completed">Completed</option>
                    </select>
                  </td>
                  <td>
                    <button className="btn-view">View Details</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
