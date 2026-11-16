import { normalizeStoreItem } from '../pages/productsCatalog.js'

export const productLink = (id) => `/products?product=${encodeURIComponent(id)}`
export const customerOrdersLink = (authenticated) => authenticated ? '/orders' : '/login'
export const ownedCustomerData = (state, identity, fallback) => identity && state.owner === identity ? state.items : fallback
export const nextSuggestionIndex = (index, key, count) => !count ? -1 : key === 'ArrowDown' ? (index + 1) % count : index < 0 ? count - 1 : (index - 1 + count) % count
export const unwrapItem = (response) => {
  const body = response?.data ?? response
  return body?.product || body?.pack || body?.data || body
}

export const prepareCartItem = (raw, variantId, quantity = 1, type = 'product') => {
  const item = normalizeStoreItem(raw, type)
  const count = Number(quantity)
  if (!Number.isInteger(count) || count < 1 || count > 99) throw new Error('Choose a whole quantity from 1 to 99.')
  const variant = item.variants.find((entry) => String(entry.id) === String(variantId))
  if (type === 'product' && item.variants.length && !variant) throw new Error(`Choose a current size for ${item.name}.`)
  const rawVariant = raw?.variants?.find((entry) => String(entry.id) === String(variantId))
  const inventory = rawVariant || raw
  const verified = inventory?.is_available === true || inventory?.stock_status === 'in_stock' || inventory?.is_out_of_stock === false || Number(inventory?.stock_qty ?? inventory?.stock) > 0
  if (!item.is_available || raw?.is_available === false || !verified || (variant && !variant.is_available)) throw new Error(type === 'pack' ? 'Please enquire with FoodNova about this pack.' : `${item.name} cannot currently be added. Please review the catalogue.`)
  const price = variant ? rawVariant?.price ?? rawVariant?.unit_price : raw?.price
  if (price === null || price === undefined || !Number.isFinite(Number(price)) || Number(price) < 0) throw new Error('The current price could not be verified.')
  const label = variant?.weight || ''
  return {
    ...item, id: item.id, product_id: item.id, type, item_type: type,
    variant_id: variant?.id, variant_weight: label, sku: variant?.sku || item.sku,
    name: label ? `${item.name} - ${label}` : item.name,
    price: Number(price), unit_price: Number(price), quantity: count, qty: count,
    cart_key: variant ? `product-${item.id}-${variant.id}` : `${type}-${item.id}`,
  }
}

export const basketTotal = (lines) => lines.reduce((sum, line) => sum + Math.round(line.price * 100) * line.quantity, 0) / 100
export const sameBasket = (before, after) => JSON.stringify(before.map((x) => [x.cart_key, x.price, x.quantity])) === JSON.stringify(after.map((x) => [x.cart_key, x.price, x.quantity]))

// Only catalogue identifiers are persisted, never orders, addresses or profiles.
export const readViewedIds = (storage) => {
  try {
    const values = JSON.parse(storage?.getItem('foodnova_viewed_products') || '[]')
    return Array.isArray(values) ? [...new Set(values.filter((id) => Number.isSafeInteger(id) && id > 0))].slice(0, 8) : []
  } catch { return [] }
}
export const rememberProduct = (id, storage) => {
  const value = Number(id)
  if (!Number.isSafeInteger(value) || value < 1) return
  try { storage?.setItem('foodnova_viewed_products', JSON.stringify([value, ...readViewedIds(storage).filter((entry) => entry !== value)].slice(0, 8))) } catch { /* Storage is optional. */ }
}

export const rebuildSelection = (items = []) => items.map((item) => {
  const type = item.item_type === 'pack' || item.type === 'pack' || item.pack_id ? 'pack' : 'product'
  const id = Number(type === 'pack' ? item.pack_id || item.product_id : item.product_id)
  if (!Number.isSafeInteger(id) || id < 1) throw new Error('Some older items cannot be identified. Please choose them from the catalogue.')
  return { id, type, variantId: item.variant_id, quantity: item.quantity ?? item.qty ?? 1 }
})

export const revalidateSelection = async (selections, { getProduct, getPack }) => {
  const requests = new Map()
  for (const row of selections) {
    const key = `${row.type || 'product'}-${row.id}`
    if (!requests.has(key)) requests.set(key, (row.type === 'pack' ? getPack : getProduct)(row.id))
  }
  const current = new Map(await Promise.all([...requests].map(async ([key, request]) => [key, unwrapItem(await request)])))
  return selections.map((row) => prepareCartItem(current.get(`${row.type || 'product'}-${row.id}`), row.variantId, row.quantity, row.type || 'product'))
}

export const searchOptions = (products) => {
  const options = products.filter((p) => p && Number.isSafeInteger(Number(p.id)) && Number(p.id) > 0 && typeof p.name === 'string' && p.is_active !== false && p.active !== false).slice(0, 6)
    .map((p) => ({ kind: 'product', id: `product-${p.id}`, name: p.name, image_url: p.image_url, price: p.price, to: productLink(p.id), category: p.category || p.category_name }))
  const categories = [...new Set(options.map((p) => p.category).filter(Boolean))].slice(0, 2)
  return [...options, ...categories.map((name) => ({ kind: 'category', id: `category-${encodeURIComponent(name)}`, name, to: `/products?category=${encodeURIComponent(name)}` }))]
}
