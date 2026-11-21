import assert from 'node:assert/strict'
import test from 'node:test'
import { handleOrderAudioStatus, isVerifiedOrderPayment } from '../src/utils/orderSuccessAudio.js'

const storageFixture = () => {
  const values = new Map()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  }
}

test('order confirmation plays only after backend payment verification and only once', () => {
  const storage = storageFixture()
  const played = []
  const play = (kind) => played.push(kind)
  const order = { id: 'audio-order-pending', payment_status: 'pending_payment', order_status: 'order_placed' }

  assert.equal(isVerifiedOrderPayment(order), false)
  assert.equal(handleOrderAudioStatus(order, { created: true, play, storage }), false)
  assert.equal(handleOrderAudioStatus({ ...order, payment_status: 'receipt_submitted' }, { play, storage }), false)
  assert.equal(played.length, 0)

  const confirmed = { ...order, payment_status: 'payment_confirmed' }
  assert.equal(isVerifiedOrderPayment(confirmed), true)
  assert.equal(handleOrderAudioStatus(confirmed, { play, storage }), true)
  assert.deepEqual(played, ['order'])

  assert.equal(handleOrderAudioStatus(confirmed, { play, storage }), false)
  assert.deepEqual(played, ['order'])
  assert.equal(JSON.parse(storage.getItem('foodnova_audio_completed_orders')).includes(order.id), true)
})

test('failed, pending, and cancelled orders never trigger completion audio', () => {
  const storage = storageFixture()
  const played = []
  const play = () => played.push('order')
  const base = { id: 'audio-order-failed', order_status: 'order_placed' }

  handleOrderAudioStatus({ ...base, payment_status: 'pending_payment' }, { created: true, play, storage })
  handleOrderAudioStatus({ ...base, payment_status: 'payment_rejected' }, { play, storage })
  handleOrderAudioStatus({ ...base, payment_status: 'payment_confirmed', order_status: 'cancelled' }, { play, storage })
  assert.equal(isVerifiedOrderPayment({ ...base, payment_status: 'pending_payment', status: 'paid' }), false)
  assert.deepEqual(played, [])
})

test('an already-confirmed create response is handled as an authoritative success', () => {
  const played = []
  const order = { id: 'audio-order-created-paid', payment_status: 'paid', order_status: 'order_placed' }

  assert.equal(handleOrderAudioStatus(order, { created: true, play: (kind) => played.push(kind), storage: storageFixture() }), true)
  assert.deepEqual(played, ['order'])
})
