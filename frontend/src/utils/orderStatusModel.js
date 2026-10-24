const clean = (value) => String(value || '').trim().toLowerCase()

const LEGACY_STATUSES = [
  'order_placed', 'processing', 'ready_for_pickup', 'picked_up',
  'out_for_delivery', 'delivered', 'cancelled',
]
const KNOWN_STATUSES = [...LEGACY_STATUSES, 'preparing', 'picked_up_by_customer']

export const isPickupOrder = (order) => clean(order?.delivery_method) === 'pickup'

// Mirrors the backend PICKUP_STATUS_TRANSITIONS table.
const PICKUP_NEXT_STATUSES = {
  order_placed: ['preparing', 'cancelled'],
  pending_payment: ['preparing', 'cancelled'],
  receipt_submitted: ['preparing', 'cancelled'],
  payment_confirmed: ['preparing', 'cancelled'],
  preparing: ['ready_for_pickup', 'cancelled'],
  processing: ['ready_for_pickup', 'cancelled'],
  ready_for_pickup: ['cancelled'],
}

const STATUS_LABELS = {
  order_placed: 'Order Placed',
  pending_payment: 'Order Placed',
  receipt_submitted: 'Order Placed',
  payment_confirmed: 'Order Placed',
  preparing: 'Preparing',
  processing: 'Processing',
  ready_for_pickup: 'Ready for Pickup',
  picked_up: 'Picked Up',
  picked_up_by_customer: 'Picked Up',
  out_for_delivery: 'Out for Delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
}

export const orderStatusLabel = (status) => STATUS_LABELS[clean(status)] || 'Order Placed'

// Canonical fulfillment status for display. A collected pickup is terminal
// whichever of the three backend status fields carries the value.
export function canonicalOrderStatus(order) {
  const fields = [order?.order_status, order?.fulfillment_status, order?.status].map(clean)
  if (isPickupOrder(order) && fields.some((value) => ['picked_up_by_customer', 'picked_up'].includes(value))) {
    return 'picked_up_by_customer'
  }
  const fulfillment = clean(order?.order_status || order?.fulfillment_status)
  if (KNOWN_STATUSES.includes(fulfillment)) return fulfillment
  const status = clean(order?.status)
  if (KNOWN_STATUSES.filter((value) => value !== 'order_placed').includes(status)) return status
  return 'order_placed'
}

export function pickupTimelineSteps(order, paymentConfirmed) {
  const status = canonicalOrderStatus(order)
  const collected = status === 'picked_up_by_customer'
  const ready = collected || status === 'ready_for_pickup'
  const preparing = ready || ['preparing', 'processing'].includes(status)
  return [
    { label: 'Order Placed', completed: true },
    { label: 'Payment Confirmed', completed: paymentConfirmed || preparing },
    { label: 'Preparing Order', completed: preparing },
    { label: 'Ready for Pickup', completed: ready },
    { label: 'Picked Up', completed: collected },
  ]
}

export function adminOrderStatusOptions(order, deliveryOptions) {
  if (!isPickupOrder(order)) return deliveryOptions
  const current = canonicalOrderStatus(order)
  const rawCurrent = clean(order?.order_status || order?.fulfillment_status || order?.status) || 'order_placed'
  const next = PICKUP_NEXT_STATUSES[rawCurrent] || PICKUP_NEXT_STATUSES[current] || []
  return [rawCurrent, ...next]
    .filter((value, index, all) => all.indexOf(value) === index)
    .map((value) => ({ value, label: orderStatusLabel(value) }))
}

export function apiErrorMessage(error, fallback) {
  const detail = error?.response?.data?.detail
  if (typeof detail === 'string' && detail.trim()) return detail
  if (Array.isArray(detail) && detail.length) {
    return detail.map((item) => item?.msg || String(item)).join('; ')
  }
  return error?.response?.data?.message || fallback
}
