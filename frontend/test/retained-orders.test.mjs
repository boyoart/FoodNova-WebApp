import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { retentionErrorMessage } from '../src/utils/retentionErrors.js'

test('deletion errors identify exact blocking order and remedy', () => {
  const message = retentionErrorMessage({ response: { data: { detail: { message: 'Resolve obligations', blocking_orders: [{ order_id: 12, order_code: 'FN-012', reasons: ['refund_pending: process the refund'] }] } } } })
  assert.match(message, /FN-012/)
  assert.match(message, /process the refund/)
  assert.equal(retentionErrorMessage({ response: { data: { detail: 'Permission denied' } } }), 'Permission denied')
  assert.equal(retentionErrorMessage(null, 'Unavailable'), 'Unavailable')
})

test('archived removal uses authenticated existing API, role gate, reason and typed confirmation', () => {
  const page = readFileSync(new URL('../src/pages/AdminOrders.jsx', import.meta.url), 'utf8')
  const api = readFileSync(new URL('../src/services/api.js', import.meta.url), 'utf8')
  assert.match(page, /Remove permanently/)
  assert.match(page, /admin\?\.admin_role === 'super_admin'/)
  assert.match(page, /REMOVE ORDER \$\{order.id\}/)
  assert.match(page, /reason\.trim\(\)\.length < 8/)
  assert.match(api, /remove-permanently/)
  assert.match(page, /Financial.*retained/)
})
