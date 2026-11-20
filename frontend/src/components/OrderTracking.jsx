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
  const lookup = async (code) => {
    if (!allowed || !validOrderNumber(code)) { setMessage('Enter the order number shown in your FoodNova confirmation email.'); return }
    currentRequest.current?.abort()
    const controller = new AbortController()
    currentRequest.current = controller
    const owner = identity
    setCode(code.trim())
    setBusy(true); setMessage(''); setResult(null)
    try {
      const privateResult = owner ? await trackingAPI.lookup({ order_code: code.trim() }, controller.signal) : null
      const response = privateResult?.status === 'authorized' ? privateResult : await trackingAPI.publicProgress(code.trim(), controller.signal)
      if (!controller.signal.aborted && identityRef.current === owner) {
        orderCode.current = code.trim()
        if (response.timeline) setResult({ kind: 'public', order: response })
        else apply(response, owner)
      }
    } catch (error) { if (!controller.signal.aborted) setMessage(error.response?.status === 429 ? 'Please wait before checking again.' : 'Order progress is unavailable. Check your order number or try again shortly.') }
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
    if (!allowed || !(open || fullPage) || !data || (data.kind === 'public' ? ['delivered', 'picked_up_by_customer', 'cancelled', 'delivery_update'].includes(data.order.status) : terminalTracking(data.order))) return undefined
    return startTrackingPolling({ refresh: async (signal) => {
      try {
        const response = data.kind === 'guest' ? await trackingAPI.progress(token, signal) : data.kind === 'public' ? await trackingAPI.publicProgress(orderCode.current, signal) : await trackingAPI.lookup({ order_code: orderCode.current }, signal)
        if (!signal.aborted) {
          if (data.kind === 'public') setResult({ kind: 'public', order: response })
          else apply(response, identity)
        }
      } catch (error) {
        if (signal.aborted) return
        if (data.kind === 'public' && [401, 403, 404].includes(error.response?.status)) { setResult(null); setMessage('Order progress is unavailable. Check your order number or contact FoodNova support.') }
        else if ([401, 403, 404].includes(error.response?.status)) { setResult(null); setMessage('Tracking access expired. Please sign in or request a new secure link.') }
        else setMessage('Updates are temporarily unavailable. Last retrieved progress is shown.')
      }
    }, interval: data.kind === 'public' ? 60000 : 20000 })
  }, [allowed, open, fullPage, data?.kind, data?.order?.order_status, data?.order?.status, identity, token])
  useEffect(() => () => currentRequest.current?.abort(), [])
  useEffect(() => {
    if (!(open || fullPage)) { currentRequest.current?.abort(); setBusy(false) }
  }, [open, fullPage])
  const refresh = async () => {
    if (data?.kind !== 'guest') return lookup(code)
    setBusy(true)
    try { apply(await trackingAPI.progress(token), '') }
    catch { setMessage('Tracking is temporarily unavailable. Please try again shortly.') }
    finally { setBusy(false) }
  }
  return <TrackingContext.Provider value={{ allowed, open, setOpen, data, busy, message, lookup, refresh, code }}>{children}</TrackingContext.Provider>
}

function TrackingContent({ fullPage }) {
  const tracking = useContext(TrackingContext)
  const [code, setCode] = useState(tracking.code || '')
  const { data, busy, message, lookup } = tracking
  return <><h2 id={fullPage ? 'full-tracking-title' : 'quick-tracking-title'}>Order progress</h2>
    <p>Enter your order number to check your delivery progress. No account required.</p>
    <form aria-busy={busy} onSubmit={(event) => { event.preventDefault(); lookup(code) }}><label htmlFor={fullPage ? 'full-order-number' : 'quick-order-number'}>Order Number</label><input id={fullPage ? 'full-order-number' : 'quick-order-number'} value={code} onChange={(event) => setCode(event.target.value)} maxLength={30} required autoComplete="off" placeholder="e.g. FN-001" />
      <button type="submit" disabled={busy}>{busy ? 'Checking…' : 'Track Order'}</button></form>
    <p role="status">{message}</p>
    {data?.kind === 'public' && <section className="tracking-progress" aria-label="Current order progress"><p>Order {data.order.order_number}</p><h3 className="public-tracking-badge">{data.order.status_label}</h3><p>{data.order.delivery_stage}</p><ol>{data.order.timeline.map((step) => <li key={step.step} className={step.state === 'completed' ? 'is-complete' : ''} aria-current={step.state === 'current' ? 'step' : undefined}>{step.label}<span className="sr-only"> — {step.state}</span></li>)}</ol><button type="button" disabled={busy} onClick={tracking.refresh}>Refresh status</button><p>Last retrieved general progress. No arrival estimate is provided.</p><Link to="/contact">Contact FoodNova support</Link></section>}
    {data && data.kind !== 'public' && <section className="tracking-progress" aria-label="Current order progress"><h3>{orderStatusLabel(canonicalOrderStatus(data.order))}</h3><p>Current recorded status. No estimated arrival time is provided.</p><ol>{trackingTimeline(data.order).map((step) => <li key={step.label} className={step.completed ? 'is-complete' : ''}>{step.completed ? '✓ ' : ''}{step.label}<span className="sr-only">{step.completed ? ' reached' : ' not yet reached'}</span></li>)}</ol>
      {data.kind === 'customer' ? <><p>Order {data.order.order_code}</p><p>Total: {formatPrice(data.order.total_amount)} · Payment: {data.order.payment_status}</p><ul>{data.order.items?.map((item, i) => <li key={i}>{item.product_name || item.name} × {item.quantity || item.qty}</li>)}</ul><Link to={`/track-order?order=${encodeURIComponent(data.order.order_code)}`}>View Full Tracking</Link></>
        : <><p>This private link permits limited progress only.</p><Link to="/login" state={{ from: '/track-order' }}>Log In for Full Details</Link></>}
    </section>}
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
