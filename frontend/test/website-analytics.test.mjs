import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { createAnalytics, analyticsItems, readReportMetric } from '../src/utils/websiteAnalytics.js'
import { consumeTrackingToken, initialTrackingToken, startTrackingPolling, terminalTracking, trackingTimeline, validOrderNumber } from '../src/utils/orderTracking.js'

const setup = (extra = {}) => {
  const calls = [], scripts = [], stored = new Map()
  const win = { location: { pathname: '/', origin: 'https://www.foodnova.com.ng', hostname: 'www.foodnova.com.ng' }, navigator: {},
    gtag: (...args) => { calls.push(args); if (args[0] === 'get') args[3](args[2] === 'client_id' ? '123.456' : '789') } }
  const doc = { cookie: '', referrer: 'https://example.com/private?email=secret@example.com',
    querySelector: () => scripts[0], createElement: () => ({ dataset: {} }), head: { appendChild: (node) => scripts.push(node) } }
  const analytics = createAnalytics({ measurementId: 'G-TEST123', win, doc, storage: { getItem: (key) => stored.get(key), setItem: (key, val) => stored.set(key, val) }, ...extra })
  return { analytics, calls, scripts, win, doc }
}

test('missing or malformed reporting metrics stay unavailable while successful empty reports are zero', () => {
  assert.equal(readReportMetric(null, 'sessions'), null)
  assert.equal(readReportMetric({ reports: { totals: { status: 'available' } } }, 'sessions'), null)
  assert.equal(readReportMetric({ reports: { totals: { status: 'available', rows: [{}] } } }, 'sessions'), null)
  assert.equal(readReportMetric({ reports: { totals: { status: 'available', rows: [{ sessions: '' }] } } }, 'sessions'), null)
  assert.equal(readReportMetric({ reports: { totals: { status: 'available', rows: [] } } }, 'sessions'), 0)
  assert.equal(readReportMetric({ reports: { totals: { status: 'available', rows: [{ sessions: 42 }] } } }, 'sessions'), 42)
})

test('GA4 is absent before opt-in, rejects invalid IDs, initializes one script after consent', () => {
  const { analytics, calls, scripts } = setup()
  analytics.initialize(); analytics.page('/'); analytics.commerce('add_to_cart', [{ id: 1, price: 5 }])
  assert.equal(scripts.length, 0); assert.equal(calls.length, 0)
  analytics.setConsent('granted'); analytics.initialize(); analytics.initialize()
  assert.equal(scripts.length, 1)
  assert.equal(calls.filter((x) => x[0] === 'config').length, 1)
  assert.equal(calls.find((x) => x[0] === 'config')[2].send_page_view, false)
  const invalid = setup({ measurementId: 'not-an-id' }); invalid.analytics.setConsent('granted')
  assert.equal(invalid.scripts.length, 0)
})

test('SPA page views deduplicate renders, remove URL/identity data and omit private routes', () => {
  const { analytics, calls, win } = setup()
  analytics.setConsent('granted')
  analytics.page('/'); analytics.page('/'); analytics.page('/products'); analytics.page('/orders'); analytics.page('/profile'); analytics.page('/products?email=secret@example.com'); analytics.page('/products')
  const views = calls.filter((x) => x[0] === 'event' && x[1] === 'page_view')
  assert.equal(views.length, 3)
  assert.equal(views[0][2].page_referrer, 'https://example.com/')
  assert.doesNotMatch(JSON.stringify(views), /secret@|private\?|\/orders|\/profile/)
  win.location.pathname = '/admin/dashboard'; analytics.page('/'); assert.equal(calls.filter((x) => x[0] === 'event').length, 3)
})

test('commerce and search send allowlisted data only, checkout render duplicates are suppressed', () => {
  const { analytics, calls } = setup(); analytics.setConsent('granted'); analytics.page('/checkout')
  const items = [{ id: 6, variant_id: 3, price: 10, quantity: 2, name: 'private name', customer_email: 'private@example.com' }]
  analytics.commerce('begin_checkout', items); analytics.commerce('begin_checkout', items)
  analytics.commerce('add_to_cart', items); analytics.commerce('purchase', items)
  analytics.viewItem(items[0]); analytics.viewItem(items[0]); analytics.viewItem(null); analytics.viewItem(items[0])
  analytics.page('/products'); analytics.viewItem(items[0])
  analytics.search('private@example.com'); analytics.search('private@example.com')
  const events = calls.filter((x) => x[0] === 'event')
  assert.equal(events.filter((x) => x[1] === 'begin_checkout').length, 1)
  assert.equal(events.filter((x) => x[1] === 'search').length, 1)
  assert.equal(events.filter((x) => x[1] === 'purchase').length, 0)
  assert.equal(events.filter((x) => x[1] === 'view_item').length, 3)
  assert.doesNotMatch(JSON.stringify(events), /private name|private@example|customer_email/)
  assert.deepEqual(analyticsItems([{ id: 1, price: NaN }, { id: 2, price: 3, quantity: -1 }]), [])
})

test('withdrawal and Global Privacy Control stop collection, expired preferences require consent', () => {
  const { analytics, calls, win } = setup(); analytics.setConsent('granted'); analytics.page('/')
  analytics.setConsent('denied'); const count = calls.length
  analytics.page('/products'); analytics.commerce('add_to_cart', [{ id: 1, price: 2 }])
  assert.equal(calls.length, count); assert.equal(win['ga-disable-G-TEST123'], true)
  const gpc = setup(); gpc.win.navigator.globalPrivacyControl = true; gpc.analytics.setConsent('granted')
  assert.equal(gpc.scripts.length, 0)
  const expired = setup({ storage: { getItem: () => JSON.stringify({ value: 'granted', at: 1 }) }, now: () => 999999999999 })
  assert.equal(expired.analytics.getConsent(), 'unknown')
})

test('purchase requests require consent and paid backend status; duplicate client renders do not repost', async () => {
  const { analytics, calls } = setup(); const sent = []
  const orders = [{ id: 1, payment_status: 'pending_payment' }, { id: 2, payment_status: 'payment_confirmed', customer_email: 'secret@example.com' }]
  const post = async (id, payload) => sent.push([id, payload])
  await analytics.purchases(orders, post); assert.equal(sent.length, 0)
  analytics.setConsent('granted'); await analytics.purchases(orders, post); await analytics.purchases(orders, post)
  assert.deepEqual(sent, [[2, { consent: true, client_id: '123.456', session_id: '789' }]])
  assert.equal(calls.some((x) => x[0] === 'event' && x[1] === 'purchase'), false)
})

test('tracking validates order numbers, consumes capabilities without storage and uses real status mappings', () => {
  assert.equal(validOrderNumber('FN-000123'), true); assert.equal(validOrderNumber('<script>'), false)
  const token = 'a'.repeat(43); let replacement
  assert.equal(consumeTrackingToken({ hash: '#track=' + token, pathname: '/orders', search: '' }, { replaceState: (_, __, url) => { replacement = url } }), token)
  assert.equal(replacement, '/orders')
  const pickup = { delivery_method: 'pickup', order_status: 'picked_up_by_customer' }
  assert.equal(terminalTracking(pickup), true); assert.equal(trackingTimeline(pickup).every((x) => x.completed), true)
  assert.deepEqual(trackingTimeline({ order_status: 'cancelled' }).map((x) => x.label), ['Order Placed', 'Cancelled'])
  assert.doesNotMatch(JSON.stringify(trackingTimeline({ order_status: 'processing' })), /Payment|PIN|GPS/)
})

test('StrictMode initialization keeps the in-memory capability after stripping the fragment once', () => {
  const original = globalThis.window
  const token = 'b'.repeat(43)
  let replacements = 0
  globalThis.window = { location: { hash: '#track=' + token, pathname: '/orders', search: '' }, history: { replaceState: () => { replacements++; globalThis.window.location.hash = '' } } }
  try { assert.equal(initialTrackingToken(), token); assert.equal(initialTrackingToken(), token); assert.equal(replacements, 1) }
  finally { globalThis.window = original }
})

test('tracking polling waits for each request, pauses hidden tabs and cancels requests on close', async () => {
  let callback, signal, cancelled = false, hidden = true, calls = 0, schedules = 0
  const cleanup = startTrackingPolling({ refresh: async (value) => { signal = value; calls++ }, hidden: () => hidden,
    schedule: (fn, ms) => { assert.equal(ms, 20000); callback = fn; schedules++; return 1 }, cancel: () => { cancelled = true } })
  await callback(); assert.equal(calls, 0)
  hidden = false; await callback(); assert.equal(calls, 1); assert.equal(schedules, 3)
  cleanup(); assert.equal(cancelled, true); assert.equal(signal.aborted, true)
  await callback(); assert.equal(calls, 1)
})

test('analytics routes and dedicated tracking preserve permission, navigation and privacy contracts', async () => {
  const read = async (path) => readFile(new URL(path, import.meta.url), 'utf8')
  const page = await read('../src/pages/AdminWebsiteAnalytics.jsx')
  assert.match(page, /reports:view/); assert.match(page, /No historical collection/); assert.match(page, /Unavailable/)
  const widget = await read('../src/components/OrderTracking.jsx')
  for (const pattern of [/to="\/track-order"/, /className="tracking-shortcut"/, /currentRequest.current\?\.abort/]) assert.match(widget, pattern)
  assert.doesNotMatch(widget, /role="dialog"|tracking-modal-layer/)
  assert.doesNotMatch(widget, /localStorage|sessionStorage|console\.log/)
  const html = await read('../index.html'); assert.match(html, /name="referrer" content="no-referrer"/)
})
