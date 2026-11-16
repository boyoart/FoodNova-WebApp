import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { adminTools, isAdminToolAllowed } from '../src/pages/adminNavigation.js'

const layout = await readFile(new URL('../src/pages/AdminLayout.jsx', import.meta.url), 'utf8')
const layoutStyles = await readFile(new URL('../src/pages/AdminLayout.css', import.meta.url), 'utf8')
const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8')
const dashboard = await readFile(new URL('../src/pages/AdminDashboard.jsx', import.meta.url), 'utf8')
const api = await readFile(new URL('../src/services/api.js', import.meta.url), 'utf8')
const reports = await readFile(new URL('../src/pages/AdminExpansion.jsx', import.meta.url), 'utf8')
const stock = await readFile(new URL('../src/pages/AdminStock.jsx', import.meta.url), 'utf8')

test('Admin navigation reuses existing modules and honors permission alternatives', () => {
  assert.ok(adminTools.some((tool) => tool.path === '/admin/orders'))
  assert.ok(adminTools.some((tool) => tool.path === '/admin/stock'))
  assert.equal(isAdminToolAllowed(adminTools.find((tool) => tool.path === '/admin/orders'), (permission) => permission === 'orders:view'), true)
  assert.equal(isAdminToolAllowed(adminTools.find((tool) => tool.path === '/admin/orders'), () => false), false)
  assert.equal(isAdminToolAllowed(adminTools.find((tool) => tool.path === '/admin/categories'), (permission) => permission === 'stock:view'), true)
  assert.equal(isAdminToolAllowed(adminTools.find((tool) => tool.path === '/admin/payments'), (permission) => permission === 'payments:approve'), true)
  assert.equal(isAdminToolAllowed(adminTools.find((tool) => tool.path === '/admin/users'), (permission) => permission === 'admins:manage'), true)
  assert.match(layout, /activeTool && !isAdminToolAllowed\(activeTool, can\)/)
})

test('Admin routes render inside the private shell instead of customer chrome', () => {
  assert.match(app, /location\.pathname\.startsWith\('\/admin'\)/)
  assert.match(app, /<Route path="\/admin" element=\{<AdminLayout \/>\}>/)
  assert.equal((app.match(/<Route path="\/admin\/login"/g) || []).length, 1)
  assert.match(app, /!isAdminRoute && <Navbar \/>/)
  assert.match(app, /!isAdminRoute && <Footer \/>/)
})

test('Admin shell collapses on tablet and provides a mobile drawer', () => {
  assert.match(layout, /aria-label="Open navigation"/)
  assert.match(layout, /collapsed \? 'Expand sidebar' : 'Collapse sidebar'/)
  assert.match(layoutStyles, /@media \(max-width: 860px\)/)
  assert.match(layoutStyles, /\.admin-sidebar\.is-mobile-open/)
  assert.match(layoutStyles, /prefers-reduced-motion/)
})

test('Dashboard metrics are permission-scoped and request failures do not become zeroes', () => {
  assert.match(dashboard, /includeOrders: canViewOrders, includeProducts: canViewStock/)
  assert.match(dashboard, /Dashboard services are unavailable/)
  assert.match(dashboard, /normalizeSmartOperations\(stats\?\.smart_operations\)/)
  assert.match(dashboard, /metricPrice\(smartOperations\.revenue\.average\)/)
  assert.match(dashboard, /Some dashboard metrics are unavailable/)
  assert.match(dashboard, /Recent Orders/)
  assert.match(dashboard, /Order Status/)
  assert.match(dashboard, /Order Attention/)
  assert.match(dashboard, /setTimeout\(poll, 30000\)/)
  assert.match(dashboard, /document\.hidden/)
  assert.match(dashboard, /controller\.abort\(\)/)
  assert.match(dashboard, /Financial snapshot/)
  assert.match(dashboard, /Stock Alerts/)
  assert.doesNotMatch(dashboard, /stats\?\.[a-z_]+ \|\| 0/)
  assert.match(api, /getDashboardStats: async \(\{ includeOrders = true, includeProducts = true, includeDispatch = false, signal \} = \{\}\)/)
  assert.match(api, /api\.get\('\/admin\/reports\/summary', \{ signal, timeout: 20000 \}\)/)
  assert.match(api, /buildSmartOperationsSummaryFromAggregates/)
  assert.doesNotMatch(api, /Using fallback/)
})

test('Combo Pack image uploads use the field accepted by the existing backend endpoint', async () => {
  const packFormData = await readFile(new URL('../src/utils/adminPackFormData.js', import.meta.url), 'utf8')
  assert.match(api, /createPack: async \(payload\) => .*toPackFormData\(payload\)/)
  assert.match(api, /updatePack: async \(id, payload\) => .*toPackFormData\(payload\)/)
  assert.match(packFormData, /formData\.append\('image', image\)/)
  assert.doesNotMatch(packFormData, /append\('images'/)
  assert.match(stock, /currentPackImage &&/)
  assert.match(stock, /available_combo_quantity/)
  assert.match(stock, /Check component stock\/configuration/)
})

test('Reports distinguish unavailable financial metrics from genuine zero values', () => {
  assert.match(reports, /reportPrice\(summary\.gross_collected_revenue \?\? summary\.confirmed_revenue\)/)
  assert.match(reports, /reportPrice\(summary\.net_revenue\)/)
  assert.match(reports, /reportCount\(summary\.pending_payments\)/)
  assert.match(reports, /summary\.refund_adjustment_orders > 0/)
  assert.doesNotMatch(reports, /formatPrice\(summary\.confirmed_revenue \|\| 0\)/)
})