import { Link } from 'react-router-dom'
import { Trash2, Plus, Minus, ShoppingBag } from 'lucide-react'
import { useCartStore } from '../store/cartStore'
import { formatPrice, getImageFallbackAttrs, getImageUrl, handleImageError } from '../utils/formatters'
import './CartPage.css'

export default function CartPage() {
  const { items, removeItem, updateQuantity, getTotalPrice, clearCart } = useCartStore()

  if (items.length === 0) {
    return (
      <div className="cart-page empty-cart">
        <ShoppingBag size={64} />
        <h2>Your cart is empty</h2>
        <p>Add some delicious items to get started!</p>
        <Link to="/products" className="btn btn-primary">
          Continue Shopping
        </Link>
      </div>
    )
  }

  return (
    <div className="cart-page">
      <div className="cart-container">
        <h1>Shopping Cart</h1>

        <div className="cart-items">
          {items.map((item) => {
            const itemKey = item.cart_key || item.id
            const label = item.display_name || (item.variant_weight ? `${item.name || item.product_name} - ${item.variant_weight}` : item.name)
            return (
            <div key={itemKey} className="cart-item">
              <img
                src={getImageUrl(item)}
                alt={label}
                className="item-image"
                onError={handleImageError}
                {...getImageFallbackAttrs(item)}
              />
              <div className="item-details">
                <h3>{label}</h3>
                {item.sku && <p className="item-sku">{item.sku}</p>}
                <p className="item-price">{formatPrice(item.price)}</p>
              </div>

              <div className="quantity-control">
                <button onClick={() => updateQuantity(itemKey, item.quantity - 1)}>
                  <Minus size={18} />
                </button>
                <span>{item.quantity}</span>
                <button onClick={() => updateQuantity(itemKey, item.quantity + 1)}>
                  <Plus size={18} />
                </button>
              </div>

              <div className="item-subtotal">
                {formatPrice(item.price * item.quantity)}
              </div>

              <button
                className="btn-remove"
                onClick={() => removeItem(itemKey)}
                title="Remove item"
              >
                <Trash2 size={20} />
              </button>
            </div>
          )})}
        </div>

        <div className="cart-summary">
          <div className="summary-row">
            <span>Subtotal:</span>
            <span>{formatPrice(getTotalPrice())}</span>
          </div>
          <div className="summary-row">
            <span>Shipping:</span>
            <span>{formatPrice(0)}</span>
          </div>
          <div className="summary-row">
            <span>Tax:</span>
            <span>{formatPrice(getTotalPrice() * 0.1)}</span>
          </div>
          <div className="summary-row total">
            <span>Total:</span>
            <span>{formatPrice(getTotalPrice() * 1.1)}</span>
          </div>

          <div className="cart-actions">
            <button className="btn btn-secondary" onClick={clearCart}>
              Clear Cart
            </button>
            <Link to="/checkout" className="btn btn-primary btn-large">
              Proceed to Checkout
            </Link>
          </div>

          <Link to="/products" className="continue-shopping">
            Continue Shopping
          </Link>
        </div>
      </div>
    </div>
  )
}
