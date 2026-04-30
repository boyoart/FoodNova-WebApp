import { Link } from 'react-router-dom'
import { Trash2, Plus, Minus, ShoppingBag } from 'lucide-react'
import { useCartStore } from '../store/cartStore'
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
          {items.map((item) => (
            <div key={item.id} className="cart-item">
              <img
                src={item.image || '/placeholder.png'}
                alt={item.name}
                className="item-image"
                onError={(e) => {
                  e.target.src = '/placeholder.png'
                }}
              />
              <div className="item-details">
                <h3>{item.name}</h3>
                <p className="item-price">${item.price.toFixed(2)}</p>
              </div>

              <div className="quantity-control">
                <button onClick={() => updateQuantity(item.id, item.quantity - 1)}>
                  <Minus size={18} />
                </button>
                <span>{item.quantity}</span>
                <button onClick={() => updateQuantity(item.id, item.quantity + 1)}>
                  <Plus size={18} />
                </button>
              </div>

              <div className="item-subtotal">
                ${(item.price * item.quantity).toFixed(2)}
              </div>

              <button
                className="btn-remove"
                onClick={() => removeItem(item.id)}
                title="Remove item"
              >
                <Trash2 size={20} />
              </button>
            </div>
          ))}
        </div>

        <div className="cart-summary">
          <div className="summary-row">
            <span>Subtotal:</span>
            <span>${getTotalPrice().toFixed(2)}</span>
          </div>
          <div className="summary-row">
            <span>Shipping:</span>
            <span>$0.00</span>
          </div>
          <div className="summary-row">
            <span>Tax:</span>
            <span>${(getTotalPrice() * 0.1).toFixed(2)}</span>
          </div>
          <div className="summary-row total">
            <span>Total:</span>
            <span>${(getTotalPrice() * 1.1).toFixed(2)}</span>
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
