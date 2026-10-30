import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  hasConfirmedFivePercentDiscount,
  selectFeaturedComboPacks,
} from '../src/pages/homepageComboPacks.js'

const source = await readFile(new URL('../src/pages/HomePage.jsx', import.meta.url), 'utf8')
const styles = await readFile(new URL('../src/pages/HomePage.css', import.meta.url), 'utf8')
const promoSection = source.slice(source.indexOf('className="home-combo-packs"'), source.indexOf('className="features"'))

test('homepage selects the three featured active packs in display order from API data', () => {
  const packs = [
    { id: 1, name: 'Full Package', price: 52915, is_active: true },
    { id: 2, name: 'Archived Starter', price: 1, is_active: false },
    { id: 3, name: 'Starter Pack', price: 19760, is_active: true },
    { id: 4, name: 'Gift Combo', price: 21375, is_active: true },
  ]
  assert.deepEqual(selectFeaturedComboPacks(packs).map((pack) => pack.id), [3, 4, 1])
})

test('only an explicit five-percent product discount enables the promotion label', () => {
  assert.equal(hasConfirmedFivePercentDiscount({ discount_percentage: 5 }), true)
  assert.equal(hasConfirmedFivePercentDiscount({ discount_percent: '5' }), true)
  assert.equal(hasConfirmedFivePercentDiscount({ discount_percentage: 10 }), false)
  assert.equal(hasConfirmedFivePercentDiscount({ discount: 5 }), false)
  assert.equal(hasConfirmedFivePercentDiscount({}), false)
})

test('homepage loads packs once from the existing endpoint and renders live data', () => {
  assert.equal((source.match(/packsAPI\.getAll\(/g) || []).length, 1)
  assert.match(source, /packsAPI\.getAll\(\{ page: 1, page_size: 100 \}\)/)
  assert.match(source, /<h2 id="home-combo-packs-title">Combo Food Packs<\/h2>/)
  assert.match(source, /Everyday food essentials\. Better value\./)
  assert.match(source, /<h3>\{pack\.name\}<\/h3>/)
  assert.match(source, /formatPrice\(pack\.price\)/)
  assert.match(source, /hasConfirmedFivePercentDiscount\(pack\)/)
  assert.doesNotMatch(source, /₦19,760|₦21,375|₦52,915/)
})

test('promo section follows the existing hero and links to the existing pack listing', () => {
  assert.ok(source.indexOf('</section>') < source.indexOf('className="home-combo-packs"'))
  assert.match(source, /to="\/products\?tab=packs">[\s\S]*Explore Combo Packs/)
  assert.match(source, /className="features"/)
  assert.match(source, /className="home-merchandising"/)
  assert.match(source, /className="home-categories"/)
})

test('unavailable packs remain visible but have no purchase action or stock details', () => {
  assert.match(promoSection, /pack\.is_available !== false/)
  assert.match(promoSection, /Temporarily unavailable/)
  assert.doesNotMatch(promoSection, /Out of Stock|Out of stock|stock_qty|available_combo_quantity|Add to Cart/)
})

test('promo banner uses responsive branded price cards and a tappable CTA', () => {
  assert.match(styles, /\.home-combo-packs\s*\{[^}]*#032b18/s)
  assert.match(styles, /\.home-combo-pack-price\s*\{[^}]*background:\s*#fff/s)
  assert.match(styles, /\.home-combo-pack-discount\s*\{[^}]*#ffda4f/s)
  assert.match(styles, /@media \(max-width: 900px\)[\s\S]*\.home-combo-packs\s*\{/)
  assert.match(styles, /@media \(max-width: 560px\)[\s\S]*\.home-combo-packs\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)/)
  assert.match(styles, /\.home-combo-packs-cta\s*\{[^}]*min-height:\s*46px/s)
})
