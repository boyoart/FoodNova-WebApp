export const BROADCAST_STORAGE_KEY = 'foodnova_customer_broadcasts'
export const READ_STORAGE_KEY = 'foodnova_read_notification_keys'
export const DELETED_STORAGE_KEY = 'foodnova_deleted_notification_keys'

export const safeParseArray = (key) => {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '[]')
    return Array.isArray(value) ? value : []
  } catch {
    return []
  }
}

export const getReadKeys = () => safeParseArray(READ_STORAGE_KEY)
export const setReadKeys = (keys) => localStorage.setItem(READ_STORAGE_KEY, JSON.stringify([...new Set(keys)]))
export const getDeletedKeys = () => safeParseArray(DELETED_STORAGE_KEY)
export const setDeletedKeys = (keys) => localStorage.setItem(DELETED_STORAGE_KEY, JSON.stringify([...new Set(keys)]))

export const getBroadcasts = () => safeParseArray(BROADCAST_STORAGE_KEY)
export const saveBroadcastForCustomers = (broadcast) => {
  const existing = getBroadcasts()
  const item = {
    ...broadcast,
    id: broadcast.id || `broadcast-${Date.now()}`,
    local_key: broadcast.local_key || `broadcast-${broadcast.id || Date.now()}`,
    category: 'broadcast',
    type: broadcast.type || 'broadcast',
    is_read: false,
    created_at: broadcast.created_at || new Date().toISOString(),
  }
  const next = [item, ...existing.filter((old) => String(old.id) !== String(item.id))]
  localStorage.setItem(BROADCAST_STORAGE_KEY, JSON.stringify(next))
  window.dispatchEvent(new Event('foodnova-notifications-updated'))
  return item
}

export const getOutForDeliveryMessage = (orderCode) =>
  `Your order ${orderCode} is out for delivery. The dispatch rider will provide the 4-digit delivery PIN when they arrive. Enter it in the app only after you have received your order.`

export const sanitizeBackendNotifications = (items = []) =>
  items
    .filter((item) => String(item.title || '').toLowerCase() !== 'delivery code generated')
    .map((item) => {
      const title = String(item.title || '').toLowerCase()
      if (title === 'out for delivery') {
        return { ...item, message: getOutForDeliveryMessage(item.order_code || 'your order') }
      }
      return item
    })

export const normalizeOrders = (body) => {
  if (Array.isArray(body)) return body
  if (Array.isArray(body?.data)) return body.data
  if (Array.isArray(body?.orders)) return body.orders
  return []
}

export const createDerivedNotificationsFromOrders = (orders = []) => {
  const readKeys = new Set(getReadKeys())
  const derived = []

  orders.forEach((order) => {
    const orderCode = order.order_code || `FN-${String(order.id || '').padStart(5, '0')}`
    const paymentStatus = String(order.payment_status || '').toLowerCase()
    const orderStatus = String(order.order_status || order.fulfillment_status || '').toLowerCase()
    const serviceNote = order.service_note || order.admin_note

    const push = (keySuffix, title, message, category = 'order') => {
      const key = `order-${order.id}-${keySuffix}`
      derived.push({
        id: key,
        local_key: key,
        order_id: order.id,
        order_code: orderCode,
        title,
        message,
        category,
        type: 'derived_order_update',
        is_read: readKeys.has(key),
        created_at: order.updated_at || order.created_at || new Date().toISOString(),
      })
    }

    if (paymentStatus === 'receipt_submitted') push('receipt-submitted', 'Receipt Submitted', `Your receipt for order ${orderCode} has been submitted and is awaiting review.`, 'payment')
    if (paymentStatus === 'payment_confirmed') push('payment-confirmed', 'Payment Confirmed', `Your payment for order ${orderCode} has been confirmed.`, 'payment')
    if (paymentStatus === 'payment_rejected') push('payment-rejected', 'Payment Rejected', `Your payment for order ${orderCode} was rejected. Please upload a clearer receipt or contact support.`, 'payment')
    if (orderStatus === 'processing') push('processing', 'Order Processing', `Your order ${orderCode} is now being processed.`, 'order')
    if (orderStatus === 'ready_for_pickup') push('ready-for-pickup', 'Ready for Pickup', `Your order ${orderCode} is ready for pickup.`, 'delivery')
    if (orderStatus === 'out_for_delivery') push('out-for-delivery', 'Out for Delivery', getOutForDeliveryMessage(orderCode), 'delivery')
    if (orderStatus === 'delivered') push('delivered', 'Order Delivered', `Your order ${orderCode} has been marked as delivered.`, 'delivery')
    if (serviceNote) push(`service-${String(serviceNote).slice(0, 30)}`, 'FoodNova Service Update', `Your order ${orderCode} update: ${serviceNote}`, 'service')
  })

  return derived
}

export const createBroadcastNotifications = () => {
  const readKeys = new Set(getReadKeys())
  return getBroadcasts().map((broadcast) => {
    const key = broadcast.local_key || `broadcast-${broadcast.id}`
    return {
      ...broadcast,
      id: broadcast.id || key,
      local_key: key,
      title: broadcast.title || 'FoodNova Update',
      message: broadcast.message || '',
      category: 'broadcast',
      type: broadcast.type || 'broadcast',
      is_read: readKeys.has(key) || Boolean(broadcast.is_read),
      created_at: broadcast.created_at || new Date().toISOString(),
    }
  })
}

export const getNotificationKey = (item) => item.local_key || `${item.order_id || 'general'}-${item.title}-${item.message}`

export const mergeNotifications = (backendItems = [], derivedItems = [], broadcastItems = []) => {
  const seen = new Set()
  const deleted = new Set(getDeletedKeys())
  const combined = []

  ;[...sanitizeBackendNotifications(backendItems), ...derivedItems, ...broadcastItems].forEach((item) => {
    const key = getNotificationKey(item)
    if (seen.has(key) || deleted.has(key)) return
    seen.add(key)
    combined.push({ ...item, local_key: item.local_key || key })
  })

  return combined.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
}

export const markLocalNotificationRead = (notification) => {
  const key = getNotificationKey(notification)
  setReadKeys([...getReadKeys(), key])
  return key
}

export const deleteLocalNotification = (notification) => {
  const key = getNotificationKey(notification)
  setDeletedKeys([...getDeletedKeys(), key])
  window.dispatchEvent(new Event('foodnova-notifications-updated'))
  return key
}
