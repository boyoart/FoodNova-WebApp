import assert from 'node:assert/strict'
import test from 'node:test'
import {
  adminOrderStatusOptions,
  apiErrorMessage,
  canonicalOrderStatus,
  orderStatusLabel,
  pickupTimelineSteps,
} from '../src/utils/orderStatusModel.js'

const pickup = (overrides = {}) => ({
  delivery_method: 'pickup',
  payment_status: 'payment_confirmed',
  status: 'preparing',
  order_status: 'preparing',
  fulfillment_status: 'preparing',
  ...overrides,
})
const done = (steps) => steps.filter((step) => step.completed).map((step) => step.label)
const DELIVERY_OPTIONS = [{ value: 'processing', label: 'Processing' }]

test('pickup timeline follows the canonical backend lifecycle', () => {
  const labels = pickupTimelineSteps(pickup(), true).map((step) => step.label)
  assert.deepEqual(labels, ['Order Placed', 'Payment Confirmed', 'Preparing Order', 'Ready for Pickup', 'Picked Up'])
  assert.deepEqual(done(pickupTimelineSteps(pickup(), true)), ['Order Placed', 'Payment Confirmed', 'Preparing Order'])
  const ready = pickup({ status: 'ready_for_pickup', order_status: 'ready_for_pickup', fulfillment_status: 'ready_for_pickup' })
  assert.equal(done(pickupTimelineSteps(ready, true)).at(-1), 'Ready for Pickup')
})

test('verified pickup advances the timeline to Picked Up and survives a refresh', () => {
  const collected = pickup({
    status: 'picked_up_by_customer',
    order_status: 'picked_up_by_customer',
    fulfillment_status: 'picked_up_by_customer',
  })
  assert.equal(canonicalOrderStatus(collected), 'picked_up_by_customer')
  assert.equal(orderStatusLabel(canonicalOrderStatus(collected)), 'Picked Up')
  assert.equal(done(pickupTimelineSteps(collected, true)).length, 5)
  const reloaded = JSON.parse(JSON.stringify(collected))
  assert.equal(done(pickupTimelineSteps(reloaded, true)).length, 5)
  assert.equal(canonicalOrderStatus({ ...collected, order_status: 'ready_for_pickup' }), 'picked_up_by_customer')
})

test('pickup timeline never shows rider or delivery steps', () => {
  const labels = pickupTimelineSteps(pickup(), true).map((step) => step.label).join(' ')
  assert.doesNotMatch(labels, /Rider|Delivery|Delivered/)
})

test('incorrect-PIN state leaves a ready pickup at Ready for Pickup', () => {
  const ready = pickup({ status: 'ready_for_pickup', order_status: 'ready_for_pickup', fulfillment_status: 'ready_for_pickup' })
  assert.equal(canonicalOrderStatus(ready), 'ready_for_pickup')
  assert.equal(done(pickupTimelineSteps(ready, true)).includes('Picked Up'), false)
})

test('admin pickup options only offer transitions the backend permits', () => {
  const values = (order) => adminOrderStatusOptions(order, DELIVERY_OPTIONS).map((option) => option.value)
  assert.deepEqual(values(pickup()), ['preparing', 'ready_for_pickup', 'cancelled'])
  assert.deepEqual(values(pickup({ status: 'payment_confirmed', order_status: 'payment_confirmed', fulfillment_status: 'payment_confirmed' })).includes('processing'), false)
  const ready = pickup({ status: 'ready_for_pickup', order_status: 'ready_for_pickup', fulfillment_status: 'ready_for_pickup' })
  assert.deepEqual(values(ready), ['ready_for_pickup', 'cancelled'])
  const collected = pickup({ status: 'picked_up_by_customer', order_status: 'picked_up_by_customer', fulfillment_status: 'picked_up_by_customer' })
  assert.deepEqual(values(collected), ['picked_up_by_customer'])
})

test('delivery options and timeline semantics are unchanged', () => {
  const delivery = { delivery_method: 'delivery', order_status: 'out_for_delivery' }
  assert.deepEqual(adminOrderStatusOptions(delivery, DELIVERY_OPTIONS), DELIVERY_OPTIONS)
  assert.equal(canonicalOrderStatus(delivery), 'out_for_delivery')
  assert.equal(canonicalOrderStatus({ delivery_method: 'delivery', order_status: 'picked_up_by_customer' }), 'picked_up_by_customer')
})

test('backend error details are surfaced to the admin', () => {
  assert.equal(
    apiErrorMessage({ response: { data: { detail: 'Invalid pickup transition from PREPARING to PICKED_UP' } } }, 'fallback'),
    'Invalid pickup transition from PREPARING to PICKED_UP',
  )
  assert.equal(apiErrorMessage({ response: { data: { detail: [{ msg: 'bad value' }] } } }, 'fallback'), 'bad value')
  assert.equal(apiErrorMessage({}, 'fallback'), 'fallback')
})
