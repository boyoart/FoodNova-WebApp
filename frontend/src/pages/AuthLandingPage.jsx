import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Fingerprint, Mail, Phone, UserPlus, User } from 'lucide-react'
import { authAPI } from '../services/api'
import { useAuthStore } from '../store/authStore'
import { disableBiometricLogin, hasSavedBiometricCredentials, restoreBiometricLogin } from '../utils/biometricService'
import { clearActiveSessionOnly, updateLastActivity } from '../utils/sessionManager'
import './AuthPages.css'

export default function AuthLandingPage() {
  const navigate = useNavigate()
  const { login } = useAuthStore()
  const [showBiometricLogin, setShowBiometricLogin] = useState(false)
  const [biometricLoading, setBiometricLoading] = useState(false)

  useEffect(() => {
    hasSavedBiometricCredentials().then(setShowBiometricLogin).catch(() => setShowBiometricLogin(false))
  }, [])

  const enterGuestMode = () => {
    localStorage.setItem('guestMode', 'true')
    navigate('/', { replace: true })
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
      navigate('/', { replace: true })
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Biometric login failed. Please log in with email or phone.')
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
