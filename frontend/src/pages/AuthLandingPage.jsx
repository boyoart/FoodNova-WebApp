import { useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { Mail, Phone, UserPlus, User } from 'lucide-react'
import './AuthPages.css'

export default function AuthLandingPage() {
  const navigate = useNavigate()
  const [accountNotice] = useState(() => {
    const notice = localStorage.getItem('foodnova_auth_notice')
    if (notice) localStorage.removeItem('foodnova_auth_notice')
    return notice
  })

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
          {accountNotice && <div className="auth-account-notice">{accountNotice}</div>}

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
