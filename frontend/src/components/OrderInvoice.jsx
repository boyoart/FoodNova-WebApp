import { resolveMediaUrl } from '../services/api'
import { FOODNOVA_CONTACT, FOODNOVA_WEBSITE } from '../utils/contactUtils'
import { formatPrice, getImageFallbackAttrs, getImageUrl, handleImageError } from '../utils/formatters'
import CopyButton from './ui/CopyButton'
import './OrderInvoice.css'

const LOGO_SRC = '/foodnova-logo.png'

const titleCase = (value, fallback = '') => {
  const text = String(value || fallback || '').replace(/_/g, ' ').trim()
  return text.replace(/\b\w/g, (letter) => letter.toUpperCase())
}

const getOrderCode = (order) => order?.order_code || (order?.id ? `FN-${order.id}` : 'N/A')
const getOrderDate = (order) => order?.created_at || order?.date || order?.order_date
const getItemName = (item) => item?.name || item?.product_name || (item?.variant_weight ? `${item?.base_product_name || item?.title || 'FoodNova Item'} - ${item.variant_weight}` : item?.title) || 'FoodNova Item'
const getItemQty = (item) => Number(item?.quantity || item?.qty || 1)
const getItemPrice = (item) => Number(item?.price || item?.unit_price || 0)
const getItemLineTotal = (item) => Number(item?.line_total || getItemPrice(item) * getItemQty(item))
const getItems = (order) => Array.isArray(order?.items) ? order.items : []

const formatDate = (value) => {
  if (!value) return { date: 'N/A', time: 'N/A' }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return { date: value, time: 'N/A' }
  return {
    date: date.toLocaleDateString('en-NG', { year: 'numeric', month: 'short', day: 'numeric' }),
    time: date.toLocaleTimeString('en-NG', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }),
  }
}

const getSubtotal = (order) => {
  const itemsTotal = getItems(order).reduce((sum, item) => sum + getItemLineTotal(item), 0)
  return itemsTotal || Number(order?.subtotal || order?.total_amount || order?.total || 0)
}

const getGrandTotal = (order) => Number(order?.total_amount || order?.total || getSubtotal(order))

const getAddressParts = (order) => {
  const snapshot = typeof order?.delivery_address_snapshot === 'object' && order.delivery_address_snapshot
    ? order.delivery_address_snapshot
    : {}

  return {
    address: order?.delivery_address || order?.address || snapshot.address || 'Delivery address unavailable',
    city: snapshot.city || snapshot.locality || order?.delivery_city || 'N/A',
    state: snapshot.state || snapshot.region || order?.delivery_state || 'N/A',
    country: snapshot.country || order?.delivery_country || 'Nigeria',
  }
}

const getRiderPhoto = (order) => {
  const photo = order?.rider_photo_url || order?.rider_photo || order?.rider?.photo_url || order?.rider?.profile_photo_url
  return photo ? resolveMediaUrl(photo) : ''
}

const getTrackingUrl = (order) => `${FOODNOVA_WEBSITE}/track-order${order?.id ? `?order=${order.id}` : ''}`

export default function OrderInvoice({ order }) {
  const items = getItems(order)
  const subtotal = getSubtotal(order)
  const deliveryFee = Number(order?.delivery_fee || order?.delivery_charge || 0)
  const discount = Number(order?.discount || 0)
  const grandTotal = getGrandTotal(order)
  const orderCode = getOrderCode(order)
  const { date, time } = formatDate(getOrderDate(order))
  const address = getAddressParts(order)
  const paymentStatus = titleCase(order?.payment_status || order?.status, 'Pending')
  const orderStatus = titleCase(order?.order_status || order?.fulfillment_status || order?.status, 'Processing')
  const paymentMethod = titleCase(order?.payment_method, 'Online Payment')
  const transactionReference = order?.transaction_reference || order?.payment_reference || order?.receipt?.reference || orderCode
  const riderPhoto = getRiderPhoto(order)
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=130x130&data=${encodeURIComponent(getTrackingUrl(order))}`

  return (
    <article className="invoice-card">
      <header className="invoice-header">
        <div className="invoice-brand">
          <img src={LOGO_SRC} className="invoice-logo" alt="FoodNova" />
          <p>{FOODNOVA_CONTACT.tagline || 'Quality Food, Delivered Fresh'}</p>
        </div>
        <div className="invoice-divider" aria-hidden="true" />
        <div className="invoice-title-block">
          <h2>Invoice / Receipt</h2>
          <p className="invoice-order-pill">Order ID: {orderCode}</p>
          <p><span>Date:</span> {date}</p>
          <p><span>Order Time:</span> {time}</p>
        </div>
      </header>

      <section className="invoice-party-grid">
        <div className="invoice-party-card">
          <h3>Bill To</h3>
          <div className="invoice-party-body">
            <span className="invoice-round-icon">P</span>
            <div>
              <strong>{order?.customer_name || 'FoodNova Customer'}</strong>
              <p>Email: {order?.customer_email || 'Not provided'}</p>
              <p>Phone: {order?.customer_phone || order?.phone || 'Not provided'}</p>
            </div>
          </div>
        </div>
        <div className="invoice-party-card">
          <h3>Delivery To</h3>
          <div className="invoice-party-body">
            <span className="invoice-round-icon">L</span>
            <div>
              <strong>{address.address}</strong>
              <p>{address.city}, {address.state}, {address.country}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="invoice-items-section">
        <table className="invoice-items-table">
          <thead>
            <tr>
              <th>Product</th>
              <th>Quantity</th>
              <th>Unit Price</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {items.length ? items.map((item, index) => (
              <tr key={`${getItemName(item)}-${index}`}>
                <td>
                  <div className="invoice-product-cell">
                    <img
                      src={getImageUrl(item)}
                      alt=""
                      onError={handleImageError}
                      {...getImageFallbackAttrs(item)}
                    />
                    <strong>{getItemName(item)}</strong>
                  </div>
                </td>
                <td>{getItemQty(item)}</td>
                <td>{formatPrice(getItemPrice(item))}</td>
                <td><strong>{formatPrice(getItemLineTotal(item))}</strong></td>
              </tr>
            )) : (
              <tr>
                <td colSpan="4">No order items available.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="invoice-summary-grid">
        <div className="invoice-status-card">
          <div><span className="invoice-round-icon">C</span><p>Payment Status<strong>{paymentStatus}</strong></p></div>
          <div><span className="invoice-round-icon">O</span><p>Order Status<strong>{orderStatus}</strong></p></div>
          <div><span className="invoice-round-icon invoice-round-icon-accent">M</span><p>Payment Method<strong>{paymentMethod}</strong></p></div>
          <div><span className="invoice-round-icon invoice-round-icon-muted">R</span><p>Transaction Reference<strong className="copyable-value">{transactionReference} <CopyButton value={transactionReference} label="Copy" /></strong></p></div>
        </div>

        <div className="invoice-totals">
          <div><span>Subtotal</span><strong>{formatPrice(subtotal)}</strong></div>
          <div><span>Delivery Fee</span><strong>{deliveryFee > 0 ? formatPrice(deliveryFee) : 'FREE'}</strong></div>
          {discount > 0 && <div><span>Discount</span><strong>-{formatPrice(discount)}</strong></div>}
          <div className="invoice-grand-total"><span>Total</span><strong>{formatPrice(grandTotal)}</strong></div>
        </div>
      </section>

      {order?.rider_name && (
        <section className="invoice-rider-card">
          {riderPhoto ? (
            <img src={riderPhoto} alt="" onError={(event) => { event.currentTarget.style.display = 'none' }} />
          ) : (
            <span className="invoice-round-icon">R</span>
          )}
          <div>
            <p>Delivery Rider</p>
            <strong>{order.rider_name}</strong>
          </div>
          <span>{order?.rider_phone || 'Phone not provided'}</span>
          <strong>{titleCase(order?.delivery_worker_type || order?.worker_type, 'Delivery Rider')}</strong>
        </section>
      )}

      <section className="invoice-thank-you">
        <span className="invoice-round-icon">H</span>
        <div>
          <h3>Thank you for shopping with FoodNova.</h3>
          <p>We appreciate your trust and look forward to serving you again.</p>
        </div>
      </section>

      <footer className="invoice-footer">
        <div>
          <h3>Need Help?</h3>
          <p>{FOODNOVA_CONTACT.phone}</p>
          <p>{FOODNOVA_CONTACT.email}</p>
        </div>
        <div>
          <h3>Shop with us again</h3>
          <img className="invoice-qr" src={qrUrl} alt="FoodNova website QR code" />
          <p>{FOODNOVA_WEBSITE}</p>
        </div>
        <div>
          <h3>Follow Us</h3>
          <p>Instagram: {FOODNOVA_CONTACT.instagram}</p>
          <p>TikTok: {FOODNOVA_CONTACT.tiktok}</p>
        </div>
      </footer>
      <div className="invoice-security-bar">
        <span>100% Secure Payments</span>
        <span>Fresh Products - Fast Delivery - Great Value</span>
      </div>
    </article>
  )
}
