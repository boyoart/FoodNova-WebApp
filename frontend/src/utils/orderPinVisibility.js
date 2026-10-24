const paymentIsConfirmed = (order) =>
  ['payment_confirmed', 'confirmed', 'paid'].includes(
    String(order?.payment_status || '').trim().toLowerCase(),
  )

export function pickupOrderReadyForPin(order) {
  const statuses = [order?.status, order?.order_status, order?.fulfillment_status]
    .map((status) => String(status || '').trim().toLowerCase())
  return String(order?.delivery_method || '').trim().toLowerCase() === 'pickup' &&
    paymentIsConfirmed(order) &&
    statuses.includes('ready_for_pickup') &&
    !statuses.includes('picked_up_by_customer')
}

export function customerVisibleOrderPin(order) {
  if (!paymentIsConfirmed(order)) return ''

  const method = String(order?.delivery_method || '').trim().toLowerCase()
  if (method === 'pickup') {
    const ready = pickupOrderReadyForPin(order)
    const createdAt = Date.parse(order?.delivery_code_created_at || '')
    if (Number.isFinite(createdAt) && Date.now() - createdAt >= 72 * 60 * 60 * 1000) return ''
    return ready ? String(order?.pickup_pin || order?.delivery_pin || '') : ''
  }
  if (method === 'delivery' && String(order?.dispatch_status || '').toUpperCase() === 'ARRIVED') {
    return String(order?.delivery_pin || order?.delivery_code || '')
  }
  return ''
}
