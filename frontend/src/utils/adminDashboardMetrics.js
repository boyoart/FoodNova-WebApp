const PAID_STATUSES = new Set(['payment_confirmed', 'confirmed', 'paid'])

const numericValue = (value, fallback = 0) => {
  const result = Number(value)
  return Number.isFinite(result) ? result : fallback
}

const normalizeText = (value) => String(value ?? '').trim().toLowerCase()

const nullableNumber = (value) => {
  if (value === null || value === undefined || value === '') return null
  const result = Number(value)
  return Number.isFinite(result) ? result : null
}

const objectValue = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {}

export const normalizeSmartOperations = (value) => {
  const source = objectValue(value)
  const revenue = objectValue(source.revenue)
  const fulfillment = objectValue(source.fulfillment)
  const inventory = objectValue(source.inventory)
  const riders = objectValue(source.riders)
  const health = objectValue(source.operational_health)

  return {
    revenue: {
      total: nullableNumber(revenue.total),
      average: nullableNumber(revenue.average),
      paid_orders: nullableNumber(revenue.paid_orders),
    },
    fulfillment: {
      delivered: nullableNumber(fulfillment.delivered),
      rate: nullableNumber(fulfillment.rate),
      total_orders: nullableNumber(fulfillment.total_orders),
    },
    inventory: {
      low_stock: nullableNumber(inventory.low_stock),
      out_of_stock: nullableNumber(inventory.out_of_stock),
      alerts: Array.isArray(inventory.alerts) ? inventory.alerts.filter(Boolean) : null,
    },
    riders: {
      total: nullableNumber(riders.total),
      available: nullableNumber(riders.available),
      busy: nullableNumber(riders.busy),
      utilization: nullableNumber(riders.utilization),
    },
    alerts: Array.isArray(source.alerts) ? source.alerts.filter(Boolean) : null,
    operational_health: {
      score: nullableNumber(health.score),
      label: typeof health.label === 'string' ? health.label : null,
      detail: typeof health.detail === 'string' ? health.detail : null,
    },
  }
}

export const normalizeDashboardListResponse = (body, keys = []) => {
  if (Array.isArray(body)) return { available: true, data: body }
  if (!body || typeof body !== 'object') return { available: false, data: null }
  for (const key of keys) {
    if (Array.isArray(body[key])) return { available: true, data: body[key] }
  }
  if (Array.isArray(body.data)) return { available: true, data: body.data }
  return { available: false, data: null }
}

export const classifyDashboardRequestError = (error) => {
  const status = Number(error?.response?.status)
  return status === 401 || status === 403 ? 'unauthorized' : 'unavailable'
}

const isPaidOrder = (order) => PAID_STATUSES.has(normalizeText(order.payment_status || order.status || order.order_status))

const productStock = (product) => numericValue(product.stock_qty ?? product.stock ?? 0)

const productLowStockThreshold = (product) => numericValue(product.low_stock_threshold || 5, 5)

const isLowStockProduct = (product) => {
  const stock = productStock(product)
  return stock > 0 && stock <= productLowStockThreshold(product)
}

const isOutOfStockProduct = (product) => product.is_out_of_stock === true || productStock(product) <= 0

const orderStatusText = (order) => normalizeText(order.order_status || order.fulfillment_status || order.status || '')

const orderDelivered = (order) => ['delivered', 'picked_up', 'picked_up_by_customer'].includes(orderStatusText(order))

const riderStatusText = (rider) => normalizeText(rider.status || rider.availability || rider.state || '')

const riderAvailable = (rider) => {
  const status = riderStatusText(rider)
  const active = rider.is_active !== false && rider.active !== false && rider.status !== 'inactive'
  return active && ['available', 'online', 'on_duty', 'idle', 'ready', 'busy'].includes(status) ? true : active
}

const operationalStatusLabel = (score) => {
  if (score >= 85) return 'Excellent'
  if (score >= 70) return 'Watchlist'
  if (score >= 60) return 'Stable'
  return 'Critical'
}

export const summarizeBusinessIntelligence = ({ orders, products, riders } = {}) => {
  const hasOrders = Array.isArray(orders)
  const hasProducts = Array.isArray(products)
  const hasRiders = Array.isArray(riders)
  const activeOrders = hasOrders ? orders : []
  const activeProducts = (hasProducts ? products : []).filter((product) => product.is_active !== false && product.active !== false)
  const activeRiders = hasRiders ? riders : []

  const paidOrders = activeOrders.filter(isPaidOrder)
  const totalRevenue = hasOrders ? paidOrders.reduce((sum, order) => sum + Number(order.total_amount ?? order.total ?? 0), 0) : null
  const averageOrderValue = hasOrders ? (paidOrders.length ? totalRevenue / paidOrders.length : 0) : null
  const deliveredOrders = activeOrders.filter(orderDelivered)
  const fulfillmentRate = hasOrders ? (activeOrders.length ? Math.round((deliveredOrders.length / activeOrders.length) * 100) : 0) : null

  const paymentReviewOrders = activeOrders.filter((order) => ['pending_payment', 'receipt_submitted'].includes(normalizeText(order.payment_status || order.status || '')))
  const lowStockItems = hasProducts ? activeProducts.filter((product) => isLowStockProduct(product)) : []
  const outOfStockItems = hasProducts ? activeProducts.filter(isOutOfStockProduct) : []

  const riderAvailableCount = hasRiders ? activeRiders.filter(riderAvailable).length : null
  const riderUtilization = hasRiders ? (activeRiders.length ? Math.round((riderAvailableCount / activeRiders.length) * 100) : 0) : null

  const stockAlerts = [...lowStockItems, ...outOfStockItems].slice(0, 6).map((product) => ({
    id: product.id,
    name: product.name,
    stock_qty: productStock(product),
    stock_unit: product.stock_unit || 'unit',
    is_out_of_stock: isOutOfStockProduct(product),
  }))

  const alerts = []
  if (hasOrders && paymentReviewOrders.length) {
    alerts.push({
      type: 'payment_review',
      level: 'warning',
      title: `${paymentReviewOrders.length} payment review${paymentReviewOrders.length === 1 ? '' : 's'} pending`,
      detail: 'Customer payments need approval before the queue can fully clear.',
    })
  }

  if (hasProducts && stockAlerts.length) {
    alerts.push({
      type: 'inventory',
      level: outOfStockItems.length ? 'critical' : 'warning',
      title: `${lowStockItems.length} low-stock and ${outOfStockItems.length} out-of-stock item${outOfStockItems.length === 1 ? '' : 's'}`,
      detail: 'Inventory risk is elevated and restocking should be prioritized.',
    })
  }

  const healthScore = hasOrders && hasProducts && hasRiders
    ? Math.min(100, Math.max(0, Math.round((fulfillmentRate + riderUtilization + (paymentReviewOrders.length ? 40 : 60)) / 2)))
    : null

  return {
    data_availability: { orders: hasOrders, inventory: hasProducts, dispatch: hasRiders },
    total_orders: hasOrders ? activeOrders.length : null,
    total_revenue: totalRevenue,
    paid_orders: hasOrders ? paidOrders.length : null,
    delivered_orders: hasOrders ? deliveredOrders.length : null,
    fulfillment_rate: fulfillmentRate,
    average_order_value: averageOrderValue,
    low_stock_items: hasProducts ? lowStockItems.length : null,
    out_of_stock_items: hasProducts ? outOfStockItems.length : null,
    rider_total: hasRiders ? activeRiders.length : null,
    rider_available: riderAvailableCount,
    rider_busy: hasRiders ? Math.max(0, activeRiders.length - riderAvailableCount) : null,
    rider_utilization: riderUtilization,
    alerts,
    operational_health: {
      score: healthScore,
      label: healthScore === null ? 'Unavailable' : operationalStatusLabel(healthScore),
      detail: healthScore === null ? 'Some dashboard sources are unavailable.' : paymentReviewOrders.length || stockAlerts.length ? 'Payment reviews and inventory risk need attention.' : 'Operations are on track.',
    },
    orders: hasOrders ? activeOrders : null,
    products: hasProducts ? activeProducts : null,
    riders: hasRiders ? activeRiders : null,
    stock_alerts: stockAlerts,
  }
}

export const buildSmartOperationsSummary = ({ orders, products, riders } = {}) => {
  const summary = summarizeBusinessIntelligence({ orders, products, riders })
  return {
    data_availability: summary.data_availability,
    revenue: {
      total: summary.total_revenue,
      average: summary.average_order_value,
      paid_orders: summary.paid_orders,
    },
    fulfillment: {
      delivered: summary.delivered_orders,
      rate: summary.fulfillment_rate,
      total_orders: summary.total_orders,
    },
    inventory: {
      low_stock: summary.low_stock_items,
      out_of_stock: summary.out_of_stock_items,
      alerts: summary.data_availability.inventory ? summary.stock_alerts : null,
    },
    riders: {
      total: summary.rider_total,
      available: summary.rider_available,
      busy: summary.rider_busy,
      utilization: summary.rider_utilization,
    },
    alerts: summary.alerts,
    operational_health: summary.operational_health,
  }
}

export const summarizeDashboardOrders = (orders = []) => {
  const paymentStatus = (order) => String(order.payment_status || order.status || '').toLowerCase()
  const orderStatus = (order) => {
    const status = String(order.order_status || order.fulfillment_status || order.status || '').toLowerCase()
    return ['pending_payment', 'receipt_submitted', 'payment_confirmed', 'payment_rejected', 'paid'].includes(status)
      ? 'order_placed'
      : status
  }
  const classifyOrder = (order) => {
    const status = orderStatus(order)
    if (['cancelled', 'canceled'].includes(status)) return 'Cancelled'
    if (['delivered', 'picked_up', 'picked_up_by_customer'].includes(status)) return 'Completed'
    if (['ready_for_pickup', 'picked_up_from_store', 'out_for_delivery', 'arrived'].includes(status)) return 'Fulfilment'
    if (status === 'processing') return 'Processing'
    return 'Pending'
  }
  const attentionOrders = orders.filter((order) => (
    ['pending_payment', 'receipt_submitted'].includes(paymentStatus(order))
  ))
  const distribution = ['Pending', 'Processing', 'Fulfilment', 'Completed', 'Cancelled'].map((label) => ({
    label,
    count: orders.filter((order) => classifyOrder(order) === label).length,
  }))

  return {
    total_orders: orders.length,
    total_revenue: orders.reduce((sum, order) => (
      sum + (PAID_STATUSES.has(String(order.payment_status || '').toLowerCase())
        ? Number(order.total_amount || order.total || 0)
        : 0)
    ), 0),
    pending_payments: orders.filter((order) => paymentStatus(order) === 'pending_payment').length,
    receipt_submitted: orders.filter((order) => paymentStatus(order) === 'receipt_submitted').length,
    delivered_orders: orders.filter((order) => orderStatus(order) === 'delivered').length,
    status_distribution: distribution,
    recent_orders: orders.slice(0, 5).map((order) => ({
      id: order.id,
      order_code: order.order_code || `#${order.id}`,
      status: orderStatus(order),
      payment_status: paymentStatus(order),
      created_at: order.created_at || '',
      total_amount: Number(order.total_amount || order.total || 0),
    })),
    attention_orders: attentionOrders.slice(0, 5).map((order) => ({
      id: order.id,
      order_code: order.order_code || `#${order.id}`,
      payment_status: paymentStatus(order),
      created_at: order.created_at || '',
      total_amount: Number(order.total_amount || order.total || 0),
    })),
  }
}

export const summarizeDashboardProducts = (products = []) => {
  const activeProducts = products.filter((product) => product.is_active !== false && product.active !== false)
  const getStock = (product) => productStock(product)
  const isLowStock = (product) => isLowStockProduct(product) || (product.low_stock === true && getStock(product) > 0)
  const isOutOfStock = (product) => isOutOfStockProduct(product)
  const stockAlerts = activeProducts.filter((product) => isLowStock(product) || isOutOfStock(product))

  return {
    total_products: activeProducts.length,
    low_stock_products: activeProducts.filter(isLowStock).length,
    out_of_stock_products: activeProducts.filter(isOutOfStock).length,
    stock_alerts: stockAlerts.slice(0, 6).map((product) => ({
      id: product.id,
      name: product.name,
      stock_qty: getStock(product),
      stock_unit: product.stock_unit || 'unit',
      is_out_of_stock: isOutOfStock(product),
    })),
  }
}