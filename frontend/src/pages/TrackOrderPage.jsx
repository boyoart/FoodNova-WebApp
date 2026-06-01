import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle, CheckCircle, Clock, LogIn, MessageCircle, PackageCheck, Search, Truck } from 'lucide-react'
import toast from 'react-hot-toast'
import { trackingAPI } from '../services/api'
import { buildWhatsAppLink, normalizePhoneForWhatsApp } from '../utils/contactUtils'
import { formatPrice } from '../utils/formatters'
import CopyButton from '../components/ui/CopyButton'
import './TrackOrderPage.css'

const paymentLabels = {
  pending_payment: 'Pending Payment',
  receipt_submitted: 'Receipt Uploaded',
  payment_confirmed: 'Payment Confirmed',
  confirmed: 'Payment Confirmed',
  payment_rejected: 'Payment Rejected',
  rejected: 'Payment Rejected',
}

const orderLabels = {
  order_placed: 'Order Placed',
  pending_payment: 'Pending Payment',
  receipt_submitted: 'Receipt Uploaded',
  payment_confirmed: 'Payment Confirmed',
  processing: 'Processing',
  ready_for_pickup: 'Ready for Pickup',
  out_for_delivery: 'Out for Delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
}

const labelize = (value) => {
  const key = String(value || '').toLowerCase()
  return paymentLabels[key] || orderLabels[key] || key.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase()) || 'Not Available'
}

const badgeTone = (value) => {
  const key = String(value || '').toLowerCase()
  if (['payment_confirmed', 'confirmed', 'delivered'].includes(key)) return 'success'
  if (['payment_rejected', 'rejected', 'cancelled'].includes(key)) return 'danger'
  if (['out_for_delivery', 'ready_for_pickup'].includes(key)) return 'info'
  return 'warning'
}

const getLifecycle = (order) => String(order?.order_status || order?.fulfillment_status || '').toLowerCase()
const getPayment = (order) => String(order?.payment_status || '').toLowerCase()

const getTimelineSteps = (order) => {
  const payment = getPayment(order)
  const lifecycle = getLifecycle(order)
  const paymentConfirmed = ['payment_confirmed', 'confirmed'].includes(payment)
  const receiptUploaded = payment === 'receipt_submitted' || paymentConfirmed
  const processing = ['processing', 'ready_for_pickup', 'out_for_delivery', 'delivered'].includes(lifecycle)
  const outForDelivery = ['out_for_delivery', 'delivered'].includes(lifecycle)
  const delivered = lifecycle === 'delivered'

  return [
    { label: 'Order Placed', done: true, icon: PackageCheck },
    { label: paymentConfirmed ? 'Payment Confirmed' : receiptUploaded ? 'Receipt Uploaded' : 'Payment Pending', done: receiptUploaded || paymentConfirmed, icon: Clock },
    { label: 'Processing', done: processing, icon: Clock },
    { label: 'Out for Delivery', done: outForDelivery, icon: Truck },
    { label: 'Delivered', done: delivered, icon: CheckCircle },
  ]
}

export default function TrackOrderPage() {
  const [form, setForm] = useState({ order_code: '', phone_or_email: '' })
  const [order, setOrder] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleChange = (event) => {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    if (!form.order_code.trim()) {
      setError('Order code is required.')
      return
    }
    if (!form.phone_or_email.trim()) {
      setError('Phone or email is required.')
      return
    }

    try {
      setLoading(true)
      const response = await trackingAPI.trackOrder({
        order_code: form.order_code.trim(),
        phone_or_email: form.phone_or_email.trim(),
      })
      setOrder(response.order || response.data)
      toast.success('Order found')
    } catch (err) {
      const message = err?.response?.data?.detail || 'Order not found. Please check your order code and phone/email.'
      setOrder(null)
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  const openSupport = () => {
    const code = order?.order_code || form.order_code || 'N/A'
    const message = `Hello FoodNova, I need help tracking my order.\n\nOrder Code: ${code}\n\nPlease assist me.`
    window.open(buildWhatsAppLink(message), '_blank', 'noopener,noreferrer')
  }

  const contactRider = () => {
    const phone = normalizePhoneForWhatsApp(order?.rider_phone)
    const message = `Hello, this is regarding my FoodNova order ${order?.order_code || 'N/A'}.`
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="track-order-page">
      <section className="tracking-hero">
        <p className="tracking-kicker">Public order lookup</p>
        <h1>Track Your Order</h1>
        <p>Enter your FoodNova order code and phone/email to see your latest order status.</p>
      </section>

      <section className="tracking-layout">
        <form className="tracking-form-card" onSubmit={handleSubmit}>
          <label>
            Order Code
            <input name="order_code" value={form.order_code} onChange={handleChange} placeholder="FN-00001" />
          </label>
          <label>
            Phone or Email
            <input name="phone_or_email" value={form.phone_or_email} onChange={handleChange} placeholder="Enter phone number or email used for the order" />
          </label>
          {error && <p className="tracking-error"><AlertCircle size={16} /> {error}</p>}
          <button type="submit" className="tracking-submit" disabled={loading}>
            <Search size={18} />
            {loading ? 'Tracking...' : 'Track Order'}
          </button>
        </form>

        {order && (
          <div className="tracking-result">
            <div className="tracking-summary">
              <div>
                <span>Order Code</span>
                <strong className="copyable-value">{order.order_code}<CopyButton value={order.order_code} label="Copy" /></strong>
              </div>
              <div>
                <span>Order Date</span>
                <strong>{order.created_at ? new Date(order.created_at).toLocaleDateString() : 'N/A'}</strong>
              </div>
              <div>
                <span>Total Amount</span>
                <strong>{formatPrice(order.total_amount || 0)}</strong>
              </div>
            </div>

            <div className="tracking-status-grid">
              <div className="tracking-status-card">
                <span>Payment Status</span>
                <strong className={`tracking-badge ${badgeTone(order.payment_status)}`}>{labelize(order.payment_status)}</strong>
              </div>
              <div className="tracking-status-card">
                <span>Delivery Status</span>
                <strong className={`tracking-badge ${badgeTone(order.order_status || order.fulfillment_status)}`}>{labelize(order.order_status || order.fulfillment_status)}</strong>
              </div>
            </div>

            <div className="tracking-timeline">
              {getTimelineSteps(order).map((step) => {
                const Icon = step.icon
                return (
                  <div className={`tracking-step ${step.done ? 'done' : ''}`} key={step.label}>
                    <span><Icon size={16} /></span>
                    <p>{step.label}</p>
                  </div>
                )
              })}
            </div>

            {order.rider_name && (
              <div className="tracking-rider-card">
                <h3>Delivery Worker Information</h3>
                <p><strong>Name:</strong> {order.rider_name}</p>
                <p><strong>Type:</strong> {order.delivery_worker_type === 'messenger' ? 'Messenger' : 'Rider'}</p>
                <p><strong>Phone:</strong> {order.rider_phone || 'Not available'}</p>
                <p><strong>Delivery Status:</strong> {order.delivery_status || order.fulfillment_status || 'Assigned'}</p>
                {order.delivery_note && <p><strong>Delivery Note:</strong> {order.delivery_note}</p>}
                {order.rider_phone && <button type="button" onClick={contactRider}><MessageCircle size={16} /> Contact Rider</button>}
              </div>
            )}

            <div className="tracking-items">
              <h3>Items Summary</h3>
              {(order.items || []).map((item, index) => (
                <div className="tracking-item" key={`${item.name}-${index}`}>
                  <span>{item.name} x {item.quantity}</span>
                  <strong>{formatPrice(item.line_total || Number(item.price || 0) * Number(item.quantity || 1))}</strong>
                </div>
              ))}
            </div>

            <div className="tracking-actions">
              <button type="button" className="tracking-whatsapp" onClick={openSupport}><MessageCircle size={17} /> WhatsApp Support</button>
              <Link to="/login" className="tracking-login"><LogIn size={17} /> Login to View Full Details</Link>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
