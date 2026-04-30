import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCartStore } from '../store/cartStore'
import { useAuthStore } from '../store/authStore'
import { ordersAPI } from '../services/api'
import toast from 'react-hot-toast'
import { Upload, MapPin, Phone, Mail } from 'lucide-react'
import './CheckoutPage.css'

export default function CheckoutPage() {
  const navigate = useNavigate()
  const { items, getTotalPrice, clearCart } = useCartStore()
  const { user } = useAuthStore()
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    name: user?.name || '',
    email: user?.email || '',
    phone: '',
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

  const total = getTotalPrice() * 1.1

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleFileChange = (e) => {
    setReceiptFile(e.target.files?.[0] || null)
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
        delivery_address: `${formData.address}, ${formData.city} ${formData.postcode}`,
        items: items.map(item => ({ product_id: item.id, quantity: item.quantity })),
        payment_method: 'bank_transfer',
        total_amount: total,
      }

      const res = await ordersAPI.create(orderData)
      await ordersAPI.uploadReceipt(res.data.id, receiptFile)

      toast.success('Order placed successfully! Awaiting payment approval.')
      clearCart()
      navigate('/orders')
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to place order')
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
                <span>{item.name} x {item.quantity}</span>
                <span>${(item.price * item.quantity).toFixed(2)}</span>
              </div>
            ))}
          </div>

          <div className="summary-totals">
            <div className="summary-row">
              <span>Subtotal:</span>
              <span>${getTotalPrice().toFixed(2)}</span>
            </div>
            <div className="summary-row">
              <span>Tax (10%):</span>
              <span>${(getTotalPrice() * 0.1).toFixed(2)}</span>
            </div>
            <div className="summary-row total">
              <span>Total:</span>
              <span>${total.toFixed(2)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
