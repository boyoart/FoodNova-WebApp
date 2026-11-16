import assert from 'node:assert/strict'
import test from 'node:test'
import { summarizeDashboardOrders, summarizeDashboardProducts, summarizeBusinessIntelligence, buildSmartOperationsSummary, buildSmartOperationsSummaryFromAggregates, normalizeSmartOperations, normalizeDashboardListResponse, normalizeDashboardReportResponse, classifyDashboardRequestError } from '../src/utils/adminDashboardMetrics.js'
import { toPackFormData } from '../src/utils/adminPackFormData.js'

test('revenue includes only explicitly paid orders and queues payment reviews', () => {
  const summary = summarizeDashboardOrders([
    { id: 1, order_code: 'FN-1', payment_status: 'payment_confirmed', order_status: 'delivered', total_amount: 1200, created_at: '2026-11-14T10:00:00Z' },
    { id: 2, payment_status: 'paid', total: 800 },
    { id: 3, payment_status: 'pending_payment', total_amount: 9500 },
    { id: 4, payment_status: 'receipt_submitted', total_amount: 5000 },
  ])

  assert.deepEqual({
    total_orders: summary.total_orders,
    total_revenue: summary.total_revenue,
    pending_payments: summary.pending_payments,
    receipt_submitted: summary.receipt_submitted,
    delivered_orders: summary.delivered_orders,
  }, {
    total_orders: 4,
    total_revenue: 2000,
    pending_payments: 1,
    receipt_submitted: 1,
    delivered_orders: 1,
  })
  assert.deepEqual(summary.status_distribution.map(({ label, count }) => [label, count]), [
    ['Pending', 3], ['Processing', 0], ['Fulfilment', 0], ['Completed', 1], ['Cancelled', 0],
  ])
  assert.deepEqual(summary.recent_orders[0], {
    id: 1,
    order_code: 'FN-1',
    status: 'delivered',
    payment_status: 'payment_confirmed',
    created_at: '2026-11-14T10:00:00Z',
    total_amount: 1200,
  })
  assert.deepEqual(summary.attention_orders.map(({ id }) => id), [3, 4])
})

test('inventory KPIs count active products and separate low from zero stock', () => {
  const summary = summarizeDashboardProducts([
    { id: 1, is_active: true, stock_qty: 2, low_stock_threshold: 5 },
    { id: 2, is_active: true, stock_qty: 0 },
    { id: 3, is_active: false, stock_qty: 1 },
    { id: 4, active: false, stock_qty: 0 },
    { id: 5, is_active: true, stock_qty: 20 },
  ])
  assert.deepEqual({
    total_products: summary.total_products,
    low_stock_products: summary.low_stock_products,
    out_of_stock_products: summary.out_of_stock_products,
  }, {
    total_products: 3,
    low_stock_products: 1,
    out_of_stock_products: 1,
  })
  assert.deepEqual(summary.stock_alerts.map(({ id }) => id), [1, 2])
})

test('smart operations intelligence turns live order and stock data into actionable business alerts', () => {
  const summary = summarizeBusinessIntelligence({
    orders: [
      { id: 1, payment_status: 'payment_confirmed', order_status: 'delivered', total_amount: 1200 },
      { id: 2, payment_status: 'receipt_submitted', order_status: 'processing', total_amount: 900 },
      { id: 3, payment_status: 'payment_confirmed', order_status: 'out_for_delivery', total_amount: 2000 },
    ],
    products: [
      { id: 10, is_active: true, stock_qty: 3, low_stock_threshold: 5 },
      { id: 11, is_active: true, stock_qty: 0 },
      { id: 12, is_active: false, stock_qty: 2 },
    ],
    riders: [
      { id: 1, is_active: true, status: 'available' },
      { id: 2, is_active: true, status: 'busy' },
      { id: 3, is_active: false, status: 'offline' },
    ],
  })

  assert.equal(summary.total_revenue, 3200)
  assert.equal(summary.fulfillment_rate, 33)
  assert.equal(summary.average_order_value, 1600)
  assert.equal(summary.rider_utilization, 50)
  assert.equal(summary.low_stock_items, 1)
  assert.equal(summary.out_of_stock_items, 1)
  assert.deepEqual(summary.alerts.map(({ type }) => type), ['payment_review', 'inventory'])
  assert.equal(summary.operational_health.score, null)
  assert.deepEqual(summary.operational_health.label, 'Unavailable')

  const smart = buildSmartOperationsSummary({
    orders: summary.orders,
    products: summary.products,
    riders: summary.riders,
  })

  assert.equal(smart.revenue.total, 3200)
  assert.equal(smart.inventory.low_stock, 1)
  assert.equal(smart.riders.available, 1)
  assert.equal(smart.riders.busy, 1)
  assert.equal(smart.alerts.length, 2)

  const dispatch = buildSmartOperationsSummary({
    orders: [],
    products: [],
    riders: [
      { status: 'ACTIVE', availability: 'ONLINE' },
      { status: 'ACTIVE', availability: 'BUSY' },
      { status: 'ONBOARDING', availability: 'OFFLINE' },
      { status: 'INACTIVE', availability: 'OFFLINE' },
    ],
  })
  assert.equal(dispatch.riders.total, 2)
  assert.equal(dispatch.riders.available, 1)
  assert.equal(dispatch.riders.busy, 1)
  assert.equal(dispatch.riders.utilization, 50)
})

test('missing and null revenue metrics remain unavailable while valid zero stays zero', () => {
  const missing = normalizeSmartOperations({ operational_health: { score: 0 }, alerts: [] })
  const nullRevenue = normalizeSmartOperations({ revenue: { total: null, average: null, paid_orders: null } })
  const valid = normalizeSmartOperations({ revenue: { total: 0, average: 0, paid_orders: 0 } })

  assert.equal(missing.revenue.total, null)
  assert.equal(missing.revenue.average, null)
  assert.equal(nullRevenue.revenue.average, null)
  assert.equal(valid.revenue.total, 0)
  assert.equal(valid.revenue.average, 0)
})

test('empty and partial dashboard responses preserve unavailable source state', () => {
  assert.deepEqual(normalizeDashboardListResponse(null, ['orders']), { available: false, data: null })
  assert.deepEqual(normalizeDashboardListResponse({}, ['orders']), { available: false, data: null })
  assert.deepEqual(normalizeDashboardListResponse({ orders: [] }, ['orders']), { available: true, data: [] })
  assert.deepEqual(normalizeDashboardListResponse({ success: true, data: [{ id: 1 }] }, ['orders']), { available: true, data: [{ id: 1 }] })
  assert.deepEqual(normalizeDashboardReportResponse({ summary: { total_orders: null } }), { available: false, data: null })
  assert.deepEqual(normalizeDashboardReportResponse({ summary: {} }), { available: false, data: null })
  assert.equal(normalizeDashboardReportResponse({ summary: { total_orders: 0 } }).available, true)

  const partial = buildSmartOperationsSummary({ orders: [{ payment_status: 'payment_confirmed', total_amount: 500 }], products: null, riders: null })
  assert.equal(partial.revenue.total, 500)
  assert.equal(partial.revenue.average, 500)
  assert.equal(partial.inventory.low_stock, null)
  assert.equal(partial.riders.available, null)
  assert.equal(partial.operational_health.score, null)
  const unavailable = buildSmartOperationsSummary({ orders: null, products: null, riders: null })
  assert.equal(unavailable.revenue.paid_orders, null)
  assert.equal(unavailable.fulfillment.delivered, null)
  assert.equal(unavailable.riders.busy, null)
  assert.equal(buildSmartOperationsSummary({}).revenue.average, null)
  assert.equal(buildSmartOperationsSummary({ orders: [], products: [], riders: [] }).revenue.average, 0)
})

test('dashboard request failures distinguish unauthorized from unavailable backends', () => {
  assert.equal(classifyDashboardRequestError({ response: { status: 401 } }), 'unauthorized')
  assert.equal(classifyDashboardRequestError({ response: { status: 403 } }), 'unauthorized')
  assert.equal(classifyDashboardRequestError({ code: 'ECONNABORTED' }), 'unavailable')
  assert.equal(classifyDashboardRequestError(new Error('Network Error')), 'unavailable')
})

test('aggregate dashboard summaries keep missing metrics unavailable and use server-calculated revenue', () => {
  const missing = buildSmartOperationsSummaryFromAggregates({ reportSummary: null, products: null, riders: null })
  const valid = buildSmartOperationsSummaryFromAggregates({
    reportSummary: {
      total_orders: 3,
      gross_collected_revenue: 4200,
      average_order_value: 2100,
      paid_orders: 2,
      completed_orders: 1,
      fulfillment_rate: 33,
      attention_count: 2,
      pending_payments: 1,
      unassigned_dispatch_orders: 1,
    },
    products: [],
    riders: [],
    attentionOrders: [{ id: 8, attention_reason: 'payment_review' }],
  })

  assert.equal(missing.revenue.total, null)
  assert.equal(missing.fulfillment.rate, null)
  assert.equal(missing.inventory.low_stock, null)
  assert.equal(missing.riders.available, null)
  assert.equal(valid.revenue.total, 4200)
  assert.equal(valid.revenue.average, 2100)
  assert.equal(valid.fulfillment.rate, 33)
  assert.equal(valid.riders.total, 0)
  assert.equal(valid.attention_count, 2)
  assert.deepEqual(valid.alerts.map(({ type }) => type), ['payment_review', 'dispatch'])
  assert.equal(valid.operational_health.score, null)
})

test('Combo Pack create and update payloads send the replacement under the backend image field', async () => {
  const upload = new Blob(['image-bytes'], { type: 'image/png' })
  const formData = toPackFormData({
    name: 'Pantry Pack',
    price: 2500,
    is_active: true,
    items: ['Rice', 'Beans'],
    components: [{ product_id: 1, quantity_per_pack: 2 }],
    image_files: [{ file: upload, preview: 'blob:preview' }],
  })

  assert.equal(formData.get('name'), 'Pantry Pack')
  assert.deepEqual(JSON.parse(formData.get('items')), ['Rice', 'Beans'])
  assert.deepEqual(JSON.parse(formData.get('components')), [{ product_id: 1, quantity_per_pack: 2 }])
  assert.equal(formData.get('image').type, 'image/png')
  assert.equal(formData.has('images'), false)
})

test('partial paginated lists cannot become business-wide inventory or rider metrics', () => {
  assert.deepEqual(normalizeDashboardListResponse({ products: [{ id: 1 }], total: 105 }, ['products']), { available: false, data: null })
  assert.deepEqual(normalizeDashboardListResponse({ data: [{ id: 1 }], pagination: { total: 2 } }), { available: false, data: null })
  assert.deepEqual(normalizeDashboardListResponse({ products: [], total: 0 }, ['products']), { available: true, data: [] })
})

test('approved KYC does not turn a suspended or inactive rider into available capacity', () => {
  const summary = buildSmartOperationsSummaryFromAggregates({ riders: [
    { kyc_status: 'approved', status: 'INACTIVE', availability: 'ONLINE' },
    { kyc_status: 'approved', status: 'SUSPENDED', availability: 'BUSY' },
    { kyc_status: 'approved', status: 'ACTIVE', availability: 'ONLINE' },
  ] })
  assert.equal(summary.riders.total, 1)
  assert.equal(summary.riders.available, 1)
  assert.equal(summary.riders.busy, 0)
})
