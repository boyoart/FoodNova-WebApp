import { useState } from 'react'
import { useNavigate, Link, useSearchParams } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { authAPI } from '../services/api'
import toast from 'react-hot-toast'
import { Mail, Lock, Phone } from 'lucide-react'
import './AuthPages.css'

export default function LoginPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { login } = useAuthStore()
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    email: '',
    phone: '',
    password: '',
  })
  const loginMode = searchParams.get('mode') === 'phone' ? 'phone' : 'email'

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      setLoading(true)
      const payload = loginMode === 'phone'
        ? { phone: formData.phone, password: formData.password, auth_method: 'phone_password' }
        : { email: formData.email, password: formData.password }
      const res = await authAPI.login(payload)
      localStorage.removeItem('guestMode')
      const user = res.data.user
      const token = res.data.access_token
      login(user, token)
      toast.success('Login successful!')
      if (user.role === 'messenger' || user.delivery_worker_type === 'messenger') {
        navigate('/messenger/dashboard')
        return
      }
      if (user.role === 'rider' || user.delivery_worker_type === 'rider') {
        navigate('/rider/dashboard')
        return
      }
      navigate('/')
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-container">
        <div className="auth-card">
          <h1>{loginMode === 'phone' ? 'Phone Login' : 'Login'}</h1>
          <p className="auth-subtitle">Welcome back to FoodNova</p>

          <form onSubmit={handleSubmit}>
            {loginMode === 'phone' ? (
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
                  placeholder="080... or +234..."
                />
              </div>
            ) : (
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
            )}

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

            <button type="submit" className="btn btn-primary btn-large" disabled={loading}>
              {loading ? 'Logging in...' : 'Login'}
            </button>
          </form>

          <p className="auth-footer">
            Don't have an account? <Link to="/register">Register here</Link>
          </p>
        </div>
      </div>

    </div>
  )
}
