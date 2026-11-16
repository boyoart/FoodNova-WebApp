import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Package } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { trackingAPI } from '../services/api'
import { canonicalOrderStatus, orderStatusLabel } from '../utils/orderStatusModel'
import { initialTrackingToken, startTrackingPolling, terminalTracking, trackingTimeline, validOrderNumber } from '../utils/orderTracking'
import { formatPrice } from '../utils/formatters'
import './OrderTracking.css'

const TrackingContext = createContext(null)

export function OrderTrackingProvider({ children }) {
  const { user, isAuthenticated, isAdmin } = useAuthStore()
  const location = useLocation()
  const identity = isAuthenticated && !isAdmin ? String(user?.id || user?.email || '') : ''
  const identityRef = useRef(identity)
  identityRef.current = identity
  const [token] = useState(initialTrackingToken)
  const [open, setOpen] = useState(false)
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [code, setCode] = useState('')
  const currentRequest = useRef(null)
  const orderCode = useRef('')
  const data = result?.kind === 'customer' && result.owner !== identity ? null : result
  const fullPage = ['/orders', '/track-order'].includes(location.pathname)
  const allowed = !isAdmin && !location.pathname.startsWith('/admin')
  const apply = (response, owner) => {
    if (response.status === 'authorized' && identityRef.current === owner && owner) setResult({ kind: 'customer', order: response.order, owner })
    else if (response.status === 'limited') setResult({ kind: 'guest', order: response.progress })
    else { setMessage(response.message || 'Sign in or request a secure email link to continue.'); setResult(null) }
  }
  const lookup = async (code, email = '') => {
    if (!allowed || !validOrderNumber(code)) { setMessage('Enter the order number shown in your FoodNova confirmation email.'); return }
    currentRequest.current?.abort()
    const controller = new AbortController()
    currentRequest.current = controller
    const owner = identity
    setCode(code.trim())
    setBusy(true); setMessage(''); setResult(null)
    try {
      const response = await trackingAPI.lookup({ order_code: code.trim(), email: email.trim() }, controller.signal)
      if (!controller.signal.aborted && identityRef.current === owner) { orderCode.current = code.trim(); apply(response, owner) }
    } catch { if (!controller.signal.aborted) setMessage('We could not verify this order. Sign in to My Orders or try again shortly.') }
    finally { if (!controller.signal.aborted) setBusy(false) }
  }
  useEffect(() => {
    setResult(null); setMessage(''); setBusy(false)
    currentRequest.current?.abort()
  }, [identity])
  useEffect(() => {
    if (!token || !allowed) return undefined
    const controller = new AbortController()
    setOpen(true); setBusy(true)
    trackingAPI.progress(token, controller.signal).then((response) => { if (!controller.signal.aborted) apply(response, '') })
      .catch(() => { if (!controller.signal.aborted) setMessage('This tracking link is unavailable or expired. Sign in to My Orders or request a new link.') })
      .finally(() => { if (!controller.signal.aborted) setBusy(false) })
    return () => controller.abort()
  }, [token, allowed])
  useEffect(() => {
    if (!allowed || !(open || fullPage) || !data || terminalTracking(data.order)) return undefined
    return startTrackingPolling({ refresh: async (signal) => {
      try {
        const response = data.kind === 'guest' ? await trackingAPI.progress(token, signal) : await trackingAPI.lookup({ order_code: orderCode.current }, signal)
        if (!signal.aborted) apply(response, identity)
      } catch (error) {
        if (signal.aborted) return
        if ([401, 403, 404].includes(error.response?.status)) { setResult(null); setMessage('Tracking access expired. Please sign in or request a new secure link.') }
        else setMessage('Updates are temporarily unavailable. Last retrieved progress is shown.')
      }
    } })
  }, [allowed, open, fullPage, data?.kind, data?.order?.order_status, identity, token])
  useEffect(() => () => currentRequest.current?.abort(), [])
  useEffect(() => {
    if (!(open || fullPage)) { currentRequest.current?.abort(); setBusy(false) }
  }, [open, fullPage])
  return <TrackingContext.Provider value={{ allowed, open, setOpen, data, busy, message, lookup, code }}>{children}</TrackingContext.Provider>
}

function TrackingContent({ fullPage }) {
  const tracking = useContext(TrackingContext)
  const [code, setCode] = useState(tracking.code || '')
  const [email, setEmail] = useState('')
  const { data, busy, message, lookup } = tracking
  return <><h2 id={fullPage ? 'full-tracking-title' : 'quick-tracking-title'}>Track Your Order</h2>
    <form onSubmit={(event) => { event.preventDefault(); lookup(code, email) }}><label htmlFor={fullPage ? 'full-order-number' : 'quick-order-number'}>Order number</label><input id={fullPage ? 'full-order-number' : 'quick-order-number'} value={code} onChange={(event) => setCode(event.target.value)} maxLength={40} required autoComplete="off" placeholder="From your confirmation email" />
      <label htmlFor={fullPage ? 'full-tracking-email' : 'quick-tracking-email'}>Order email (for a secure guest link)</label><input id={fullPage ? 'full-tracking-email' : 'quick-tracking-email'} type="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={254} autoComplete="email" />
      <button type="submit" disabled={busy}>{busy ? 'Checking…' : 'Track Order'}</button></form>
    <p role="status">{message}</p>
    {data && <section className="tracking-progress" aria-label="Current order progress"><h3>{orderStatusLabel(canonicalOrderStatus(data.order))}</h3><p>Current recorded status. No estimated arrival time is provided.</p><ol>{trackingTimeline(data.order).map((step) => <li key={step.label} className={step.completed ? 'is-complete' : ''}>{step.completed ? '✓ ' : ''}{step.label}<span className="sr-only">{step.completed ? ' reached' : ' not yet reached'}</span></li>)}</ol>
      {data.kind === 'customer' ? <><p>Order {data.order.order_code}</p><p>Total: {formatPrice(data.order.total_amount)} · Payment: {data.order.payment_status}</p><ul>{data.order.items?.map((item, i) => <li key={i}>{item.product_name || item.name} × {item.quantity || item.qty}</li>)}</ul><Link to={`/track-order?order=${encodeURIComponent(data.order.order_code)}`}>View Full Tracking</Link></>
        : <><p>This private link permits limited progress only.</p><Link to="/login" state={{ from: '/track-order' }}>Log In for Full Details</Link></>}
    </section>}
    {!data && <p><Link to="/login" state={{ from: '/track-order' }}>Sign in to My Orders</Link> for private order details.</p>}
  </>
}

export function FullTrackingEntry() {
  const tracking = useContext(TrackingContext)
  return tracking?.allowed ? <section className="tracking-full-entry"><TrackingContent fullPage /></section> : null
}

export default function FloatingOrderTracking() {
  const tracking = useContext(TrackingContext)
  const location = useLocation()
  const visible = tracking?.allowed && !['/orders', '/track-order', '/checkout', '/cart'].includes(location.pathname)
  if (!visible) return null
  return <div className="floating-order-tracking"><Link className="tracking-shortcut" to="/track-order"><Package size={19} /><span>Track Your Order</span></Link></div>
}
