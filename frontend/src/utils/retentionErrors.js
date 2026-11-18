export function retentionErrorMessage(error, fallback = 'The account action could not be completed.') {
  const detail = error?.response?.data?.detail
  if (typeof detail === 'string') return detail
  const orders = (detail?.blocking_orders || []).map((order) =>
    `Order ${order.order_code || order.order_id}: ${(order.reasons || []).join('; ')}`)
  return [detail?.message, ...orders].filter(Boolean).join(' ') || fallback
}
