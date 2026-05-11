import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Fingerprint, Mail, Phone, UserPlus, User } from 'lucide-react'
import { authAPI } from '../services/api'
import { useAuthStore } from '../store/authStore'
import { clearBiometricSession, hasBiometricSession, restoreBiometricSession, verifyBiometric } from '../utils/biometricAuth'
import './AuthPages.css'

export default function AuthLandingPage() {
  const navigate = useNavigate()
  const { login } = useAuthStore()
  const [showBiometricLogin, setShowBiometricLogin] = useState(false)
  const [biometricLoading, setBiometricLoading] = useState(false)

  useEffect(() => {
    hasBiometricSession().then(setShowBiometricLogin).catch(() => setShowBiometricLogin(false))
  }, [])

  const enterGuestMode = () => {
    localStorage.setItem('guestMode', 'true')
    navigate('/', { replace: true })
  }

  const handleBiometricLogin = async () => {
    try {
      setBiometricLoading(true)
      const verified = await verifyBiometric({
        reason: 'Login to FoodNova',
        title: 'FoodNova Biometric Login',
        subtitle: 'Verify your identity',
        description: 'Use fingerprint or face unlock',
      })
      if (!verified.success) {
        toast.error(verified.reason || 'Biometric login failed. Use email/phone login instead.')
        return
      }

      const session = await restoreBiometricSession()
      if (!session?.token || !session?.user) {
        await clearBiometricSession()
        setShowBiometricLogin(false)
        toast.error('Session expired. Please login again.')
        return
      }

      localStorage.setItem('token', session.token)
      localStorage.setItem('user', JSON.stringify(session.user))
      try {
        await authAPI.me()
      } catch (error) {
        if (error?.response?.status === 401) {
          localStorage.removeItem('token')
          localStorage.removeItem('user')
          await clearBiometricSession()
          setShowBiometricLogin(false)
          toast.error('Session expired. Please login again.')
          return
        }
        throw error
      }

      localStorage.removeItem('guestMode')
      login(session.user, session.token)
      toast.success('Biometric login successful')
      navigate('/', { replace: true })
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Biometric login failed. Use email/phone login instead.')
    } finally {
      setBiometricLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-container">
        <div className="auth-card auth-landing-card">
          <h1>Welcome to FoodNova</h1>
          <p className="auth-subtitle">Choose how you want to continue</p>

          <div className="auth-landing-actions">
            {showBiometricLogin && (
              <button className="btn btn-secondary" onClick={handleBiometricLogin} disabled={biometricLoading}>
                <Fingerprint size={16} /> {biometricLoading ? 'Checking...' : 'Login with Biometrics'}
              </button>
            )}

            <button className="btn btn-primary" onClick={() => navigate('/login')}>
              <Mail size={16} /> Login with Email
            </button>

            <button className="btn btn-secondary" onClick={() => navigate('/login?mode=phone')}>
              <Phone size={16} /> Login with Phone Number
            </button>

            <button className="btn btn-secondary" onClick={() => navigate('/register')}>
              <UserPlus size={16} /> Create Account
            </button>

            <button className="btn btn-ghost" onClick={enterGuestMode}>
              <User size={16} /> Explore as Guest
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
