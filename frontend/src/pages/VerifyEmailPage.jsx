import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { verificationAPI } from '../services/api'
import { useAuthStore } from '../store/authStore'
import EmailVerificationNotice from '../components/EmailVerificationNotice'
import './AuthPages.css'

let captured
const capture = () => {
  if (captured === undefined) {
    captured = new URLSearchParams(window.location.hash.slice(1)).get('token') || ''
    if (window.location.hash) window.history.replaceState(window.history.state, '', '/verify-email')
  }
  return captured
}
export default function VerifyEmailPage() {
  const [token] = useState(capture)
  const started = useRef(false)
  const { isAuthenticated, updateUser, user } = useAuthStore()
  const [message, setMessage] = useState(token ? 'Verifying your email…' : 'Open the verification link from your email, or request another one below.')
  useEffect(() => {
    if (!token || started.current) return
    started.current = true
    verificationAPI.confirm(token).then(async () => {
      setMessage('Your email is verified. Return to checkout or track your orders.')
      if (isAuthenticated) { const status = await verificationAPI.status(); const current = useAuthStore.getState().user; if (current?.id === user?.id) updateUser({ ...current, ...status }) }
    }).catch(() => setMessage('This link is unavailable, expired or already used. Check your status or request another email.'))
  }, [token])
  const check = async () => {
    const owner = useAuthStore.getState().user?.id
    try { const status = await verificationAPI.status(); const current = useAuthStore.getState().user; if (owner !== current?.id) return; updateUser({ ...current, ...status }); setMessage(status.email_verified ? 'Your email is verified.' : 'Your email is not verified yet. Use the latest email link.') }
    catch { setMessage('Sign in again to check verification status.') }
  }
  return <div className="auth-page"><section className="auth-card"><h1>FoodNova email verification</h1><p role="status">{message}</p>{isAuthenticated && <button type="button" onClick={check}>Refresh verification status</button>}{isAuthenticated && !user?.email_verified && <EmailVerificationNotice />}<p><Link to="/checkout">Return to checkout</Link> · <Link to="/track-order">Track orders</Link> · <Link to="/login">Log in</Link></p></section></div>
}
