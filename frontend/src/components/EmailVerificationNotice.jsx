import { useState } from 'react'
import { Link } from 'react-router-dom'
import { verificationAPI } from '../services/api'

export default function EmailVerificationNotice() {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('Verify your FoodNova email before continuing. Your cart is saved.')
  const resend = async () => {
    if (busy) return
    setBusy(true)
    try { const result = await verificationAPI.resend(); setMessage(result.message) }
    catch (error) { setMessage(typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'Verification email could not be requested. Please try later.') }
    finally { setBusy(false) }
  }
  return <section className="form-notice" aria-label="Email verification required"><h2>Verify your email</h2><p role="status">{message}</p><button type="button" className="btn btn-primary" onClick={resend} disabled={busy}>{busy ? 'Requesting…' : 'Resend verification email'}</button> <Link to="/verify-email">Check verification status</Link></section>
}
