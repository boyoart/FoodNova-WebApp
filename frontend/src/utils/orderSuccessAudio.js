const pendingKey = 'foodnova_audio_pending_orders'
const completedKey = 'foodnova_audio_completed_orders'
const verifiedPaymentStatuses = new Set(['payment_confirmed', 'confirmed', 'paid'])
const cancelledStatuses = new Set(['cancelled', 'canceled'])
const pendingOrders = new Set()
const completedOrders = new Set()

const orderKey = (order) => order?.id == null || String(order.id).trim() === '' ? '' : String(order.id)

const readStoredSet = (storage, key, memory) => {
  const values = new Set(memory)
  try {
    const stored = JSON.parse(storage?.getItem(key) || '[]')
    if (Array.isArray(stored)) stored.forEach((value) => values.add(String(value)))
  } catch {
    // Audio deduplication remains available for the current page session.
  }
  return values
}

const persistSet = (storage, key, values, memory) => {
  memory.clear()
  for (const value of [...values].slice(-300)) memory.add(value)
  try {
    storage?.setItem(key, JSON.stringify([...memory]))
  } catch {
    // Checkout and order tracking must not depend on browser storage.
  }
}

export function isVerifiedOrderPayment(order) {
  const paymentStatus = String(order?.payment_status || '').trim().toLowerCase()
  const orderStatuses = [order?.order_status, order?.fulfillment_status, order?.status]
    .map((status) => String(status || '').trim().toLowerCase())
  return verifiedPaymentStatuses.has(paymentStatus)
    && !orderStatuses.some((status) => cancelledStatuses.has(status))
}

export function handleOrderAudioStatus(order, { created = false, play = () => {}, storage } = {}) {
  const id = orderKey(order)
  if (!id) return false

  let browserStorage = storage
  if (browserStorage === undefined) {
    try {
      browserStorage = globalThis.localStorage
    } catch {
      browserStorage = null
    }
  }

  const pending = readStoredSet(browserStorage, pendingKey, pendingOrders)
  const completed = readStoredSet(browserStorage, completedKey, completedOrders)
  const cancelled = [order?.order_status, order?.fulfillment_status, order?.status]
    .some((status) => cancelledStatuses.has(String(status || '').trim().toLowerCase()))

  if (cancelled) {
    pending.delete(id)
    persistSet(browserStorage, pendingKey, pending, pendingOrders)
    return false
  }
  if (created) pending.add(id)

  if (!isVerifiedOrderPayment(order)) {
    if (created) persistSet(browserStorage, pendingKey, pending, pendingOrders)
    return false
  }

  if (!pending.has(id) || completed.has(id)) return false
  pending.delete(id)
  completed.add(id)
  persistSet(browserStorage, pendingKey, pending, pendingOrders)
  persistSet(browserStorage, completedKey, completed, completedOrders)
  play('order')
  return true
}
