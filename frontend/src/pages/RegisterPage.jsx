import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { authAPI } from '../services/api'
import toast from 'react-hot-toast'
import { Home, Mail, Lock, User, Phone } from 'lucide-react'
import FoodNovaLogo from '../components/FoodNovaLogo'
import './AuthPages.css'

export default function RegisterPage() {
  const navigate = useNavigate()
  const { login } = useAuthStore()
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    deliveryAddress: '',
    password: '',
    confirmPassword: '',
  })

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const extractAuthPayload = (res) => {
    // Supports both Axios response format and plain JSON format
    const body = res?.data ?? res
    const nested = body?.data ?? {}

    const user = body?.user || nested?.user
    const token =
      body?.access_token ||
      body?.accessToken ||
      body?.token ||
      body?.jwt ||
      nested?.access_token ||
      nested?.accessToken ||
      nested?.token ||
      nested?.jwt

    return { body, user, token }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (formData.password !== formData.confirmPassword) {
      toast.error('Passwords do not match')
      return
    }

    try {
      setLoading(true)

      const res = await authAPI.register({
        name: formData.name,
        full_name: formData.name,
        fullName: formData.name,
        email: formData.email,
        phone: formData.phone,
        address: formData.deliveryAddress,
        delivery_address: formData.deliveryAddress,
        password: formData.password,
        confirmPassword: formData.confirmPassword,
        confirm_password: formData.confirmPassword,
      })

      const { user, token } = extractAuthPayload(res)

      if (!user || !token) {
        console.error('Unexpected registration response:', res)
        throw new Error('Registration response missing user or token')
      }

      login(user, token)
      toast.success('Registration successful!')
      navigate('/')
    } catch (error) {
      console.error('Registration error:', error)
      toast.error(error.response?.data?.detail || error.message || 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-container">
        <div className="auth-card">
          <div className="auth-logo-wrap"><FoodNovaLogo variant="auth" /></div>
          <h1>Create Account</h1>
          <p className="auth-subtitle">Join FoodNova today</p>

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>
                <User size={18} />
                Full Name
              </label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                required
                placeholder="John Doe"
              />
            </div>

            <div className="form-group">
              <label>
                <Mail size={18} />
                Email
              </label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                required
                placeholder="you@example.com"
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
                placeholder="+2348000000000"
              />
            </div>

            <div className="form-group">
              <label>
                <Home size={18} />
                Delivery Address
              </label>
              <textarea
                name="deliveryAddress"
                value={formData.deliveryAddress}
                onChange={handleChange}
                placeholder="Optional delivery address"
                rows="3"
              />
            </div>

            <div className="form-group">
              <label>
                <Lock size={18} />
                Password
              </label>
              <input
                type="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                required
                placeholder="••••••••"
              />
            </div>

            <div className="form-group">
              <label>
                <Lock size={18} />
                Confirm Password
              </label>
              <input
                type="password"
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleChange}
                required
                placeholder="••••••••"
              />
            </div>

            <button type="submit" className="btn btn-primary btn-large" disabled={loading}>
              {loading ? 'Creating Account...' : 'Create Account'}
            </button>
          </form>

          <p className="auth-footer">
            Already have an account? <Link to="/login">Login here</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
