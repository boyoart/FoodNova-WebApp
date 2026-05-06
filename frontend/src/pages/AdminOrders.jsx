import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { adminAPI, resolveMediaUrl } from '../services/api'
import { formatPrice } from '../utils/formatters'
import toast from 'react-hot-toast'
import './AdminPages.css'

const PAYMENT_STATUS_OPTIONS = [
  { value: 'pending_payment', label: 'Pending Payment' },
  { value: 'receipt_submitted', label: 'Receipt Submitted' },
  { value: 'payment_confirmed', label: 'Payment Confirmed' },
  { value: 'payment_rejected', label: 'Payment Rejected' },
]

const ORDER_STATUS_OPTIONS = [
  { value: 'order_placed', label: 'Order Placed' },
  { value: 'processing', label: 'Processing' },
  { value: 'ready_for_pickup', label: 'Ready for Pickup' },
  { value: 'picked_up', label: 'Picked Up' },
  { value: 'out_for_delivery', label: 'Out for Delivery' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'cancelled', label: 'Cancelled' },
]

export default function AdminOrders() {
  const { isAdmin } = useAuthStore()
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [paymentAuditLogs, setPaymentAuditLogs] = useState([])
  const [serviceNote, setServiceNote] = useState('')
  const [sendingServiceNote, setSendingServiceNote] = useState(false)
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    if (isAdmin) {
      fetchOrders()
    }
  }, [isAdmin, filter])

  const normalizeOrderResponse = (res) => {
    if (Array.isArray(res)) return res
    if (Array.isArray(res?.data)) return res.data
    if (Array.isArray(res?.orders)) return res.orders
    if (Array.isArray(res?.data?.orders)) return res.data.orders
    return []
  }

  const fetchOrders = async () => {
    try {
      setLoading(true)
      setLoadError('')
      const params = filter !== 'all' ? { status: filter } : {}
      const res = await adminAPI.getOrders(params)
      setOrders(normalizeOrderResponse(res))
    } catch (error) {
      const message = [401, 403].includes(error?.response?.status)
        ? 'Session expired. Please log in again.'
        : 'Failed to load data. Please log out and log back in. If this continues, check backend deployment logs.'
      setLoadError(message)
      toast.error(message)
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  const handlePaymentStatusUpdate = async (orderId, newStatus) => {
    let payload = { payment_status: newStatus }
    if (newStatus === 'payment_rejected') {
      const reason = window.prompt('Reason for rejection')
      if (!reason || !reason.trim()) {
        toast.error('Rejection reason is required')
        return
      }
      payload = { ...payload, reason: reason.trim(), rejection_reason: reason.trim() }
    }
    try {
      await adminAPI.updatePaymentStatus(orderId, payload)
      toast.success('Payment status updated')
      if (selectedOrder?.id === orderId) loadPaymentAudit(orderId)
      fetchOrders()
    } catch (error) {
      toast.error('Failed to update payment status')
    }
  }

  const handleOrderStatusUpdate = async (orderId, newStatus) => {
    try {
      await adminAPI.updateFulfillmentStatus(orderId, { order_status: newStatus, fulfillment_status: newStatus })
      toast.success('Order status updated')
      // Refresh the selected order details
      if (selectedOrder?.id === orderId) {
        const updated = orders.find(o => o.id === orderId)
        if (updated) setSelectedOrder(updated)
      }
      fetchOrders()
    } catch (error) {
      toast.error('Failed to update order status')
    }
  }

  const handleSendServiceNote = async () => {
    if (!serviceNote.trim()) {
      toast.error('Please enter a service note')
      return
    }

    try {
      setSendingServiceNote(true)
      await adminAPI.updateOrder(selectedOrder.id, {
        service_note: serviceNote,
      })
      toast.success('Service update sent to customer')
      setServiceNote('')
      await fetchOrders()
      // Refresh selected order
      const updated = orders.find(o => o.id === selectedOrder.id)
      if (updated) setSelectedOrder(updated)
    } catch (error) {
      toast.error('Failed to send service note')
      console.error(error)
    } finally {
      setSendingServiceNote(false)
    }
  }

  const handleViewOrder = (order) => {
    setSelectedOrder(order)
    setServiceNote(order.service_note || '')
    loadPaymentAudit(order.id)
  }

  const handleCloseOrder = () => {
    setSelectedOrder(null)
    setServiceNote('')
    setPaymentAuditLogs([])
  }

  const loadPaymentAudit = async (orderId) => {
    try {
      const response = await adminAPI.getOrderPaymentAudit(orderId)
      setPaymentAuditLogs(response.data || [])
    } catch (error) {
      if (![401, 403].includes(error?.response?.status)) console.error(error)
      setPaymentAuditLogs([])
    }
  }

  const getReceiptUrl = (receipt = {}) => resolveMediaUrl(
    receipt.url || receipt.receipt_url || receipt.data_url || ''
  )

  const isPdfReceipt = (receipt = {}) => {
    const mimeType = String(receipt.mime_type || '').toLowerCase()
    const fileType = String(receipt.file_type || '').toLowerCase()
    const source = getReceiptUrl(receipt).toLowerCase()
    return mimeType === 'application/pdf' || fileType === 'pdf' || source.includes('.pdf')
  }

  const openReceiptUrl = (receipt = {}) => {
    const receiptUrl = getReceiptUrl(receipt)
    if (receiptUrl) window.open(receiptUrl, '_blank', 'noopener,noreferrer')
  }

  if (!isAdmin) {
    return <div className="admin-page"><p>Access denied.</p></div>
  }

  return (
    <div className="admin-page">
      <h1>Order Management</h1>

      <div className="filter-tabs">
        {[
          'all',
          'pending_payment',
          'receipt_submitted',
          'payment_confirmed',
          'order_placed',
          'processing',
          'ready_for_pickup',
          'out_for_delivery',
          'delivered',
        ].map(status => (
          <button
            key={status}
            className={`tab ${filter === status ? 'active' : ''}`}
            onClick={() => setFilter(status)}
          >
            {status.replace(/_/g, ' ').toUpperCase()}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="loading">Loading orders...</div>
      ) : loadError ? (
        <div className="empty-state">{loadError}</div>
      ) : orders.length === 0 ? (
        <div className="empty-state">No orders found</div>
      ) : (
        <div className="orders-table">
          <table>
            <thead>
              <tr>
                <th>Order Code</th>
                <th>Customer</th>
                <th>Phone</th>
                <th>Method</th>
                <th>Amount</th>
                <th>Payment</th>
                <th>Status</th>
                <th>Code</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {orders.map(order => {
                const paymentStatus = order.payment_status || order.status || 'pending_payment'
                const orderStatus = order.order_status || order.fulfillment_status || order.status || 'order_placed'
                const deliveryCode = order.delivery_code

                return (
                  <tr key={order.id}>
                    <td>{order.order_code || `#${order.id}`}</td>
                    <td>{order.customer_name || 'Unknown'}</td>
                    <td>{order.phone || order.customer_phone || 'N/A'}</td>
                    <td>{order.delivery_method === 'pickup' ? '🏪' : '🚗'}</td>
                    <td>{formatPrice(order.total_amount || 0)}</td>
                    <td>
                      <select
                        value={paymentStatus}
                        onChange={(e) => handlePaymentStatusUpdate(order.id, e.target.value)}
                        className="status-select"
                      >
                        {PAYMENT_STATUS_OPTIONS.map(opt => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <select
                        value={orderStatus}
                        onChange={(e) => handleOrderStatusUpdate(order.id, e.target.value)}
                        className="status-select"
                      >
                        {ORDER_STATUS_OPTIONS.map(opt => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      {deliveryCode ? (
                        <span className="delivery-code-badge">{deliveryCode}</span>
                      ) : order.delivery_method === 'delivery' && orderStatus === 'out_for_delivery' ? (
                        <span className="code-generating">Generating...</span>
                      ) : (
                        <span className="code-none">-</span>
                      )}
                    </td>
                    <td>
                      <button
                        className="btn-view"
                        onClick={() => handleViewOrder(order)}
                      >
                        Details
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {selectedOrder && (
        <div className="order-detail-modal">
          <div className="modal-overlay" onClick={handleCloseOrder}></div>
          <div className="modal-content order-details-modal">
            <div className="modal-header">
              <h2>Order Details</h2>
              <div className="modal-header-actions">
                <Link className="btn-view invoice-link-button" to={`/admin/orders/${selectedOrder.id}/invoice`} state={{ order: selectedOrder }}>View Invoice</Link>
                <button className="close-btn" onClick={handleCloseOrder}>×</button>
              </div>
            </div>

            <div className="order-detail-content">
              {/* Order Information */}
              <div className="admin-order-section">
                <h4>📦 Order Information</h4>
                <div className="info-grid">
                  <div className="info-item">
                    <strong>Order Code:</strong>
                    <span>{selectedOrder.order_code || `#${selectedOrder.id}`}</span>
                  </div>
                  <div className="info-item">
                    <strong>Customer:</strong>
                    <span>{selectedOrder.customer_name || 'Unknown'}</span>
                  </div>
                  <div className="info-item">
                    <strong>Email:</strong>
                    <span>{selectedOrder.customer_email || 'N/A'}</span>
                  </div>
                  <div className="info-item">
                    <strong>Phone:</strong>
                    <span>{selectedOrder.phone || selectedOrder.customer_phone || 'N/A'}</span>
                  </div>
                  <div className="info-item">
                    <strong>Method:</strong>
                    <span>{selectedOrder.delivery_method === 'pickup' ? '🏪 Pickup' : '🚗 Delivery'}</span>
                  </div>
                  <div className="info-item">
                    <strong>Created:</strong>
                    <span>{selectedOrder.created_at ? new Date(selectedOrder.created_at).toLocaleString() : 'N/A'}</span>
                  </div>
                </div>
              </div>

              {/* Delivery Information */}
              {selectedOrder.delivery_method === 'delivery' && (
                <div className="admin-order-section">
                  <h4>📍 Delivery Information</h4>
                  <div className="info-grid">
                    <div className="info-item full-width">
                      <strong>Address:</strong>
                      <span>{selectedOrder.delivery_address || 'N/A'}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Pickup Information */}
              {selectedOrder.delivery_method === 'pickup' && selectedOrder.pickup_note && (
                <div className="admin-order-section">
                  <h4>🏪 Pickup Note</h4>
                  <p>{selectedOrder.pickup_note}</p>
                </div>
              )}

              {/* Items */}
              <div className="admin-order-section">
                <h4>📋 Items Ordered</h4>
                <table className="items-table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Qty</th>
                      <th>Price</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(selectedOrder.items || []).map((item, idx) => (
                      <tr key={idx}>
                        <td>{item.product_name || item.name || 'Unknown'}</td>
                        <td>{item.quantity || item.qty || 1}</td>
                        <td>{formatPrice(item.price || item.unit_price || 0)}</td>
                        <td>{formatPrice((item.price || item.unit_price || 0) * (item.quantity || item.qty || 1))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="order-total">
                  <strong>Total Amount: {formatPrice(selectedOrder.total_amount || 0)}</strong>
                </div>
              </div>

              {/* Receipt Information */}
              {selectedOrder.receipt && (
                <div className="admin-order-section">
                  <h4>🧾 Receipt Information</h4>
                  <div className="info-grid">
                    <div className="info-item">
                      <strong>Filename:</strong>
                      <span>{selectedOrder.receipt.filename || 'N/A'}</span>
                    </div>
                    <div className="info-item">
                      <strong>Status:</strong>
                      <span>{selectedOrder.receipt.status || 'N/A'}</span>
                    </div>
                    <div className="info-item">
                      <strong>Uploaded:</strong>
                      <span>{selectedOrder.receipt.uploaded_at ? new Date(selectedOrder.receipt.uploaded_at).toLocaleString() : 'N/A'}</span>
                    </div>
                    {selectedOrder.receipt.mime_type && (
                      <div className="info-item">
                        <strong>Type:</strong>
                        <span>{selectedOrder.receipt.mime_type}</span>
                      </div>
                    )}
                  </div>
                  {getReceiptUrl(selectedOrder.receipt) && (
                    <div className="admin-receipt-inline">
                      {!isPdfReceipt(selectedOrder.receipt) && (
                        <img
                          src={getReceiptUrl(selectedOrder.receipt)}
                          alt="Payment receipt"
                          className="receipt-preview-image"
                        />
                      )}
                      <button
                        type="button"
                        className="btn-view-receipt"
                        onClick={() => openReceiptUrl(selectedOrder.receipt)}
                      >
                        {isPdfReceipt(selectedOrder.receipt) ? 'View PDF Receipt' : 'View Receipt'}
                      </button>
                    </div>
                  )}
                </div>
              )}

              <div className="admin-order-section">
                <h4>Payment Approval History</h4>
                {paymentAuditLogs.length ? (
                  <div className="payment-audit-list">
                    {paymentAuditLogs.map((log) => (
                      <div key={log.id} className="payment-audit-card">
                        <div><strong>{log.action?.replace(/_/g, ' ')}</strong> by {log.admin_name || log.admin_email || 'Admin'}</div>
                        <p>{log.old_payment_status || 'N/A'} -&gt; {log.new_payment_status || 'N/A'}</p>
                        <p>{log.created_at ? new Date(log.created_at).toLocaleString() : 'N/A'}</p>
                        {(log.note || log.rejection_reason) && <p>{log.note || log.rejection_reason}</p>}
                        {log.receipt_url && <button type="button" className="btn-view-receipt" onClick={() => window.open(resolveMediaUrl(log.receipt_url), '_blank', 'noopener,noreferrer')}>View Receipt</button>}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="muted">No payment audit records yet.</p>
                )}
              </div>

              {/* Payment Status */}
              <div className="admin-order-section">
                <h4>💳 Payment Status Management</h4>
                <div className="status-control-group">
                  <label>Payment Status:</label>
                  <select
                    value={selectedOrder.payment_status || selectedOrder.status || 'pending_payment'}
                    onChange={(e) => handlePaymentStatusUpdate(selectedOrder.id, e.target.value)}
                    className="status-select"
                  >
                    {PAYMENT_STATUS_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Order Status */}
              <div className="admin-order-section">
                <h4>📦 Order Status Management</h4>
                <div className="status-control-group">
                  <label>Order Status:</label>
                  <select
                    value={selectedOrder.order_status || selectedOrder.fulfillment_status || selectedOrder.status || 'order_placed'}
                    onChange={(e) => handleOrderStatusUpdate(selectedOrder.id, e.target.value)}
                    className="status-select"
                  >
                    {ORDER_STATUS_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Delivery Code */}
              {selectedOrder.delivery_method === 'delivery' && (selectedOrder.order_status === 'out_for_delivery' || selectedOrder.fulfillment_status === 'out_for_delivery') && (
                <div className="admin-order-section">
                  <h4>🔐 Delivery Confirmation Code</h4>
                  {selectedOrder.delivery_code ? (
                    <>
                      <div className="delivery-code-display">
                        <div className="delivery-code-box">
                          {selectedOrder.delivery_code}
                        </div>
                      </div>
                      <p className="delivery-code-info">
                        ✓ Code generated on {selectedOrder.delivery_code_created_at ? new Date(selectedOrder.delivery_code_created_at).toLocaleString() : 'N/A'}
                      </p>
                      <p className="delivery-code-instruction">
                        📌 Instructions: Give this code to the dispatcher/rider. The customer will enter it in the app to confirm delivery.
                      </p>
                    </>
                  ) : (
                    <p className="delivery-code-note">Code will be generated when order is marked "Out for Delivery"</p>
                  )}
                  {selectedOrder.delivery_confirmed_at && (
                    <div className="delivery-confirmed-section">
                      <p className="confirmed-message">✓ Delivery confirmed by customer on {new Date(selectedOrder.delivery_confirmed_at).toLocaleString()}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Service Update Note */}
              <div className="admin-order-section">
                <h4>📢 Admin Service Note</h4>
                <textarea
                  value={serviceNote}
                  onChange={(e) => setServiceNote(e.target.value)}
                  placeholder="Enter service update to notify customer (e.g., 'Delay due to traffic' or 'Rider on the way')"
                  className="service-note-textarea"
                  rows="4"
                />
                <button
                  onClick={handleSendServiceNote}
                  disabled={sendingServiceNote}
                  className="btn-send-note"
                  style={{
                    marginTop: '10px',
                    padding: '10px 16px',
                    backgroundColor: '#FF9800',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: sendingServiceNote ? 'not-allowed' : 'pointer',
                    opacity: sendingServiceNote ? 0.6 : 1,
                  }}
                >
                  {sendingServiceNote ? 'Sending...' : 'Send Service Update'}
                </button>
                {selectedOrder.service_note && (
                  <div style={{ marginTop: '12px', padding: '10px', backgroundColor: '#f0f0f0', borderRadius: '6px' }}>
                    <p style={{ margin: '0 0 4px 0', fontSize: '12px', color: '#666' }}>
                      <strong>Last Update:</strong>
                    </p>
                    <p style={{ margin: '0', color: '#333' }}>{selectedOrder.service_note}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
