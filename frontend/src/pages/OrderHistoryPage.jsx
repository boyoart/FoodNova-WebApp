import { useState, useEffect } from 'react'
import { useAuthStore } from '../store/authStore'
import { ordersAPI, notificationsAPI } from '../services/api'
import toast from 'react-hot-toast'
import { Package, Clock, CheckCircle, AlertCircle, RotateCw } from 'lucide-react'
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
  const [refreshingOrder, setRefreshingOrder] = useState(false)
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    if (isAuthenticated) {
      fetchOrders()
    } else {
      setLoading(false)
    }
  }, [isAuthenticated])

  const normalizePaymentStatusValue = (order) => {
    const paymentStatus = order?.payment_status || ''
    const status = order?.status || ''

    if (['pending_payment', 'receipt_submitted', 'payment_confirmed', 'confirmed', 'payment_rejected', 'rejected'].includes(paymentStatus)) {
      return paymentStatus
    }

    if (['pending_payment', 'receipt_submitted', 'payment_confirmed', 'confirmed', 'payment_rejected', 'rejected'].includes(status)) {
      return status
    }

    if (order?.receipt) return 'receipt_submitted'
    return 'pending_payment'
  }

  const normalizeOrderStatusValue = (order) => {
    const fulfillment = order?.order_status || order?.fulfillment_status || ''
    const status = order?.status || ''

    if (['order_placed', 'processing', 'ready_for_pickup', 'picked_up', 'out_for_delivery', 'delivered', 'cancelled'].includes(fulfillment)) {
      return fulfillment
    }

    if (['processing', 'ready_for_pickup', 'picked_up', 'out_for_delivery', 'delivered', 'cancelled'].includes(status)) {
      return status
    }

    return 'order_placed'
  }

  const mergeSelectedOrder = (freshOrders) => {
    if (!selectedOrder) return
    const fresh = freshOrders.find((order) => String(order.id) === String(selectedOrder.id))
    if (fresh) setSelectedOrder(fresh)
  }

  const fetchOrders = async () => {
    try {
      setLoading(true)
      setLoadError('')
      const res = await ordersAPI.getCustomerOrders()
      const rawOrders = Array.isArray(res?.data) ? res.data : []

      const seen = new Set()
      const uniqueOrders = rawOrders.filter((order) => {
        const itemKey = JSON.stringify(order.items || [])
        const key = `${order.total_amount || order.total || 0}-${order.delivery_address || ''}-${itemKey}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })

      setOrders(uniqueOrders)
      mergeSelectedOrder(uniqueOrders)
    } catch (error) {
      const message = error?.response?.status === 401
        ? 'Session expired. Please log in again.'
        : 'Failed to load data. Please log out and log back in. If this continues, check backend deployment logs.'
      setLoadError(message)
      toast.error(message)
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

  const getItemName = (item) => item?.product_name || item?.name || item?.title || 'FoodNova Item'
  const getItemQty = (item) => Number(item?.quantity || item?.qty || 1)
  const getItemPrice = (item) => Number(item?.price || item?.unit_price || item?.unitPrice || 0)

  const getOrderTotal = (order) => {
    const backendTotal = Number(order?.total_amount || order?.total || 0)
    if (backendTotal > 0) return backendTotal
    return (order?.items || []).reduce((sum, item) => sum + getItemPrice(item) * getItemQty(item), 0)
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


  const handleRefreshOrder = async () => {
    if (!selectedOrder?.id) return
    try {
      setRefreshingOrder(true)
      const res = await ordersAPI.getById(selectedOrder.id)
      const fresh = res?.order || res?.data || res
      if (fresh?.id) {
        setSelectedOrder(fresh)
        setOrders((prev) => prev.map((o) => String(o.id) === String(fresh.id) ? fresh : o))
      }
      // Refresh notifications too
      try {
        await notificationsAPI.getAll().catch(()=>null)
      } catch (e) {
        // Silently fail if notifications can't be refreshed
      }
      toast.success('Order details refreshed')
    } catch (e) {
      toast.error('Failed to refresh order details')
    } finally {
      setRefreshingOrder(false)
    }
  }

  const handleDeliveryConfirmation = async (e) => {
    e.preventDefault()
    if (!deliveryCode.trim()) {
      toast.error('Please enter the delivery confirmation code')
      return
    }

    try {
      setConfirmingDelivery(true)
      const response = await ordersAPI.confirmDelivery(selectedOrder.id, deliveryCode)
      const updatedOrder = response?.order || response?.data || response
      toast.success('Delivery confirmed successfully!')
      await fetchOrders()
      if (updatedOrder?.id) setSelectedOrder(updatedOrder)
      setDeliveryCode('')
    } catch (error) {
      console.error('Delivery confirmation error:', error)
      toast.error(error.response?.data?.detail || error.message || 'Failed to confirm delivery')
    } finally {
      setConfirmingDelivery(false)
    }
  }

  const handleFileChange = (e) => setReceiptFile(e.target.files?.[0] || null)

  const handleReceiptUpload = async (e) => {
    e.preventDefault()
    if (!receiptFile) {
      toast.error('Please select a receipt file')
      return
    }

    try {
      setUploadingReceipt(true)
      const response = await ordersAPI.uploadReceipt(selectedOrder.id, receiptFile)
      const updatedOrder = response?.order || response?.data || response
      toast.success('Receipt uploaded successfully. Payment awaiting confirmation.')
      await fetchOrders()
      if (updatedOrder?.id) setSelectedOrder(updatedOrder)
      setReceiptFile(null)
    } catch (error) {
      console.error('Receipt upload error:', error)
      toast.error(error.response?.data?.detail || error.message || 'Failed to upload receipt')
    } finally {
      setUploadingReceipt(false)
    }
  }

  const getPaymentStatus = (order) => {
    const status = normalizePaymentStatusValue(order)
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
    const status = normalizeOrderStatusValue(order)
    switch (status) {
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
    const paymentStatusValue = normalizePaymentStatusValue(order)
    const orderStatusValue = normalizeOrderStatusValue(order)
    const paymentConfirmed = ['payment_confirmed', 'confirmed'].includes(paymentStatusValue)

    const baseSteps = [
      { label: 'Order Placed', completed: true },
      { label: 'Payment Confirmed', completed: paymentConfirmed },
      { label: 'Processing', completed: ['processing', 'ready_for_pickup', 'picked_up', 'out_for_delivery', 'delivered'].includes(orderStatusValue) },
    ]

    if (isPickup) {
      baseSteps.push(
        { label: 'Ready for Pickup', completed: ['ready_for_pickup', 'picked_up'].includes(orderStatusValue) },
        { label: 'Picked Up', completed: orderStatusValue === 'picked_up' }
      )
    } else {
      baseSteps.push(
        { label: 'Out for Delivery', completed: ['out_for_delivery', 'delivered'].includes(orderStatusValue) },
        { label: 'Delivered', completed: orderStatusValue === 'delivered' }
      )
    }

    return baseSteps
  }

  if (!isAuthenticated) {
    return <div className="order-history-page"><div className="not-logged-in"><p>Please login to view your orders</p></div></div>
  }

  const getStatusIcon = (order) => {
    const paymentStatus = normalizePaymentStatusValue(order)
    const orderStatus = normalizeOrderStatusValue(order)
    if (paymentStatus === 'pending_payment') return <AlertCircle size={20} />
    if (paymentStatus === 'receipt_submitted' || orderStatus === 'processing') return <Clock size={20} />
    if (paymentStatus === 'payment_confirmed' || orderStatus === 'delivered') return <CheckCircle size={20} />
    return <Package size={20} />
  }

  const getStatusColor = (order) => {
    const paymentStatus = normalizePaymentStatusValue(order)
    const orderStatus = normalizeOrderStatusValue(order)
    if (paymentStatus === 'pending_payment') return 'status-warning'
    if (paymentStatus === 'receipt_submitted' || orderStatus === 'processing') return 'status-info'
    if (paymentStatus === 'payment_confirmed' || orderStatus === 'delivered') return 'status-success'
    return 'status-default'
  }

  if (loading) {
    return <div className="order-history-page"><div className="loading">Loading orders...</div></div>
  }

  if (loadError) {
    return <div className="order-history-page"><div className="empty-state"><AlertCircle size={48} /><p>{loadError}</p></div></div>
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
                <p className="order-date">{order.created_at ? new Date(order.created_at).toLocaleDateString() : 'Today'}</p>
              </div>
              <div className={`order-status ${getStatusColor(order)}`}>
                {getStatusIcon(order)}
                <span>{getPaymentStatus(order)}</span>
              </div>
            </div>

            <div className="order-items">
              {(order.items || []).map((item, idx) => (
                <div key={idx} className="order-item">
                  <span>{getItemName(item)} x {getItemQty(item)}</span>
                  <span>{formatCurrency(getItemPrice(item) * getItemQty(item))}</span>
                </div>
              ))}
            </div>

            <div className="order-footer">
              <div className="order-total">Total: <strong>{formatCurrency(getOrderTotal(order))}</strong></div>
              <div className="order-delivery-info">
                <p className="delivery-method"><strong>Delivery Method:</strong> {order.delivery_method === 'pickup' ? 'Pickup' : 'Delivery'}</p>
                <p><strong>Order Status:</strong> {getOrderStatus(order)}</p>
                {order.delivery_method === 'delivery' && (
                  <>
                    <p className="order-address">📍 {order.delivery_address || order.address || 'Delivery address unavailable'}</p>
                    {order.delivery_fee_payment && <p className="delivery-fee-note">Delivery Fee: Paid to rider after delivery</p>}
                  </>
                )}
                {order.delivery_method === 'pickup' && <p className="pickup-note">✓ Pickup selected - Contact number: {order.customer_phone || 'Not available'}</p>}
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
              <div style={{display:"flex",gap:"0.5rem",alignItems:"center"}}><button className="btn-view" onClick={handleRefreshOrder} disabled={refreshingOrder}><RotateCw size={14}/> {refreshingOrder ? "Refreshing..." : "Refresh"}</button><button className="close-btn" onClick={handleCloseOrder}>×</button></div>
            </div>

            <div className="order-detail-content">
              <div className="order-identity-section">
                <div className="order-code-display"><h3>Order Code: {selectedOrder.order_code || selectedOrder.id}</h3></div>
                <div className="order-meta">
                  <p><strong>Date Placed:</strong> {selectedOrder.created_at ? new Date(selectedOrder.created_at).toLocaleDateString() : 'Today'}</p>
                  <p><strong>Customer Name:</strong> {selectedOrder.customer_name || 'N/A'}</p>
                  <p><strong>Customer Phone:</strong> {selectedOrder.customer_phone || selectedOrder.phone || 'N/A'}</p>
                  <p><strong>Delivery Method:</strong> {selectedOrder.delivery_method === 'pickup' ? 'Pickup' : 'Delivery'}</p>
                </div>
              </div>

              <div className="status-section">
                <h4>Payment Status</h4>
                <div className={`status-badge payment-status ${normalizePaymentStatusValue(selectedOrder)}`}>
                  {getPaymentStatus(selectedOrder)}
                </div>
              </div>

              <div className="status-section">
                <h4>Order Status</h4>
                <div className={`status-badge order-status ${normalizeOrderStatusValue(selectedOrder)}`}>
                  {getOrderStatus(selectedOrder)}
                </div>
              </div>

              <div className="timeline-section">
                <h4>Order Tracking</h4>
                <div className="timeline">
                  {getTimelineSteps(selectedOrder).map((step, index) => (
                    <div key={index} className={`timeline-step ${step.completed ? 'completed' : 'pending'}`}>
                      <div className="timeline-dot"></div>
                      <div className="timeline-content"><span className="timeline-label">{step.label}</span></div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="payment-instruction-section">
                <h4>Payment Instructions</h4>
                {(() => {
                  const paymentStatus = normalizePaymentStatusValue(selectedOrder)
                  if (['payment_confirmed', 'confirmed'].includes(paymentStatus)) return <p className="payment-message confirmed">✓ Payment confirmed.</p>
                  if (['payment_rejected', 'rejected'].includes(paymentStatus)) return <p className="payment-message rejected">✗ Payment rejected. Please upload a clearer receipt or contact support.</p>
                  if (paymentStatus === 'receipt_submitted') return <p className="payment-message submitted">✓ Receipt submitted. Payment awaiting confirmation.</p>

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
                          <input type="file" accept="image/*,.pdf" onChange={handleFileChange} required />
                          {receiptFile && <p className="file-selected">✓ {receiptFile.name}</p>}
                        </div>
                        <button type="submit" className="btn btn-primary" disabled={uploadingReceipt}>{uploadingReceipt ? 'Uploading...' : 'Upload Receipt'}</button>
                      </form>
                    </div>
                  )
                })()}
              </div>

              <div className="delivery-info-section">
                <h4>Delivery Information</h4>
                {selectedOrder.delivery_method === 'delivery' ? (
                  <div className="delivery-details">
                    <p><strong>Delivery Address:</strong> {selectedOrder.delivery_address || selectedOrder.address || 'Not available'}</p>
                    {selectedOrder.delivery_notes && <p><strong>Delivery Notes:</strong> {selectedOrder.delivery_notes}</p>}
                    <p className="delivery-fee-notice">Delivery fee is paid directly to the rider after delivery.</p>
                  </div>
                ) : (
                  <p>✓ You selected pickup. We will contact you when your order is ready for pickup.</p>
                )}
              </div>

              {(selectedOrder.service_note || selectedOrder.admin_note) && (
                <div className="service-update-section" style={{ backgroundColor: '#E3F2FD', padding: '12px', borderRadius: '8px', marginBottom: '16px', borderLeft: '4px solid #2196F3' }}>
                  <h4 style={{ marginTop: '0' }}>📢 FoodNova Service Update</h4>
                  <p style={{ margin: '8px 0', color: '#333' }}>
                    {selectedOrder.service_note || selectedOrder.admin_note}
                  </p>
                </div>
              )}

              {selectedOrder.delivery_method === 'delivery' && normalizeOrderStatusValue(selectedOrder) === 'out_for_delivery' && !selectedOrder.delivery_confirmed_at && (
                <div className="delivery-confirmation-section">
                  <h4>Confirm Delivery</h4>
                  <p className="confirmation-instruction">✓ Your order is out for delivery! Enter the confirmation code provided by the rider to confirm delivery.</p>
                  <form onSubmit={handleDeliveryConfirmation}>
                    <div className="form-group">
                      <label>Delivery Confirmation Code</label>
                      <input type="text" value={deliveryCode} onChange={(e) => setDeliveryCode(e.target.value)} placeholder="Enter 6-digit code" maxLength="6" inputMode="numeric" required disabled={confirmingDelivery} />
                      <p className="code-format-hint">6-digit numeric code</p>
                    </div>
                    <button type="submit" className="btn btn-primary" disabled={confirmingDelivery}>{confirmingDelivery ? 'Confirming...' : 'Confirm Delivery'}</button>
                  </form>
                </div>
              )}

              {selectedOrder.delivery_confirmed_at && (
                <div className="delivery-confirmed-banner"><p>✓ Delivery confirmed on {new Date(selectedOrder.delivery_confirmed_at).toLocaleString()}</p></div>
              )}

              <div className="items-total-section">
                <h4>Order Items</h4>
                <div className="order-items-list">
                  {(selectedOrder.items || []).map((item, idx) => (
                    <div key={idx} className="order-item-detail">
                      <span>{getItemName(item)} x {getItemQty(item)}</span>
                      <span>{formatCurrency(getItemPrice(item) * getItemQty(item))}</span>
                    </div>
                  ))}
                </div>
                <div className="order-total-detail"><strong>Total: {formatCurrency(getOrderTotal(selectedOrder))}</strong></div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
