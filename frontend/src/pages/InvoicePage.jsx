import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { adminAPI, ordersAPI } from '../services/api'
import OrderInvoice from '../components/OrderInvoice'
import { buildWhatsAppLink } from '../utils/contactUtils'
import { formatPrice } from '../utils/formatters'
import './InvoicePage.css'

const extractOrder = (response) => response?.order || response?.data?.order || response?.data || response

export default function InvoicePage() {
  const { orderId } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const [order, setOrder] = useState(location.state?.order || null)
  const [loading, setLoading] = useState(!location.state?.order)
  const [error, setError] = useState('')
  const isAdminInvoice = location.pathname.startsWith('/admin')

  const openInvoiceWhatsAppSupport = () => {
    const orderCode = order?.order_code || (order?.id ? `FN-${order.id}` : 'N/A')
    const total = Number(order?.total_amount || order?.total || 0)
    const message = [
      'Hello FoodNova, I need help with this invoice/order.',
      '',
      `Order Code: ${orderCode}`,
      `Total: ${formatPrice(total)}`,
      `Payment Status: ${order?.payment_status || order?.status || 'pending_payment'}`,
      `Order Status: ${order?.order_status || order?.fulfillment_status || order?.status || 'order_placed'}`,
      '',
      'Please assist me.',
    ].join('\n')

    window.open(buildWhatsAppLink(message), '_blank', 'noopener,noreferrer')
  }

  useEffect(() => {
    if (order?.id || !orderId) return

    const loadOrder = async () => {
      try {
        setLoading(true)
        setError('')
        const response = isAdminInvoice
          ? await adminAPI.getOrder(orderId)
          : await ordersAPI.getById(orderId)
        const nextOrder = extractOrder(response)
        if (!nextOrder?.id) throw new Error('Order not found')
        setOrder(nextOrder)
      } catch (err) {
        const message = err?.response?.status === 401
          ? 'Session expired. Please log in again.'
          : 'Failed to load invoice.'
        setError(message)
        toast.error(message)
      } finally {
        setLoading(false)
      }
    }

    loadOrder()
  }, [orderId, order?.id, isAdminInvoice])

  return (
    <div className="invoice-page">
      <div className="invoice-actions no-print">
        <button type="button" onClick={() => navigate(isAdminInvoice ? '/admin/orders' : '/orders')}>Back to Orders</button>
        {order && <button type="button" className="invoice-whatsapp-btn" onClick={openInvoiceWhatsAppSupport}>WhatsApp Support</button>}
        {order && <button type="button" className="invoice-primary-action" onClick={() => window.print()}>Print / Save PDF</button>}
      </div>

      {loading ? (
        <div className="invoice-state">Loading invoice...</div>
      ) : error ? (
        <div className="invoice-state">
          <p>{error}</p>
          <Link to={isAdminInvoice ? '/admin/orders' : '/orders'}>Return to orders</Link>
        </div>
      ) : (
        <OrderInvoice order={order} />
      )}
    </div>
  )
}
