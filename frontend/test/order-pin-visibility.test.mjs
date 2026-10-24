import assert from 'node:assert/strict'
import test from 'node:test'
import {
  customerVisibleOrderPin,
  pickupOrderReadyForPin,
} from '../src/utils/orderPinVisibility.js'

test('pickup PIN is visible only after payment confirmation and readiness', () => {
  const ready = {
    delivery_method: 'pickup',
    payment_status: 'payment_confirmed',
    order_status: 'ready_for_pickup',
    pickup_pin: '8471',
  }
  assert.equal(customerVisibleOrderPin(ready), '8471')
  assert.equal(customerVisibleOrderPin({ ...ready, payment_status: 'pending_payment' }), '')
  assert.equal(customerVisibleOrderPin({ ...ready, order_status: 'preparing' }), '')
  assert.equal(customerVisibleOrderPin({ ...ready, fulfillment_status: 'picked_up_by_customer' }), '')
  assert.equal(pickupOrderReadyForPin(ready), true)
  assert.equal(customerVisibleOrderPin({
    ...ready,
    delivery_code_created_at: '2020-01-01T00:00:00Z',
  }), '')
})

test('delivery PIN is visible only at canonical rider arrival', () => {
  const arrived = {
    delivery_method: 'delivery',
    payment_status: 'payment_confirmed',
    dispatch_status: 'ARRIVED',
    delivery_pin: '1604',
  }
  assert.equal(customerVisibleOrderPin(arrived), '1604')
  assert.equal(customerVisibleOrderPin({ ...arrived, dispatch_status: 'IN_TRANSIT' }), '')
  assert.equal(customerVisibleOrderPin({ ...arrived, payment_status: 'pending_payment' }), '')
})
