import { useEffect, useState } from 'react'
import { useNavigate, Link, useSearchParams } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { authAPI } from '../services/api'
import toast from 'react-hot-toast'
import { Fingerprint, Mail, Lock, Phone } from 'lucide-react'
import { disableBiometricLogin, hasSavedBiometricCredentials, restoreBiometricLogin } from '../utils/biometricService'
import { clearActiveSessionOnly, updateLastActivity } from '../utils/sessionManager'
import './AuthPages.css'

export default function LoginPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { login } = useAuthStore()
  const [loading, setLoading] = useState(false)
  const [biometricLoading, setBiometricLoading] = useState(false)
  const [showBiometricLogin, setShowBiometricLogin] = useState(false)
  const [pendingPromptSession, setPendingPromptSession] = useState(null)
  const [formData, setFormData] = useState({
    email: '',
    phone: '',
    password: '',
  })
  const loginMode = searchParams.get('mode') === 'phone' ? 'phone' : 'email'

  useEffect(() => {
    hasSavedBiometricCredentials().then(setShowBiometricLogin).catch(() => setShowBiometricLogin(false))
  }, [])

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
      if (!showBiometricLogin) {
        setPendingPromptSession({ user, token })
        return
      }
      navigate('/')
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  const continueAfterPrompt = () => {
    setPendingPromptSession(null)
    navigate('/')
  }

  const goToProfileForBiometrics = () => {
    setPendingPromptSession(null)
    navigate('/profile?highlight=biometric')
  }

  const handleBiometricLogin = async () => {
    try {
      setBiometricLoading(true)
      const session = await restoreBiometricLogin()
      if (!session?.token || !session?.user) {
        setShowBiometricLogin(false)
        toast.error('Biometric login failed. Please log in with email or phone.')
        return
      }

      localStorage.setItem('token', session.token)
      localStorage.setItem('foodnova_token', session.token)
      localStorage.setItem('user', JSON.stringify(session.user))
      localStorage.setItem('foodnova_user', JSON.stringify(session.user))
      try {
        await authAPI.me()
      } catch (error) {
        if (error?.response?.status === 401) {
          await disableBiometricLogin()
          clearActiveSessionOnly()
          setShowBiometricLogin(false)
          toast.error('Session expired. Please login again.')
          return
        }
        throw error
      }

      localStorage.removeItem('guestMode')
      login(session.user, session.token)
      updateLastActivity()
      toast.success('Biometric login successful')
      navigate('/')
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Biometric login failed. Please log in with email or phone.')
    } finally {
      setBiometricLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-container">
        <div className="auth-card">
          <h1>{loginMode === 'phone' ? 'Phone Login' : 'Login'}</h1>
          <p className="auth-subtitle">Welcome back to FoodNova</p>

          {showBiometricLogin && (
            <button type="button" className="btn btn-secondary btn-large biometric-login-btn" onClick={handleBiometricLogin} disabled={biometricLoading}>
              <Fingerprint size={18} /> {biometricLoading ? 'Checking...' : 'Login with Biometrics'}
            </button>
          )}

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

      {pendingPromptSession && (
        <div className="auth-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="biometric-prompt-title">
          <div className="auth-modal">
            <div className="auth-modal-icon"><Fingerprint size={24} /></div>
            <h2 id="biometric-prompt-title">Enable biometric login for faster access?</h2>
            <p>Set it up from your Profile page after this login. FoodNova will never store your password.</p>
            <div className="auth-modal-actions">
              <button type="button" className="btn btn-primary" onClick={goToProfileForBiometrics}>
                Enable in Profile
              </button>
              <button type="button" className="btn btn-secondary" onClick={continueAfterPrompt}>
                Maybe later
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
