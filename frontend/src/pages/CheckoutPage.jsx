import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCartStore } from '../store/cartStore'
import { useAuthStore } from '../store/authStore'
import { ordersAPI } from '../services/api'
import { formatPrice } from '../utils/formatters'
import toast from 'react-hot-toast'
import { Upload, MapPin, Phone, Mail } from 'lucide-react'
import './CheckoutPage.css'

export default function CheckoutPage() {
  const navigate = useNavigate()
  const { items, getTotalPrice, clearCart } = useCartStore()
  const { user } = useAuthStore()
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    name: user?.name || user?.full_name || user?.fullName || '',
    email: user?.email || '',
    phone: user?.phone || '',
    address: '',
    city: '',
    postcode: '',
  })
  const [receiptFile, setReceiptFile] = useState(null)

  if (items.length === 0) {
    return (
      <div className="checkout-page">
        <div className="empty-cart-message">
          <p>Your cart is empty. Please add items before checking out.</p>
          <button onClick={() => navigate('/products')} className="btn btn-primary">
            Continue Shopping
          </button>
        </div>
      </div>
    )
  }

  const subtotal = Number(getTotalPrice() || 0)
  const total = subtotal * 1.1

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleFileChange = (e) => {
    setReceiptFile(e.target.files?.[0] || null)
  }

  const extractOrder = (res) => {
    // Supports every current backend response shape:
    // { order }, { data }, raw order object, or Axios-like { data: { order } }
    const body = res?.data ?? res
    return body?.order || body?.data || body
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!receiptFile) {
      toast.error('Please upload a bank transfer receipt')
      return
    }

    try {
      setLoading(true)

      const orderData = {
        customer_name: formData.name,
        customer_email: formData.email,
        customer_phone: formData.phone,
        phone: formData.phone,
        delivery_address: `${formData.address}, ${formData.city} ${formData.postcode}`,
        address: `${formData.address}, ${formData.city} ${formData.postcode}`,
        items: items.map(item => ({
          id: item.id,
          product_id: item.id,
          name: item.name,
          price: item.price,
          quantity: item.quantity || item.qty || 1,
          qty: item.quantity || item.qty || 1,
        })),
        payment_method: 'bank_transfer',
        total_amount: total,
        total,
      }

      const createdOrderResponse = await ordersAPI.create(orderData)
      const createdOrder = extractOrder(createdOrderResponse)
      const orderId = createdOrder?.id

      if (!orderId) {
        console.error('Unexpected order creation response:', createdOrderResponse)
        throw new Error('Order was created but no order ID was returned')
      }

      await ordersAPI.uploadReceipt(orderId, receiptFile)

      toast.success('Order placed successfully! Awaiting payment approval.')
      clearCart()
      navigate('/orders')
    } catch (error) {
      console.error('Checkout error:', error)
      toast.error(error.response?.data?.detail || error.message || 'Failed to place order')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="checkout-page">
      <div className="checkout-container">
        <div className="checkout-form">
          <h1>Checkout</h1>
          <form onSubmit={handleSubmit}>
            <fieldset>
              <legend>Delivery Information</legend>

              <div className="form-group">
                <label>
                  <Mail size={18} />
                  Full Name
                </label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className="form-group">
                <label>Email</label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className="form-group">
                <label>
                  <Phone size={18} />
                  Phone
                </label>
                <input
                  type="tel"
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className="form-group">
                <label>
                  <MapPin size={18} />
                  Street Address
                </label>
                <input
                  type="text"
                  name="address"
                  value={formData.address}
                  onChange={handleChange}
                  required
                  placeholder="123 Main St"
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>City</label>
                  <input
                    type="text"
                    name="city"
                    value={formData.city}
                    onChange={handleChange}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Postal Code</label>
                  <input
                    type="text"
                    name="postcode"
                    value={formData.postcode}
                    onChange={handleChange}
                    required
                  />
                </div>
              </div>
            </fieldset>

            <fieldset>
              <legend>Payment Method</legend>
              <div className="payment-info">
                <p>
                  <strong>Bank Transfer Details:</strong>
                </p>
                <p>Account: FoodNova Inc.</p>
                <p>Bank: Main Bank</p>
                <p>Account Number: 1234567890</p>
                <p>Reference: Your Order ID</p>
              </div>

              <div className="form-group">
                <label>
                  <Upload size={18} />
                  Upload Receipt
                </label>
                <input
                  type="file"
                  accept="image/*,.pdf"
                  onChange={handleFileChange}
                  required
                />
                {receiptFile && <p className="file-selected">✓ {receiptFile.name}</p>}
              </div>
            </fieldset>

            <button type="submit" className="btn btn-primary btn-large" disabled={loading}>
              {loading ? 'Processing...' : 'Place Order'}
            </button>
          </form>
        </div>

        <div className="checkout-summary">
          <h2>Order Summary</h2>
          <div className="summary-items">
            {items.map((item) => (
              <div key={item.id} className="summary-item">
                <span>{item.name} x {item.quantity || item.qty || 1}</span>
                <span>{formatPrice(item.price * (item.quantity || item.qty || 1))}</span>
              </div>
            ))}
          </div>

          <div className="summary-totals">
            <div className="summary-row">
              <span>Subtotal:</span>
              <span>{formatPrice(subtotal)}</span>
            </div>
            <div className="summary-row">
              <span>Service/Tax (10%):</span>
              <span>{formatPrice(subtotal * 0.1)}</span>
            </div>
            <div className="summary-row total">
              <span>Total:</span>
              <span>{formatPrice(total)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
