import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  buildPaginationItems,
  CATALOG_PAGE_SIZE,
  displayVariantsFor,
  displayedPriceFor,
  selectedVariantFor,
  updateCatalogQuery,
} from '../src/pages/productsCatalog.js'

const source = await readFile(new URL('../src/pages/ProductsPage.jsx', import.meta.url), 'utf8')
const styles = await readFile(new URL('../src/pages/ProductsPage.css', import.meta.url), 'utf8')

test('variant states use readable high-contrast backgrounds', () => {
  assert.match(styles, /\.variant-option\s*\{[^}]*background:\s*#10324a;[^}]*color:\s*#f8fafc;/s)
  assert.match(styles, /\.variant-option\.selected,[^{]*\{[^}]*background:\s*#087a34;[^}]*color:\s*#fff;/s)
  assert.match(styles, /\.variant-option:disabled\s*\{[^}]*background:\s*#334155;[^}]*color:\s*#e2e8f0;/s)
})

test('details and sizes are local semantic tabs and details start collapsed', () => {
  assert.match(source, /role="tablist" aria-label=\{`\$\{item\.name\} information`\}/)
  assert.match(source, /role="tabpanel"/)
  assert.match(source, /openSections\[cardKey\] \|\| ''/)
  assert.match(source, /openSection === 'details'/)
  assert.match(source, /openSection === 'sizes' && variants\.length > 0/)
})

test('products without variants do not render a Sizes tab', () => {
  assert.match(source, /\{variants\.length > 0 && \(\s*<button[\s\S]*?>\s*Sizes\s*<\/button>/)
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
})

test('customer cards expose status only and disable unavailable purchases', () => {
  assert.doesNotMatch(source, /stock_qty|remaining|available units|\bstock:\s*\{/i)
  assert.match(source, /<span className="in-stock">In stock<\/span>/)
  assert.match(source, /<span className="out-of-stock-text">Out of stock<\/span>/)
  assert.match(source, /className="btn-add"[\s\S]*?disabled=\{unavailable\}/)
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
