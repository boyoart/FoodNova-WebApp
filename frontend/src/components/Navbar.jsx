import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Menu, X, ShoppingCart, LogOut, LogIn, Home, User } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { useCartStore } from '../store/cartStore'
import './Navbar.css'

export default function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const { user, admin, isAuthenticated, isAdmin, logout } = useAuthStore()
  const { getTotalItems } = useCartStore()

  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/')
    setMobileMenuOpen(false)
  }

  return (
    <nav className="navbar">
      <div className="navbar-container">
        <Link to="/" className="navbar-logo">
          <img src="/logo.png" alt="FoodNova" className="logo-image" />
          FoodNova
        </Link>

        <button
          className="menu-toggle"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        >
          {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>

        <ul className={`nav-menu ${mobileMenuOpen ? 'active' : ''}`}>
          <li className="nav-item">
            <Link to="/" className="nav-link" onClick={() => setMobileMenuOpen(false)}>
              <Home size={18} />
              <span>Home</span>
            </Link>
          </li>

          <li className="nav-item">
            <Link to="/products" className="nav-link" onClick={() => setMobileMenuOpen(false)}>
              <span>Products</span>
            </Link>
          </li>

          {isAuthenticated && !isAdmin && (
            <>
              <li className="nav-item">
                <Link to="/orders" className="nav-link" onClick={() => setMobileMenuOpen(false)}>
                  <span>Orders</span>
                </Link>
              </li>
              <li className="nav-item">
                <span className="nav-text">Hi, {user?.name || 'User'}</span>
              </li>
            </>
          )}

          {isAdmin && (
            <>
              <li className="nav-item">
                <Link to="/admin/dashboard" className="nav-link" onClick={() => setMobileMenuOpen(false)}>
                  <span>Dashboard</span>
                </Link>
              </li>
              <li className="nav-item">
                <span className="nav-text">Admin</span>
              </li>
            </>
          )}

          <li className="nav-item">
            <Link to="/cart" className="nav-link cart-link" onClick={() => setMobileMenuOpen(false)}>
              <ShoppingCart size={20} />
              {getTotalItems() > 0 && <span className="cart-badge">{getTotalItems()}</span>}
            </Link>
          </li>

          {isAuthenticated || isAdmin ? (
            <li className="nav-item">
              <button className="nav-link logout-btn" onClick={handleLogout}>
                <LogOut size={18} />
                <span>Logout</span>
              </button>
            </li>
          ) : (
            <>
              <li className="nav-item">
                <Link to="/login" className="nav-link" onClick={() => setMobileMenuOpen(false)}>
                  <LogIn size={18} />
                  <span>Login</span>
                </Link>
              </li>
              <li className="nav-item">
                <Link to="/register" className="nav-link register-btn" onClick={() => setMobileMenuOpen(false)}>
                  <User size={18} />
                  <span>Register</span>
                </Link>
              </li>
            </>
          )}
        </ul>
      </div>
    </nav>
  )
}
