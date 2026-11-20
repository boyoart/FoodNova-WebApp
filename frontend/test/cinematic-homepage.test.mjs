import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { catalogueRows, curatedProducts, photographicImage, optimizeCataloguePhoto, categoryPhoto, itemPrice, reviewCinematicPurchase, productLink, packLink } from '../src/pages/cinematicCatalogue.js'

const product = (values = {}) => ({ id: 6, name: 'Foreign Rice', price: 2400, is_active: true, is_available: true, image_url: 'https://example.test/rice.png', category: 'Food Staples', variants: [{ id: 1, weight: '1kg', price: 2400, is_active: true, is_available: true }], ...values })

test('cinematic merchandising uses real active photo records without synthesizing products', () => {
  const rows = [product({ id: 1, name: 'Milk' }), product(), product({ id: 7, name: 'Honey Beans' }), product({ id: 9, is_active: false }), product({ id: 10, image_url: '/catalog/placeholder.png' }), product({ id: 11, image_url: '/catalog/rice.svg' })]
  const selected = curatedProducts(rows)
  assert.deepEqual(selected.map((p) => p.name), ['Foreign Rice', 'Honey Beans', 'Milk'])
  assert.equal(rows.length, 6)
  assert.equal(photographicImage({ image_url: '/placeholder.png' }), '')
})

test('API envelopes and category photographs keep catalogue identity and tolerate missing assets', () => {
  assert.deepEqual(catalogueRows({ data: { items: [product()] } }, 'products'), [product()])
  assert.deepEqual(catalogueRows({ data: [product()] }, 'categories'), [product()])
  assert.deepEqual(catalogueRows({}, 'products'), [])
  assert.equal(categoryPhoto({ name: 'Food Staples' }, [product()]), product().image_url)
  assert.equal(categoryPhoto({ name: 'Oils' }, [product()]), '')
  assert.equal(productLink(6), '/products?product=6')
  assert.equal(packLink({ name: 'Gift Combo' }), '/products?tab=packs&search=Gift%20Combo')
})

test('image optimization is limited to actual catalogue media and preserves receipt or other URLs', () => {
  const product = 'https://res.cloudinary.com/cloud/image/upload/v123/foodnova/products/rice.png'
  assert.match(optimizeCataloguePhoto(product), /f_auto,q_auto,c_limit,w_1000\/v123/)
  for (const url of [product.replace('/products/', '/receipts/'), '/branding/foodnova-logo.png', 'https://other.example/rice.png']) assert.equal(optimizeCataloguePhoto(url), url)
})

test('real selected variant prices are authoritative and missing prices never become zero', () => {
  const raw = product({ variants: [{ id: 1, price: 2400, is_available: true }, { id: 2, price: 4800, is_available: true }] })
  assert.equal(itemPrice(raw, 2).price, 4800)
  for (const value of [undefined, null, '', 'bad', -1]) assert.equal(itemPrice({ id: 1, name: 'Test', price: value }).price, null)
  assert.equal(itemPrice({ id: 1, name: 'Test', price: 0 }).price, 0)
})

test('cinematic purchase reuses stock/variant validation and detects price changes before cart commit', async () => {
  const raw = product()
  const services = { getProduct: async () => ({ data: raw }) }
  const same = await reviewCinematicPurchase({ product: raw, variantId: 1, services })
  assert.equal(same.changed, false)
  assert.equal(same.line.cart_key, 'product-6-1')
  assert.equal(same.line.quantity, 1)
  const changed = await reviewCinematicPurchase({ product: raw, variantId: 1, services: { getProduct: async () => ({ data: product({ variants: [{ id: 1, price: 2500, is_available: true }] }) }) } })
  assert.equal(changed.changed, true)
  await assert.rejects(reviewCinematicPurchase({ product: raw, variantId: 1, services: { getProduct: async () => product({ is_available: false }) } }))
})

test('active combo packs retain neutral enquiry behavior and real component contracts', async () => {
  const pack = { id: 1, name: 'Starter Pack', price: 19800, is_active: true, is_available: false, components: [{ name: 'Rice', quantity_per_pack: 1 }] }
  await assert.rejects(reviewCinematicPurchase({ product: pack, type: 'pack', services: { getPack: async () => pack } }), /enquire/)
  const page = readFileSync(new URL('../src/pages/CinematicHomePage.jsx', import.meta.url), 'utf8')
  assert.match(page, /packs: lists\[1\]\.filter\(isActive\)/)
  assert.match(page, /formatPackContents\(pack.components\)/)
  assert.match(page, /packEnquiryUrl\(pack.name\)/)
  assert.doesNotMatch(page, /discount_percentage|Math\.random|localStorage\.setItem/)
})

test('approved homepage is canonical, preview redirects and shared contracts remain authoritative', () => {
  const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
  const page = readFileSync(new URL('../src/pages/CinematicHomePage.jsx', import.meta.url), 'utf8')
  assert.match(app, /path="\/" element=\{<Suspense[^\n]+<CinematicHomePage \/>/)
  assert.match(app, /path="\/preview\/cinematic-homepage" element=\{<Navigate to="\/" replace \/>\}/)
  assert.doesNotMatch(page, /cinema-preview-note|Current homepage/)
  assert.match(page, /normalizeHeroBanner/)
  assert.match(page, /AbortController/)
  assert.match(page, /useCartStore/)
  assert.match(page, /ShoppingWidgets products=\{data.products\}/)
})

test('essential content never depends on animation opacity and all motion is scoped with teardown', () => {
  const motion = readFileSync(new URL('../src/components/CinematicMotion.jsx', import.meta.url), 'utf8')
  const css = readFileSync(new URL('../src/pages/CinematicHomePage.css', import.meta.url), 'utf8')
  assert.match(motion, /prefers-reduced-motion: reduce/)
  assert.match(motion, /media\?\.revert\(\)/)
  assert.match(motion, /scrub:/)
  assert.doesNotMatch(motion, /opacity:|setInterval|killAll/)
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)/)
  assert.match(css, /max-width:600px/)
  assert.doesNotMatch(css, /opacity:\s*0(?:[;}]|$)|visibility:hidden/)
})
