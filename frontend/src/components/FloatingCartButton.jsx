import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ShoppingCart, X } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { useCartStore } from '../store/cartStore'
import { resolveMediaUrl } from '../services/api'
import './FloatingCartButton.css'

const hiddenRoutes = ['/cart', '/checkout', '/login', '/register', '/admin/login']

const formatCurrency = (value) =>
  `₦${Number(value || 0).toLocaleString()}`

export default function FloatingCartButton() {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const { isAdmin } = useAuthStore()
  const { items, getTotalItems, getTotalPrice } = useCartStore()

  const totalItems = getTotalItems()
  const totalPrice = getTotalPrice()
  const shouldHide = isAdmin
    || location.pathname.startsWith('/admin')
    || hiddenRoutes.some((path) => location.pathname === path || location.pathname.startsWith(`${path}/`))
    || totalItems <= 0

  const cartItems = useMemo(() => items || [], [items])

  useEffect(() => {
    setDrawerOpen(false)
  }, [location.pathname])

  if (shouldHide) return null

  const goTo = (path) => {
    setDrawerOpen(false)
    navigate(path)
  }

  return (
    <>
      <button
        type="button"
        className="floating-cart-button"
        onClick={() => setDrawerOpen(true)}
        aria-label={`Open cart with ${totalItems} item${totalItems === 1 ? '' : 's'}`}
      >
        <ShoppingCart size={22} />
        <span>Cart</span>
        <strong>{totalItems}</strong>
      </button>

      {drawerOpen && (
        <div className="mini-cart-layer" role="dialog" aria-modal="true" aria-label="Mini cart">
          <button type="button" className="mini-cart-backdrop" onClick={() => setDrawerOpen(false)} aria-label="Close cart drawer" />

          <aside className="mini-cart-drawer">
            <div className="mini-cart-header">
              <div>
                <p>FoodNova Cart</p>
                <h2>{totalItems} item{totalItems === 1 ? '' : 's'}</h2>
              </div>
              <button type="button" className="mini-cart-close" onClick={() => setDrawerOpen(false)} aria-label="Close cart drawer">
                <X size={20} />
              </button>
            </div>

            <div className="mini-cart-items">
              {cartItems.map((item) => {
                const quantity = Number(item.quantity || item.qty || 1)
                const price = Number(item.price || item.unit_price || 0)
                const name = item.name || item.product_name || 'FoodNova item'
                const imageUrl = resolveMediaUrl(item.image_url || item.image)

                return (
                  <article className="mini-cart-item" key={item.id || name}>
                    {imageUrl && <img src={imageUrl} alt={name} />}
                    <div>
                      <h3>{name}</h3>
                      <p>{quantity} × {formatCurrency(price)}</p>
                    </div>
                    <strong>{formatCurrency(price * quantity)}</strong>
                  </article>
                )
              })}
            </div>

            <div className="mini-cart-total">
              <span>Subtotal</span>
              <strong>{formatCurrency(totalPrice)}</strong>
            </div>

            <div className="mini-cart-actions">
              <button type="button" className="mini-cart-primary" onClick={() => goTo('/checkout')}>Checkout</button>
              <button type="button" className="mini-cart-secondary" onClick={() => goTo('/cart')}>View Cart</button>
            </div>

            <Link className="mini-cart-continue" to="/products" onClick={() => setDrawerOpen(false)}>
              Continue shopping
            </Link>
          </aside>
        </div>
      )}
    </>
  )
}
