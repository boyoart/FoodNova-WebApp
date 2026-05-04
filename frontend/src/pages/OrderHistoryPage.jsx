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
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [receiptFile, setReceiptFile] = useState(null)
  const [uploadingReceipt, setUploadingReceipt] = useState(false)

  useEffect(() => {
    if (isAuthenticated) {
      fetchOrders()
    } else {
      setLoading(false)
    }
  }, [isAuthenticated])

  const fetchOrders = async () => {
    try {
      setLoading(true)
      const res = await ordersAPI.getCustomerOrders()
      const rawOrders = Array.isArray(res?.data) ? res.data : []

      // Remove accidental duplicate orders from retry/double-click tests.
      // This is display cleanup only; production DB flow should prevent duplicates server-side.
      const seen = new Set()
      const uniqueOrders = rawOrders.filter((order) => {
        const itemKey = JSON.stringify(order.items || [])
        const key = `${order.total_amount || order.total || 0}-${order.delivery_address || ''}-${itemKey}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })

      setOrders(uniqueOrders)
    } catch (error) {
      toast.error('Failed to load orders')
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  const formatCurrency = (amount) => {
    const value = Number(amount || 0)
    return `₦${value.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`
  }

  const getItemName = (item) => {
    return item?.product_name || item?.name || item?.title || 'FoodNova Item'
  }

  const getItemQty = (item) => {
    return Number(item?.quantity || item?.qty || 1)
  }

  const getItemPrice = (item) => {
    return Number(item?.price || item?.unit_price || item?.unitPrice || 0)
  }

  const getOrderTotal = (order) => {
    const backendTotal = Number(order?.total_amount || order?.total || 0)
    if (backendTotal > 0) return backendTotal

    return (order?.items || []).reduce((sum, item) => {
      return sum + getItemPrice(item) * getItemQty(item)
    }, 0)
  }

  const handleViewOrder = (order) => {
    setSelectedOrder(order)
    setReceiptFile(null)
  }

  const handleCloseOrder = () => {
    setSelectedOrder(null)
    setReceiptFile(null)
  }

  const handleFileChange = (e) => {
    setReceiptFile(e.target.files?.[0] || null)
  }

  const handleReceiptUpload = async (e) => {
    e.preventDefault()

    if (!receiptFile) {
      toast.error('Please select a receipt file')
      return
    }

    try {
      setUploadingReceipt(true)
      await ordersAPI.uploadReceipt(selectedOrder.id, receiptFile)
      toast.success('Receipt uploaded successfully. Payment awaiting confirmation.')
      // Refresh orders to update status
      await fetchOrders()
      setSelectedOrder(null)
      setReceiptFile(null)
    } catch (error) {
      console.error('Receipt upload error:', error)
      toast.error(error.response?.data?.detail || error.message || 'Failed to upload receipt')
    } finally {
      setUploadingReceipt(false)
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

  const getStatusIcon = (status = '') => {
    switch (status) {
      case 'pending_payment':
      case 'pending':
        return <AlertCircle size={20} />
      case 'processing':
      case 'receipt_submitted':
        return <Clock size={20} />
      case 'completed':
      case 'confirmed':
        return <CheckCircle size={20} />
      default:
        return <Package size={20} />
    }
  }

  const getStatusColor = (status = '') => {
    switch (status) {
      case 'pending_payment':
      case 'pending':
        return 'status-warning'
      case 'processing':
      case 'receipt_submitted':
        return 'status-info'
      case 'completed':
      case 'confirmed':
        return 'status-success'
      default:
        return 'status-default'
    }
  }

  const formatStatus = (status = 'pending') => {
    return status.replaceAll('_', ' ').toUpperCase()
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
        {orders.map((order, index) => (
          <div key={order.id || index} className="order-card">
            <div className="order-header">
              <div>
                <h3>Order #{order.order_code || order.id || index + 1}</h3>
                <p className="order-date">
                  {order.created_at ? new Date(order.created_at).toLocaleDateString() : 'Today'}
                </p>
              </div>
              <div className={`order-status ${getStatusColor(order.status)}`}>
                {getStatusIcon(order.status)}
                <span>{formatStatus(order.status)}</span>
              </div>
            </div>

            <div className="order-items">
              {(order.items || []).map((item, idx) => {
                const name = getItemName(item)
                const qty = getItemQty(item)
                const price = getItemPrice(item)

                return (
                  <div key={idx} className="order-item">
                    <span>{name} x {qty}</span>
                    <span>{formatCurrency(price * qty)}</span>
                  </div>
                )
              })}
            </div>

            <div className="order-footer">
              <div className="order-total">
                Total: <strong>{formatCurrency(getOrderTotal(order))}</strong>
              </div>
              
              {/* Display delivery method */}
              <div className="order-delivery-info">
                <p className="delivery-method">
                  <strong>Delivery Method:</strong> {order.delivery_method === 'pickup' ? 'Pickup' : 'Delivery'}
                </p>
                
                {order.delivery_method === 'delivery' && (
                  <>
                    <p className="order-address">
                      📍 {order.delivery_address || order.address || 'Delivery address unavailable'}
                    </p>
                    {order.delivery_fee_payment && (
                      <p className="delivery-fee-note">
                        Delivery Fee: Paid to rider after delivery
                      </p>
                    )}
                  </>
                )}
                
                {order.delivery_method === 'pickup' && (
                  <p className="pickup-note">
                    ✓ Pickup selected - Contact number: {order.customer_phone || 'Not available'}
                  </p>
                )}
              </div>

              <button className="btn btn-secondary" onClick={() => handleViewOrder(order)}>
                View / Upload Receipt
              </button>
            </div>
          </div>
        ))}
      </div>

      {selectedOrder && (
        <div className="order-detail-modal">
          <div className="modal-overlay" onClick={handleCloseOrder}></div>
          <div className="modal-content">
            <div className="modal-header">
              <h2>Order Details</h2>
              <button className="close-btn" onClick={handleCloseOrder}>×</button>
            </div>

            <div className="order-detail-content">
              <div className="order-code-section">
                <h3>Order Code: {selectedOrder.order_code || selectedOrder.id}</h3>
              </div>

              <div className="order-items-section">
                <h4>Items Ordered</h4>
                <div className="order-items-list">
                  {(selectedOrder.items || []).map((item, idx) => {
                    const name = getItemName(item)
                    const qty = getItemQty(item)
                    const price = getItemPrice(item)
                    return (
                      <div key={idx} className="order-item-detail">
                        <span>{name} x {qty}</span>
                        <span>{formatCurrency(price * qty)}</span>
                      </div>
                    )
                  })}
                </div>
                <div className="order-total-detail">
                  <strong>Total Amount: {formatCurrency(getOrderTotal(selectedOrder))}</strong>
                </div>
              </div>

              <div className="payment-section">
                <h4>Payment Information</h4>
                <div className="payment-details">
                  <p><strong>Amount to Transfer:</strong> {formatCurrency(getOrderTotal(selectedOrder))}</p>
                  <div className="bank-info">
                    <p><strong>Bank Name:</strong> Main Bank</p>
                    <p><strong>Account Name:</strong> FoodNova Inc.</p>
                    <p><strong>Account Number:</strong> 1234567890</p>
                    <p><strong>Payment Narration/Reference:</strong> Use your Order Code</p>
                  </div>
                </div>
              </div>

              <div className="delivery-section">
                <h4>Delivery Information</h4>
                <p><strong>Delivery Method:</strong> {selectedOrder.delivery_method === 'pickup' ? 'Pickup' : 'Delivery'}</p>
                {selectedOrder.delivery_method === 'delivery' && (
                  <>
                    <p><strong>Delivery Address:</strong> {selectedOrder.delivery_address || selectedOrder.address || 'Not available'}</p>
                    <p className="delivery-fee-notice">Delivery fee is paid directly to the rider after delivery.</p>
                  </>
                )}
                {selectedOrder.delivery_method === 'pickup' && (
                  <p>✓ You selected pickup. We will contact you when your order is ready for pickup.</p>
                )}
              </div>

              <div className="receipt-upload-section">
                <h4>Upload Payment Receipt</h4>
                {selectedOrder.status === 'receipt_submitted' ? (
                  <p className="receipt-status">✓ Receipt submitted</p>
                ) : (
                  <form onSubmit={handleReceiptUpload}>
                    <div className="form-group">
                      <label>Select Receipt File (Image or PDF)</label>
                      <input
                        type="file"
                        accept="image/*,.pdf"
                        onChange={handleFileChange}
                        required
                      />
                      {receiptFile && <p className="file-selected">✓ {receiptFile.name}</p>}
                    </div>
                    <button type="submit" className="btn btn-primary" disabled={uploadingReceipt}>
                      {uploadingReceipt ? 'Uploading...' : 'Upload Receipt'}
                    </button>
                  </form>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
