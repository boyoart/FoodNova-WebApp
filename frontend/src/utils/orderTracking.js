import { canonicalOrderStatus, isPickupOrder, orderStatusLabel } from './orderStatusModel.js'

export const validOrderNumber = (value) => /^[A-Za-z0-9][A-Za-z0-9-]{2,39}$/.test(String(value || '').trim())
export const terminalTracking = (order) => ['delivered', 'picked_up_by_customer', 'cancelled'].includes(canonicalOrderStatus(order))
export const trackingTimeline = (order) => {
  const status = canonicalOrderStatus(order)
  if (status === 'cancelled') return [{ label: 'Order Placed', completed: true }, { label: 'Cancelled', completed: true }]
  const stages = isPickupOrder(order)
    ? [['order_placed', 'Order Placed'], ['preparing', 'Preparing'], ['ready_for_pickup', 'Ready for Pickup'], ['picked_up_by_customer', 'Picked Up']]
    : [['order_placed', 'Order Placed'], ['processing', 'Processing'], ['out_for_delivery', 'Out for Delivery'], ['delivered', 'Delivered']]
  const stage = !isPickupOrder(order) && ['preparing', 'ready_for_pickup', 'picked_up'].includes(status) ? 'processing' : status === 'processing' && isPickupOrder(order) ? 'preparing' : status
  const current = stages.findIndex(([key]) => key === stage)
  return stages.map(([, label], index) => ({ label, completed: index <= Math.max(current, 0), current: label === orderStatusLabel(status) }))
}

export const consumeTrackingToken = (location, history) => {
  const raw = new URLSearchParams((location.hash || '').slice(1)).get('track')
  if (!raw) return ''
  history.replaceState(history.state, '', location.pathname + location.search)
  return /^[A-Za-z0-9_-]{43}$/.test(raw) ? raw : ''
}

let initialCapability
export const initialTrackingToken = () => {
  // React StrictMode may invoke state initializers twice. Capture/strip once,
  // retaining only in module memory so the second invocation sees the same token.
  if (initialCapability === undefined) initialCapability = consumeTrackingToken(window.location, window.history)
  return initialCapability
}

export const startTrackingPolling = ({ refresh, active = () => true, hidden = () => globalThis.document?.hidden,
  schedule = setTimeout, cancel = clearTimeout, interval = 20000 }) => {
  const controller = new AbortController()
  let timer
  const tick = async () => {
    if (controller.signal.aborted || !active()) return
    try { if (!hidden()) await refresh(controller.signal) } catch { /* UI owns errors. */ }
    if (!controller.signal.aborted && active()) timer = schedule(tick, interval)
  }
  timer = schedule(tick, interval)
  return () => { controller.abort(); cancel(timer) }
}
