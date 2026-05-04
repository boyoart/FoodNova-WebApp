import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCartStore } from '../store/cartStore'
import { useAuthStore } from '../store/authStore'
import { ordersAPI } from '../services/api'
import { formatPrice } from '../utils/formatters'
import toast from 'react-hot-toast'
import { MapPin, Phone, Mail } from 'lucide-react'
import './CheckoutPage.css'

export default function CheckoutPage() {
  const navigate = useNavigate()
  const { items, getTotalPrice, clearCart } = useCartStore()
  const { user } = useAuthStore()
  const [loading, setLoading] = useState(false)
  const [deliveryMethod, setDeliveryMethod] = useState('delivery')
  const [formData, setFormData] = useState({
    name: user?.name || user?.full_name || user?.fullName || '',
    email: user?.email || '',
    phone: user?.phone || '',
    state: '',
    city: '',
    lga: '',
    street_address: '',
    landmark: '',
    delivery_notes: '',
  })

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
  const amountToTransfer = subtotal

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const extractOrder = (res) => {
    const body = res?.data ?? res
    return body?.order || body?.data || body
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (deliveryMethod === 'delivery') {
      if (!formData.state || !formData.city || !formData.lga || !formData.street_address || !formData.landmark) {
        toast.error('Please fill in all required delivery address fields')
        return
      }
    }

    try {
      setLoading(true)

      const deliveryAddress = deliveryMethod === 'pickup'
        ? 'Pickup selected'
        : `${formData.street_address}, ${formData.landmark}, ${formData.city}, ${formData.lga}, ${formData.state}`

      const orderData = {
        customer_name: formData.name,
        customer_email: formData.email,
        customer_phone: formData.phone,
        phone: formData.phone,
        delivery_method: deliveryMethod,
        delivery_address: deliveryAddress,
        address: deliveryAddress,
        state: formData.state,
        city: formData.city,
        lga: formData.lga,
        street_address: formData.street_address,
        landmark: formData.landmark,
        delivery_notes: formData.delivery_notes,
        delivery_fee_payment: deliveryMethod === 'delivery' ? 'paid_to_rider_after_delivery' : '',
        items: items.map((item) => {
          const quantity = item.quantity || item.qty || 1
          const price = Number(item.price || item.unit_price || 0)
          const name = item.name || item.product_name || 'FoodNova Item'

          return {
            id: item.id,
            product_id: item.product_id || item.id,
            name,
            product_name: name,
            price,
            unit_price: price,
            quantity,
            qty: quantity,
          }
        }),
        payment_method: 'bank_transfer',
        total_amount: subtotal,
        total: subtotal,
      }

      const createdOrderResponse = await ordersAPI.create(orderData)
      const createdOrder = extractOrder(createdOrderResponse)

      if (!createdOrder?.id) {
        console.error('Unexpected order creation response:', createdOrderResponse)
        throw new Error('Order was created but no order ID was returned')
      }

      clearCart()
      toast.success('Order placed successfully. Use your Order Code as payment narration, then upload your receipt.')
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
              <legend>Delivery Method</legend>
              <div className="delivery-options">
                <div className="radio-group">
                  <label className="radio-label">
                    <input
                      type="radio"
                      name="deliveryMethod"
                      value="delivery"
                      checked={deliveryMethod === 'delivery'}
                      onChange={(e) => setDeliveryMethod(e.target.value)}
                    />
                    <span className="radio-text">
                      <strong>Delivery</strong>
                      <small>Get your order delivered to your door</small>
                    </span>
                  </label>
                </div>

                <div className="radio-group">
                  <label className="radio-label">
                    <input
                      type="radio"
                      name="deliveryMethod"
                      value="pickup"
                      checked={deliveryMethod === 'pickup'}
                      onChange={(e) => setDeliveryMethod(e.target.value)}
                    />
                    <span className="radio-text">
                      <strong>Pickup</strong>
                      <small>Pick up your order when it is ready</small>
                    </span>
                  </label>
                </div>
              </div>
            </fieldset>

            <fieldset>
              <legend>Customer Information</legend>

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
                  Phone Number
                </label>
                <input
                  type="tel"
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                  required
                />
              </div>
            </fieldset>

            {deliveryMethod === 'delivery' && (
              <fieldset>
                <legend>Delivery Address</legend>

                <div className="form-notice">
                  <p>Please provide your complete delivery address in Nigeria.</p>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>State *</label>
                    <input
                      type="text"
                      name="state"
                      placeholder="e.g., Lagos"
                      value={formData.state}
                      onChange={handleChange}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>City / Town *</label>
                    <input
                      type="text"
                      name="city"
                      placeholder="e.g., Ikeja"
                      value={formData.city}
                      onChange={handleChange}
                      required
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>Local Government Area (LGA) *</label>
                  <input
                    type="text"
                    name="lga"
                    placeholder="e.g., Ikeja"
                    value={formData.lga}
                    onChange={handleChange}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>
                    <MapPin size={18} />
                    Street Address / House Number *
                  </label>
                  <input
                    type="text"
                    name="street_address"
                    placeholder="e.g., No. 12 Allen Avenue"
                    value={formData.street_address}
                    onChange={handleChange}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Nearest Bus Stop / Landmark *</label>
                  <input
                    type="text"
                    name="landmark"
                    placeholder="e.g., Near Computer Village"
                    value={formData.landmark}
                    onChange={handleChange}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Delivery Notes (Optional)</label>
                  <textarea
                    name="delivery_notes"
                    placeholder="Any special delivery instructions"
                    value={formData.delivery_notes}
                    onChange={handleChange}
                    rows="3"
                  />
                </div>

                <div className="form-notice warning">
                  <p>Delivery fee is not included in this order total. Delivery fee will be paid directly to the rider after delivery.</p>
                </div>
              </fieldset>
            )}

            {deliveryMethod === 'pickup' && (
              <fieldset>
                <legend>Pickup Notice</legend>
                <div className="form-notice info">
                  <p>You selected pickup. We will contact you when your order is ready for pickup.</p>
                </div>
              </fieldset>
            )}

            <fieldset>
              <legend>Payment Method</legend>
              <div className="payment-info">
                <p><strong>Bank Transfer Details:</strong></p>
                <p>Account: FoodNova Inc.</p>
                <p>Bank: Main Bank</p>
                <p>Account Number: 1234567890</p>
                <p>Reference: Use your Order Code after placing the order.</p>
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
            {items.map((item) => {
              const quantity = item.quantity || item.qty || 1
              const price = Number(item.price || item.unit_price || 0)
              return (
                <div key={item.id} className="summary-item">
                  <span>{item.name || item.product_name || 'FoodNova Item'} x {quantity}</span>
                  <span>{formatPrice(price * quantity)}</span>
                </div>
              )
            })}
          </div>

          <div className="summary-totals">
            <div className="summary-row">
              <span>Product Total:</span>
              <span>{formatPrice(subtotal)}</span>
            </div>

            {deliveryMethod === 'delivery' && (
              <div className="summary-row">
                <span>Delivery Fee:</span>
                <span className="delivery-fee">Paid to rider after delivery</span>
              </div>
            )}

            <div className="summary-row total">
              <span>Amount to Transfer Now:</span>
              <span>{formatPrice(amountToTransfer)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
