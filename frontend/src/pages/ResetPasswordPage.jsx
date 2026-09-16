import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { authAPI } from '../services/api'
import './AuthPages.css'

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [sent, setSent] = useState(false)
  const [complete, setComplete] = useState(false)
  const [loading, setLoading] = useState(false)

  const requestReset = async (event) => {
    event.preventDefault()
    setLoading(true)
    try {
      await authAPI.requestPasswordReset({ email })
      setSent(true)
    } catch {
      setSent(true)
    } finally { setLoading(false) }
  }

  const confirmReset = async (event) => {
    event.preventDefault()
    if (password !== confirmPassword) return toast.error('Passwords do not match')
    if (password.length < 6) return toast.error('Password must be at least 6 characters')
    setLoading(true)
    try {
      await authAPI.confirmPasswordReset({ token, new_password: password, confirm_password: confirmPassword })
      setComplete(true)
    } catch (error) {
      toast.error(error.response?.data?.detail || 'This reset link is invalid or expired.')
    } finally { setLoading(false) }
  }

  return <div className="auth-page"><div className="auth-container"><div className="auth-card">
    {complete ? <><h1>Password changed</h1><p className="auth-subtitle">Your FoodNova password has been updated. Sign in again to continue.</p><Link className="btn btn-primary btn-large" to="/login">Return to Login</Link></>
      : token ? <><h1>Create New Password</h1><p className="auth-subtitle">Choose a new password for your FoodNova account.</p><form onSubmit={confirmReset}><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="New password" required minLength="6" /><input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Confirm password" required minLength="6" /><button className="btn btn-primary btn-large" disabled={loading}>{loading ? 'Saving...' : 'Change Password'}</button></form></>
      : sent ? <><h1>Check your email</h1><p className="auth-subtitle">If an account exists for this email, password reset instructions have been sent.</p><button className="btn btn-primary btn-large" onClick={() => setSent(false)}>Resend instructions</button></>
        : <><h1>Forgot Password?</h1><p className="auth-subtitle">Enter your registered email to receive reset instructions.</p><form onSubmit={requestReset}><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required /><button className="btn btn-primary btn-large" disabled={loading}>{loading ? 'Sending...' : 'Request Reset'}</button></form></>}
    <p className="auth-footer"><Link to="/login">Return to Login</Link></p>
  </div></div></div>
}