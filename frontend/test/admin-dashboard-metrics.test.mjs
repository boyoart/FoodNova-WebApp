import assert from 'node:assert/strict'
import test from 'node:test'
import { summarizeDashboardOrders, summarizeDashboardProducts, summarizeBusinessIntelligence, buildSmartOperationsSummary } from '../src/utils/adminDashboardMetrics.js'

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
  assert.equal(summary.rider_utilization, 67)
  assert.equal(summary.low_stock_items, 1)
  assert.equal(summary.out_of_stock_items, 1)
  assert.deepEqual(summary.alerts.map(({ type }) => type), ['payment_review', 'inventory'])
  assert.equal(summary.operational_health.score, 70)
  assert.deepEqual(summary.operational_health.label, 'Watchlist')

  const smart = buildSmartOperationsSummary({
    orders: summary.orders,
    products: summary.products,
    riders: summary.riders,
  })

  assert.equal(smart.revenue.total, 3200)
  assert.equal(smart.inventory.low_stock, 1)
  assert.equal(smart.riders.available, 2)
  assert.equal(smart.alerts.length, 2)
})