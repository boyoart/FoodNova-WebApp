import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { authAPI } from '../services/api'
import toast from 'react-hot-toast'
import { Mail, Lock } from 'lucide-react'
import './AuthPages.css'

export default function AdminLoginPage() {
  const navigate = useNavigate()
  const { adminLogin } = useAuthStore()
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  })

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      setLoading(true)
      const res = await authAPI.adminLogin(formData)
      const body = res.data || {}
      const adminUser = body.admin || body.data?.admin || body.user || body.data?.user
      const token = body.access_token || body.accessToken || body.token || body.data?.access_token || body.data?.token
      if (!adminUser || adminUser.role !== 'admin' || !token) {
        throw new Error('Admin login response was incomplete')
      }
      adminLogin(adminUser, token)
      toast.success('Admin login successful!')
      navigate('/admin/dashboard')
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Admin login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-container">
        <div className="auth-card">
          <h1>Admin Login</h1>
          <p className="auth-subtitle">Access the admin panel</p>

          <form onSubmit={handleSubmit}>
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
                placeholder="admin@example.com"
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

            <button type="submit" className="btn btn-primary btn-large" disabled={loading}>
              {loading ? 'Logging in...' : 'Admin Login'}
            </button>
          </form>

          <p className="auth-footer">
            <Link to="/">Back to Home</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
