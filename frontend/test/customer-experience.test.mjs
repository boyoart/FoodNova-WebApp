import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { authReturnPath, saveCheckoutDraft, readCheckoutDraft, checkoutRequestKey, clearCheckoutDraft } from '../src/utils/checkoutFlow.js'

test('authentication return targets are allowlisted and checkout survives login/register transitions', () => {
  assert.equal(authReturnPath('/checkout'), '/checkout')
  assert.equal(authReturnPath('/track-order'), '/track-order')
  assert.equal(authReturnPath('https://evil.example/checkout'), '/')
  assert.equal(authReturnPath('//evil.example'), '/')
  assert.equal(authReturnPath('/admin/dashboard'), '/')
  const draft = { deliveryMethod: 'delivery', saveNewAddress: false, makeDefaultAddress: false, formData: { delivery_notes: 'Test note' }, manualAddress: { address_line: 'Test street' } }
  saveCheckoutDraft(draft)
  assert.deepEqual(readCheckoutDraft(), draft)
  const key = checkoutRequestKey()
  assert.equal(checkoutRequestKey(), key)
  clearCheckoutDraft()
  assert.equal(readCheckoutDraft(), null)
  assert.notEqual(checkoutRequestKey(), key)
})

test('existing cart quantities survive authentication and checkout draft clearing', async () => {
  const values = new Map()
  globalThis.localStorage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) }
  const { useCartStore } = await import('../src/store/cartStore.js')
  const { useAuthStore } = await import('../src/store/authStore.js')
  useCartStore.getState().addItem({ id: 6, price: 100, quantity: 3, is_available: true })
  useAuthStore.getState().login({ id: 5, email_verification_required: true }, 'unit-test-session')
  assert.equal(useCartStore.getState().items[0].quantity, 3)
  saveCheckoutDraft({ ownerId: 5, manualAddress: { address_line: 'Private test draft' } })
  useAuthStore.getState().expireCustomerSession()
  useAuthStore.getState().login({ id: 5 }, 're-authenticated-unit-session')
  assert.equal(readCheckoutDraft().ownerId, 5)
  useAuthStore.getState().login({ id: 6 }, 'different-unit-session')
  assert.equal(readCheckoutDraft(), null)
  clearCheckoutDraft()
  assert.equal(useCartStore.getState().getTotalPrice(), 300)
  useAuthStore.getState().logout()
  assert.equal(useCartStore.getState().items[0].quantity, 3)
})

test('dedicated tracking uses existing secure services and handles legacy email URLs', async () => {
  const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')
  const app = await read('../src/App.jsx')
  const widget = await read('../src/components/OrderTracking.jsx')
  const page = await read('../src/pages/TrackOrderPage.jsx')
  assert.match(app, /path="\/track-order"/)
  assert.match(widget, /trackingAPI\.lookup/); assert.match(widget, /trackingAPI\.progress/)
  assert.match(widget, /className="tracking-shortcut" to="\/track-order"/)
  assert.doesNotMatch(widget, /role="dialog"/)
  assert.match(page, /location.hash/); assert.match(page, /Navigate to="\/track-order" replace/)
  assert.match(page, /OrderHistoryPage/)
})

test('checkout and account screens expose verification, submission and destructive-action protections', async () => {
  const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')
  const checkout = await read('../src/pages/CheckoutPage.jsx')
  for (const expression of [/submitting.current/, /idempotency_key: checkoutRequestKey/, /from: '\/checkout'/, /EmailVerificationNotice/, /readCheckoutDraft/]) assert.match(checkout, expression)
  const signup = await read('../src/pages/RegisterPage.jsx')
  assert.match(signup, /authReturnPath\(location.state\?\.from/)
  const admin = await read('../src/pages/AdminCustomers.jsx')
  for (const expression of [/superAdmin/, /confirmation/, /minLength=\{8\}/, /account_status/, /verification/, /page_size: 20/]) assert.match(admin, expression)
  assert.doesNotMatch(admin, /buildCustomersFromOrders|orders fallback/)
  const flow = await read('../src/utils/checkoutFlow.js')
  assert.doesNotMatch(flow, /sessionStorage|localStorage/)
})
