import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { basketTotal, customerOrdersLink, nextSuggestionIndex, ownedCustomerData, prepareCartItem, productLink, readViewedIds, rebuildSelection, rememberProduct, revalidateSelection, sameBasket, searchOptions } from '../src/utils/shopping.js'

const product = {
  id: 6, name: 'Foreign Rice', is_active: true, is_available: true, price: 2400,
  variants: [{ id: 11, weight: '1kg', price: 2400, is_active: true, is_available: true }, { id: 12, weight: '2kg', price: 4000, is_active: true, is_available: true }],
}
const pack = { id: 3, name: 'Gift Combo', price: 18000, is_active: true, is_available: true, components: [{ name: 'Rice', quantity_per_pack: 2, unit: 'kg' }] }
const memory = () => {
  const data = new Map()
  return { getItem: (key) => data.get(key) || null, setItem: (key, value) => data.set(key, value), removeItem: (key) => data.delete(key) }
}

test('basket uses selected current variant price, quantity and the existing cart identity', () => {
  const line = prepareCartItem(product, 12, 3)
  assert.equal(line.price, 4000)
  assert.equal(line.quantity, 3)
  assert.equal(line.product_id, 6)
  assert.equal(line.variant_id, 12)
  assert.equal(line.cart_key, 'product-6-12')
  assert.equal(line.name, 'Foreign Rice - 2kg')
  assert.equal(basketTotal([line]), 12000)
  assert.equal(basketTotal([{ price: .1, quantity: 3 }, { price: .2, quantity: 1 }]), .5)
})

test('invalid quantities, stale variants, archived parents and unknown prices fail before insertion', () => {
  for (const quantity of [0, -1, 1.5, '', 'abc', 100]) assert.throws(() => prepareCartItem(product, 11, quantity))
  assert.throws(() => prepareCartItem(product, 99, 1), /current size/)
  assert.throws(() => prepareCartItem({ ...product, is_active: false }, 11, 1))
  assert.throws(() => prepareCartItem({ ...product, variants: [{ ...product.variants[0], price: null }] }, 11, 1), /price/)
  assert.throws(() => prepareCartItem({ id: 9, name: 'Unknown', price: 50 }, null, 1), /catalogue/)
  assert.equal(prepareCartItem({ id: 9, price: 0, is_available: true }, null, 1).price, 0)
})

test('unfulfillable packs use neutral enquiry and active packs stay in comparison data', () => {
  const current = [pack, { ...pack, id: 4, is_available: false }]
  assert.equal(current.filter((item) => item.is_active).length, 2)
  assert.throws(() => prepareCartItem(current[1], null, 1, 'pack'), /enquire/)
  assert.throws(() => prepareCartItem({ ...pack, components: [] }, null, 1, 'pack'), /enquire/)
  const line = prepareCartItem(pack, null, 1, 'pack')
  assert.equal(line.cart_key, 'pack-3')
  assert.equal(line.type, 'pack')
})

test('fresh basket validation deduplicates per-product reads and never trusts previous order prices', async () => {
  let requests = 0
  const current = { ...product, variants: product.variants.map((variant) => ({ ...variant, price: variant.price + 100 })) }
  const lines = await revalidateSelection([{ id: 6, variantId: 11, quantity: 2 }, { id: 6, variantId: 12, quantity: 1 }], {
    getProduct: async (id) => { assert.equal(id, 6); requests++; return { data: { product: current } } },
  })
  assert.equal(requests, 1)
  assert.deepEqual(lines.map((item) => item.price), [2500, 4100])
  assert.equal(basketTotal(lines), 9100)
  assert.equal(sameBasket(lines, lines.map((line) => ({ ...line, price: line.price + 1 }))), false)
})

test('failed revalidation cannot produce a partially validated basket', async () => {
  await assert.rejects(revalidateSelection([{ id: 6, variantId: 11, quantity: 1 }, { id: 7, quantity: 1 }], {
    getProduct: async (id) => id === 6 ? product : { id: 7, name: 'Beans', price: 200, is_available: false },
  }), /cannot currently be added/)
})

test('buy again resolves inventory identifiers and retains pack versus product semantics', () => {
  assert.deepEqual(rebuildSelection([{ id: 999, product_id: 6, variant_id: 12, quantity: 2, price: 1 }, { id: 1000, pack_id: 3, item_type: 'pack', quantity: 1 }]), [
    { id: 6, type: 'product', variantId: 12, quantity: 2 }, { id: 3, type: 'pack', variantId: undefined, quantity: 1 },
  ])
  assert.throws(() => rebuildSelection([{ id: 999, name: 'Legacy order item' }]), /cannot be identified/)
})

test('customer tracking routes do not expose an order-ID or anonymous lookup', () => {
  assert.equal(customerOrdersLink(false), '/login')
  assert.equal(customerOrdersLink(true), '/orders')
  assert.deepEqual(ownedCustomerData({ owner: 'customer-a', items: [{ id: 123 }] }, 'customer-b', []), [])
  assert.deepEqual(ownedCustomerData({ owner: '', items: [{ id: 123 }] }, '', []), [])
  assert.deepEqual(ownedCustomerData({ owner: 'customer-a', items: [{ id: 123 }] }, 'customer-a', []), [{ id: 123 }])
})

test('recently viewed stores only capped numeric product identifiers and tolerates denied storage', () => {
  const storage = memory()
  for (let id = 1; id <= 12; id++) rememberProduct(id, storage)
  rememberProduct(9, storage)
  assert.deepEqual(readViewedIds(storage), [9, 12, 11, 10, 8, 7, 6, 5])
  storage.setItem('foodnova_viewed_products', JSON.stringify([1, { email: 'private@example.com' }, 'secret', -1, 1]))
  assert.deepEqual(readViewedIds(storage), [1])
  assert.doesNotThrow(() => rememberProduct(1, { getItem() { throw new Error('Denied') }, setItem() { throw new Error('Denied') } }))
})

test('search suggestions expose public product/category links with keyboard wraparound', () => {
  const suggestions = searchOptions([{ ...product, category: 'Food Staples' }, { ...product, id: 10, is_active: false }, {}])
  assert.equal(suggestions.length, 2)
  assert.equal(suggestions[0].price, 2400)
  assert.equal(suggestions[0].to, productLink(6))
  assert.equal(suggestions[1].to, '/products?category=Food%20Staples')
  assert.equal(suggestions[1].id.includes(' '), false)
  assert.equal(nextSuggestionIndex(-1, 'ArrowUp', 3), 2)
  assert.equal(nextSuggestionIndex(-1, 'ArrowDown', 3), 0)
  assert.equal(nextSuggestionIndex(2, 'ArrowDown', 3), 0)
  assert.equal(nextSuggestionIndex(0, 'ArrowUp', 3), 2)
})

test('validated lines merge with the existing Zustand cart rather than creating a second cart', async () => {
  globalThis.localStorage = memory()
  const { useCartStore } = await import('../src/store/cartStore.js')
  useCartStore.getState().clearCart()
  const line = prepareCartItem(product, 12, 2)
  useCartStore.getState().addItem(line)
  useCartStore.getState().addItem({ ...line, quantity: 1 })
  assert.equal(useCartStore.getState().items.length, 1)
  assert.equal(useCartStore.getState().items[0].quantity, 3)
  assert.equal(useCartStore.getState().getTotalPrice(), 12000)
  useCartStore.getState().clearCart()
})

test('yellow header uses transparent official artwork and shopping widgets preserve private API boundaries', async () => {
  const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')
  const css = await read('../src/components/Navbar.css')
  const widgets = await read('../src/components/ShoppingWidgets.jsx')
  const search = await read('../src/components/ProductSearch.jsx')
  const gap = await read('../../STOREFRONT_WIDGETS.md')
  assert.match(css, /background: #FFCC16/)
  assert.match(css, /\.navbar \.brand-logo-surface \{ background: transparent; border: 0;/)
  assert.match(css, /#075338/)
  assert.match(css, /#0B8754/)
  assert.match(widgets, /ordersAPI\.getCustomerOrders\(\)/)
  assert.match(widgets, /if \(!customer\) return/)
  assert.match(widgets, /identityRef\.current !== session/)
  assert.doesNotMatch(widgets, /localStorage|\/admin\/|ordersAPI\.getById|stock_qty|out of stock|low stock/i)
  assert.match(widgets, /revalidateSelection/)
  assert.match(search, /role="combobox"/)
  assert.match(search, /250\)/)
  assert.match(gap, /coverage checker is deferred/)
  assert.match(gap, /No reliable public address-validation/)
})
