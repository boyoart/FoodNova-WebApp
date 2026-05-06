import { formatPrice } from '../utils/formatters'
import './OrderInvoice.css'

const BUSINESS = {
  name: 'FoodNova',
  tagline: 'Quality Foodstuff. Reliable Supply.',
  email: 'support@foodnova.ng',
  phone: '+2348025801125',
  address: '33 Ariyo Akinloye Street, Isheri-Bucknor, Lagos, Nigeria',
}

const PAYMENT = {
  accountNumber: '6427173992',
  bank: 'OPay',
  accountName: 'FOODNOVA LIMITED',
}

const titleCase = (value) =>
  String(value || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())

const getOrderCode = (order) => order?.order_code || (order?.id ? `FN-${order.id}` : 'N/A')
const getOrderDate = (order) => order?.created_at || order?.date || order?.order_date
const getItemName = (item) => item?.name || item?.product_name || item?.title || 'FoodNova Item'
const getItemQty = (item) => Number(item?.quantity || item?.qty || 1)
const getItemPrice = (item) => Number(item?.price || item?.unit_price || 0)
const getItemLineTotal = (item) => Number(item?.line_total || getItemPrice(item) * getItemQty(item))

const formatDate = (value) => {
  if (!value) return 'N/A'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

const getItems = (order) => Array.isArray(order?.items) ? order.items : []

const getSubtotal = (order) => {
  const itemsTotal = getItems(order).reduce((sum, item) => sum + getItemLineTotal(item), 0)
  return itemsTotal || Number(order?.subtotal || order?.total_amount || order?.total || 0)
}

const getGrandTotal = (order) => Number(order?.total_amount || order?.total || getSubtotal(order))

export default function OrderInvoice({ order }) {
  const items = getItems(order)
  const subtotal = getSubtotal(order)
  const deliveryFee = Number(order?.delivery_fee || order?.delivery_charge || 0)
  const discount = Number(order?.discount || 0)
  const grandTotal = getGrandTotal(order)
  const deliveryMethod = order?.delivery_method === 'pickup' ? 'Pickup' : 'Delivery'
  const deliveryAddress = order?.delivery_method === 'pickup'
    ? (order?.pickup_note || 'Pickup selected. FoodNova will contact the customer when the order is ready.')
    : (order?.delivery_address || order?.address || 'Delivery address unavailable')

  return (
    <article className="invoice-card">
      <header className="invoice-header">
        <div className="invoice-brand">
          <div className="invoice-logo">FN</div>
          <div>
            <h1>{BUSINESS.name}</h1>
            <p>{BUSINESS.tagline}</p>
          </div>
        </div>
        <div className="invoice-title-block">
          <h2>FoodNova Invoice / Receipt</h2>
          <p>Order {getOrderCode(order)}</p>
          <p>{formatDate(getOrderDate(order))}</p>
        </div>
      </header>

      <section className="invoice-business-details">
        <p>{BUSINESS.email}</p>
        <p>{BUSINESS.phone}</p>
        <p>{BUSINESS.address}</p>
      </section>

      <section className="invoice-info-grid">
        <div>
          <h3>Bill To</h3>
          <p><strong>{order?.customer_name || 'FoodNova Customer'}</strong></p>
          <p>{order?.customer_phone || order?.phone || 'Phone not available'}</p>
          {order?.customer_email && <p>{order.customer_email}</p>}
          <p>{deliveryAddress}</p>
        </div>
        <div>
          <h3>Order Info</h3>
          <p><span>Payment Status</span><strong>{titleCase(order?.payment_status || order?.status || 'pending_payment')}</strong></p>
          <p><span>Order Status</span><strong>{titleCase(order?.order_status || order?.fulfillment_status || order?.status || 'order_placed')}</strong></p>
          <p><span>Delivery Method</span><strong>{deliveryMethod}</strong></p>
          <p><span>Order Code</span><strong>{getOrderCode(order)}</strong></p>
        </div>
      </section>

      <section className="invoice-items-section">
        <table className="invoice-items-table">
          <thead>
            <tr>
              <th>Item/Product Name</th>
              <th>Quantity</th>
              <th>Unit Price</th>
              <th>Line Total</th>
            </tr>
          </thead>
          <tbody>
            {items.length ? items.map((item, index) => (
              <tr key={`${getItemName(item)}-${index}`}>
                <td>{getItemName(item)}</td>
                <td>{getItemQty(item)}</td>
                <td>{formatPrice(getItemPrice(item))}</td>
                <td>{formatPrice(getItemLineTotal(item))}</td>
              </tr>
            )) : (
              <tr>
                <td colSpan="4">No order items available.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="invoice-totals">
        <div><span>Subtotal</span><strong>{formatPrice(subtotal)}</strong></div>
        {deliveryFee > 0 && <div><span>Delivery Fee</span><strong>{formatPrice(deliveryFee)}</strong></div>}
        {discount > 0 && <div><span>Discount</span><strong>-{formatPrice(discount)}</strong></div>}
        <div className="invoice-grand-total"><span>Grand Total</span><strong>{formatPrice(grandTotal)}</strong></div>
      </section>

      <section className="invoice-payment-details">
        <h3>Payment Details</h3>
        <p>Account Number: {PAYMENT.accountNumber}</p>
        <p>Bank: {PAYMENT.bank}</p>
        <p>Account Name: {PAYMENT.accountName}</p>
      </section>

      <footer className="invoice-footer">
        <p>Thank you for shopping with FoodNova.</p>
        <p>For support, contact {BUSINESS.email} or {BUSINESS.phone}. Use your Order Code for all support inquiries.</p>
      </footer>
    </article>
  )
}
