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
  const [deliveryCode, setDeliveryCode] = useState('')
  const [confirmingDelivery, setConfirmingDelivery] = useState(false)

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
    setDeliveryCode('')
  }

  const handleDeliveryConfirmation = async (e) => {
    e.preventDefault()

    if (!deliveryCode.trim()) {
      toast.error('Please enter the delivery confirmation code')
      return
    }

    try {
      setConfirmingDelivery(true)
      await ordersAPI.confirmDelivery(selectedOrder.id, deliveryCode)
      toast.success('Delivery confirmed successfully!')
      // Refresh orders to update status
      await fetchOrders()
      setSelectedOrder(null)
      setDeliveryCode('')
    } catch (error) {
      console.error('Delivery confirmation error:', error)
      toast.error(error.response?.data?.detail || error.message || 'Failed to confirm delivery')
    } finally {
      setConfirmingDelivery(false)
    }
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

  const getPaymentStatus = (order) => {
    const status = order.status || order.payment_status || 'pending_payment'
    switch (status) {
      case 'pending_payment':
      case 'pending':
        return 'Pending Payment'
      case 'receipt_submitted':
        return 'Receipt Submitted'
      case 'payment_confirmed':
      case 'confirmed':
        return 'Payment Confirmed'
      case 'payment_rejected':
      case 'rejected':
        return 'Payment Rejected'
      default:
        return 'Pending Payment'
    }
  }

  const getOrderStatus = (order) => {
    const status = order.order_status || order.fulfillment_status || order.status || 'pending_payment'
    switch (status) {
      case 'pending_payment':
      case 'receipt_submitted':
        return 'Order Placed'
      case 'processing':
        return 'Processing'
      case 'ready_for_pickup':
        return 'Ready for Pickup'
      case 'picked_up':
        return 'Picked Up'
      case 'out_for_delivery':
        return 'Out for Delivery'
      case 'delivered':
        return 'Delivered'
      case 'cancelled':
        return 'Cancelled'
      default:
        return 'Order Placed'
    }
  }

  const getTimelineSteps = (order) => {
    const isPickup = order.delivery_method === 'pickup'
    const paymentStatus = getPaymentStatus(order)
    const orderStatus = getOrderStatus(order)

    const baseSteps = [
      { label: 'Order Placed', completed: true },
      { label: 'Payment Confirmed', completed: paymentStatus === 'Payment Confirmed' },
      { label: 'Processing', completed: ['Processing', 'Ready for Pickup', 'Picked Up', 'Out for Delivery', 'Delivered'].includes(orderStatus) },
    ]

    if (isPickup) {
      baseSteps.push(
        { label: 'Ready for Pickup', completed: ['Ready for Pickup', 'Picked Up'].includes(orderStatus) },
        { label: 'Picked Up', completed: orderStatus === 'Picked Up' }
      )
    } else {
      baseSteps.push(
        { label: 'Out for Delivery', completed: ['Out for Delivery', 'Delivered'].includes(orderStatus) },
        { label: 'Delivered', completed: orderStatus === 'Delivered' }
      )
    }

    return baseSteps
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
          <div key={order.id || index} className="order-card" onClick={() => handleViewOrder(order)}>
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
              {/* Order Identity */}
              <div className="order-identity-section">
                <div className="order-code-display">
                  <h3>Order Code: {selectedOrder.order_code || selectedOrder.id}</h3>
                </div>
                <div className="order-meta">
                  <p><strong>Date Placed:</strong> {selectedOrder.created_at ? new Date(selectedOrder.created_at).toLocaleDateString() : 'Today'}</p>
                  <p><strong>Customer Name:</strong> {selectedOrder.customer_name || 'N/A'}</p>
                  <p><strong>Customer Phone:</strong> {selectedOrder.customer_phone || selectedOrder.phone || 'N/A'}</p>
                  <p><strong>Delivery Method:</strong> {selectedOrder.delivery_method === 'pickup' ? 'Pickup' : 'Delivery'}</p>
                </div>
              </div>

              {/* Payment Status */}
              <div className="status-section">
                <h4>Payment Status</h4>
                <div className={`status-badge payment-status ${getPaymentStatus(selectedOrder).toLowerCase().replace(' ', '-')}`}>
                  {getPaymentStatus(selectedOrder)}
                </div>
              </div>

              {/* Order Status */}
              <div className="status-section">
                <h4>Order Status</h4>
                <div className={`status-badge order-status ${getOrderStatus(selectedOrder).toLowerCase().replace(' ', '-')}`}>
                  {getOrderStatus(selectedOrder)}
                </div>
              </div>

              {/* Visual Timeline */}
              <div className="timeline-section">
                <h4>Order Tracking</h4>
                <div className="timeline">
                  {getTimelineSteps(selectedOrder).map((step, index) => (
                    <div key={index} className={`timeline-step ${step.completed ? 'completed' : 'pending'}`}>
                      <div className="timeline-dot"></div>
                      <div className="timeline-content">
                        <span className="timeline-label">{step.label}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Payment Instruction and Receipt Upload */}
              <div className="payment-instruction-section">
                <h4>Payment Instructions</h4>
                {(() => {
                  const paymentStatus = getPaymentStatus(selectedOrder)
                  if (paymentStatus === 'Payment Confirmed') {
                    return <p className="payment-message confirmed">✓ Payment confirmed.</p>
                  } else if (paymentStatus === 'Payment Rejected') {
                    return <p className="payment-message rejected">✗ Payment rejected. Please upload a clearer receipt or contact support.</p>
                  } else if (paymentStatus === 'Receipt Submitted') {
                    return <p className="payment-message submitted">✓ Receipt submitted. Payment awaiting confirmation.</p>
                  } else {
                    return (
                      <div className="payment-pending">
                        <div className="bank-details">
                          <p><strong>Amount to Transfer:</strong> {formatCurrency(getOrderTotal(selectedOrder))}</p>
                          <div className="bank-info">
                            <p><strong>Bank Name:</strong> Main Bank</p>
                            <p><strong>Account Name:</strong> FoodNova Inc.</p>
                            <p><strong>Account Number:</strong> 1234567890</p>
                            <p><strong>Payment Narration/Reference:</strong> Use your Order Code</p>
                          </div>
                        </div>
                        <form onSubmit={handleReceiptUpload}>
                          <div className="form-group">
                            <label>Upload Payment Receipt (Image or PDF)</label>
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
                      </div>
                    )
                  }
                })()}
              </div>

              {/* Delivery/Pickup Information */}
              <div className="delivery-info-section">
                <h4>Delivery Information</h4>
                {selectedOrder.delivery_method === 'delivery' ? (
                  <div className="delivery-details">
                    <p><strong>Delivery Address:</strong> {selectedOrder.delivery_address || selectedOrder.address || 'Not available'}</p>
                    {selectedOrder.delivery_notes && (
                      <p><strong>Delivery Notes:</strong> {selectedOrder.delivery_notes}</p>
                    )}
                    <p className="delivery-fee-notice">Delivery fee is paid directly to the rider after delivery.</p>
                  </div>
                ) : (
                  <p>✓ You selected pickup. We will contact you when your order is ready for pickup.</p>
                )}
              </div>

              {/* Delivery Confirmation */}
              {selectedOrder.delivery_method === 'delivery' && (selectedOrder.order_status === 'out_for_delivery' || selectedOrder.fulfillment_status === 'out_for_delivery') && !selectedOrder.delivery_confirmed_at && (
                <div className="delivery-confirmation-section">
                  <h4>Confirm Delivery</h4>
                  <p className="confirmation-instruction">
                    ✓ Your order is out for delivery! Enter the confirmation code provided by the rider to confirm delivery.
                  </p>
                  <form onSubmit={handleDeliveryConfirmation}>
                    <div className="form-group">
                      <label>Delivery Confirmation Code</label>
                      <input
                        type="text"
                        value={deliveryCode}
                        onChange={(e) => setDeliveryCode(e.target.value.toUpperCase())}
                        placeholder="Enter 6-digit code"
                        maxLength="6"
                        inputMode="numeric"
                        required
                        disabled={confirmingDelivery}
                      />
                      <p className="code-format-hint">6-digit numeric code</p>
                    </div>
                    <button type="submit" className="btn btn-primary" disabled={confirmingDelivery}>
                      {confirmingDelivery ? 'Confirming...' : 'Confirm Delivery'}
                    </button>
                  </form>
                </div>
              )}

              {/* Delivery Confirmed Status */}
              {selectedOrder.delivery_confirmed_at && (
                <div className="delivery-confirmed-banner">
                  <p>✓ Delivery confirmed on {new Date(selectedOrder.delivery_confirmed_at).toLocaleString()}</p>
                </div>
              )}

              {/* Items and Total */}
              <div className="items-total-section">
                <h4>Order Items</h4>
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
                  <strong>Total: {formatCurrency(getOrderTotal(selectedOrder))}</strong>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
