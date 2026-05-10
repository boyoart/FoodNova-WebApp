import { useNavigate } from 'react-router-dom'
import { Mail, Phone, UserPlus, User } from 'lucide-react'
import './AuthPages.css'

export default function AuthLandingPage() {
  const navigate = useNavigate()

  const enterGuestMode = () => {
    localStorage.setItem('guestMode', 'true')
    navigate('/', { replace: true })
  }

  return (
    <div className="auth-page">
      <div className="auth-container">
        <div className="auth-card auth-landing-card">
          <h1>Welcome to FoodNova</h1>
          <p className="auth-subtitle">Choose how you want to continue</p>

          <div className="auth-landing-actions">
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
