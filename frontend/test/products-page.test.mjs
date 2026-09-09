import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  buildPaginationItems,
  CATALOG_PAGE_SIZE,
  displayVariantsFor,
  displayedPriceFor,
  galleryImagesFor,
  normalizeStoreItem,
  selectedVariantFor,
  updateCatalogQuery,
} from '../src/pages/productsCatalog.js'

const source = await readFile(new URL('../src/pages/ProductsPage.jsx', import.meta.url), 'utf8')
const styles = await readFile(new URL('../src/pages/ProductsPage.css', import.meta.url), 'utf8')
const adminSource = await readFile(new URL('../src/pages/AdminStock.jsx', import.meta.url), 'utf8')
const apiSource = await readFile(new URL('../src/services/api.js', import.meta.url), 'utf8')

test('variant states use readable high-contrast backgrounds', () => {
  assert.match(styles, /\.variant-option\s*\{[^}]*background:\s*#10324a;[^}]*color:\s*#f8fafc;/s)
  assert.match(styles, /\.variant-option\.selected,[^{]*\{[^}]*background:\s*#087a34;[^}]*color:\s*#fff;/s)
  assert.match(styles, /\.variant-option:disabled\s*\{[^}]*background:\s*#334155;[^}]*color:\s*#e2e8f0;/s)
})

test('clicking a product opens a dismissible product details dialog', () => {
  assert.match(source, /onClick=\{\(event\) => \{[\s\S]*?openProductModal\(item\)/)
  assert.match(source, /role="dialog"/)
  assert.match(source, /aria-modal="true"/)
  assert.match(source, /aria-label="Close product details"/)
  assert.match(source, /event\.key === 'Escape'/)
})

test('details and sizes are local semantic modal tabs', () => {
  assert.match(source, /role="tablist" aria-label=\{`\$\{modalItem\.name\} information`\}/)
  assert.match(source, /role="tabpanel"/)
  assert.match(source, /useState\('details'\)/)
  assert.match(source, /modalTab === 'details'/)
  assert.match(source, /modalTab === 'sizes' && modalVariants\.length > 0/)
})

test('products without variants do not render a Sizes tab', () => {
  assert.match(source, /\{modalVariants\.length > 0 && \(\s*<button[\s\S]*?>\s*Sizes\s*<\/button>/)
  assert.deepEqual(displayVariantsFor({ variants: [{ id: 1, weight: '', label: 'FN-CUSTARD' }] }), [])
  assert.equal(displayVariantsFor({ variants: [{ id: 1, weight: '2kg' }] }).length, 1)
})

test('selected available variant becomes the authoritative displayed price', () => {
  const product = {
    id: 1,
    price: 100,
    variants: [
      { id: 11, price: 1700, is_available: true },
      { id: 12, price: 3500, is_available: true },
    ],
  }
  assert.equal(displayedPriceFor(product, {}), 1700)
  assert.equal(displayedPriceFor(product, { 1: product.variants[1] }), 3500)
  assert.equal(selectedVariantFor(product, { 1: { id: 99, price: 1, is_available: true } }).id, 11)
  assert.equal(selectedVariantFor(product, { 1: { id: 12, price: 1, is_available: true } }).price, 3500)
})

test('customer cards expose status only and disable unavailable purchases', () => {
  assert.doesNotMatch(source, /stock_qty|remaining|available units|\bstock:\s*\{/i)
  assert.match(source, /<span className="in-stock">In stock<\/span>/)
  assert.match(source, /<span className="out-of-stock-text">Out of stock<\/span>/)
  assert.match(source, /className="btn-add"[\s\S]*?disabled=\{unavailable\}/)
})

test('gallery uses existing parent and variant images without duplicates', () => {
  assert.deepEqual(galleryImagesFor({
    image_url: '/rice.jpg',
    variants: [
      { image_url: '/rice.jpg' },
      { image_url: '/rice-2kg.jpg' },
    ],
  }), ['/rice.jpg', '/rice-2kg.jpg'])
  assert.match(source, /className="product-thumbnails"/)
  assert.match(source, /setModalImage\(image\)/)
})

test('modal cart submission carries selected variant and quantity', () => {
  assert.match(source, /selectedVariant: modalSelectedVariant/)
  assert.match(source, /quantity: modalQuantity/)
  assert.match(source, /variant_id: selected\?\.id/)
  assert.match(source, /disabled=\{modalOutOfStock\}/)
})

test('archived items are unavailable even if stale UI state still has them', () => {
  const archived = normalizeStoreItem({ id: 8, is_active: false, is_available: true, price: 10 })
  assert.equal(archived.is_available, false)
  assert.equal(archived.is_out_of_stock, true)
  assert.match(source, /error\?\.response\?\.status === 404/)
  assert.match(source, /This product is no longer available in the active catalog/)
})

test('modal is responsive and becomes a near-full-screen mobile sheet', () => {
  assert.match(styles, /\.product-modal\s*\{[^}]*grid-template-columns:[^;}]*;/s)
  assert.match(styles, /@media \(max-width: 720px\)[\s\S]*\.product-modal\s*\{[^}]*max-height:\s*96vh;[^}]*grid-template-columns:\s*1fr;/s)
})

test('Admin can distinguish and restore archived products', () => {
  assert.match(adminSource, />Archived \(\{archivedProducts\.length\}\)</)
  assert.match(adminSource, /handleRestore\(item\.id\)/)
  assert.match(apiSource, /restoreProduct: async \(id\).*\/restore/)
})

test('catalog page size is ten and compact page ranges retain boundaries', () => {
  assert.equal(CATALOG_PAGE_SIZE, 10)
  assert.deepEqual(buildPaginationItems(1, 3), [1, 2, 3])
  assert.deepEqual(buildPaginationItems(10, 20), [1, 'ellipsis-9', 9, 10, 11, 'ellipsis-20', 20])
})

test('pagination includes working previous and next controls', () => {
  assert.match(source, /goToPage\(page - 1\)/)
  assert.match(source, /goToPage\(page \+ 1\)/)
  assert.match(source, /aria-current=\{item === page \? 'page' : undefined\}/)
})

test('mobile pagination switches to the compact page summary', () => {
  assert.match(source, /className="pagination-summary"[^>]*>\{page\} \/ \{pagination\.total_pages\}/)
  assert.match(styles, /@media \(max-width: 720px\)[\s\S]*\.pagination-pages,[\s\S]*display: none;[\s\S]*\.pagination-summary,[\s\S]*display: inline;/)
})

test('query updates preserve search and category while paging', () => {
  const current = new URLSearchParams('search=rice&category=Food+Staples&page=2')
  const next = updateCatalogQuery(current, { page: 3 })
  assert.equal(next.get('search'), 'rice')
  assert.equal(next.get('category'), 'Food Staples')
  assert.equal(next.get('page'), '3')
})

test('changing category resets page one without losing search', () => {
  const current = new URLSearchParams('search=rice&category=Food+Staples&page=4')
  const next = updateCatalogQuery(current, { category: 'Rice', page: 1 })
  assert.equal(next.get('search'), 'rice')
  assert.equal(next.get('category'), 'Rice')
  assert.equal(next.has('page'), false)
})
