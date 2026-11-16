import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { heroText, normalizeHeroBanner } from '../src/pages/homepageHero.js'

const fallback = {
  id: 'everyday-staples', eyebrow: 'Everyday essentials', headline: 'Stock Up on',
  highlight: 'Everyday Staples', subtext: 'Rice, beans, garri and the essentials your kitchen depends on.',
  primary: 'Shop Essentials', primaryTo: '/products?category=Food%20Staples',
  productRefs: [{ id: 6, name: 'Foreign Rice' }],
}

test('legacy punctuation-only CMS banners retain the original visible FoodNova copy', () => {
  const banner = normalizeHeroBanner({ id: 2, title: '.', message: '.', image_url: 'https://example.com/original.png', button_text: 'Explore', button_link: '/products' }, fallback)
  assert.equal(banner.headline, fallback.headline)
  assert.equal(banner.highlight, fallback.highlight)
  assert.equal(banner.subtext, fallback.subtext)
  assert.equal(banner.promotionalImage, 'https://example.com/original.png')
  assert.equal(banner.primary, 'Explore')
  assert.equal(banner.primaryTo, '/products')
  assert.notEqual(banner.id, fallback.id)
  const html = renderToStaticMarkup(React.createElement('h1', { className: 'hero-headline' }, banner.headline, React.createElement('span', null, banner.highlight)))
  assert.match(html, /Stock Up on<span>Everyday Staples<\/span>/)
})

test('valid Admin headline, subtitle, campaign image and CTA remain authoritative', () => {
  const banner = normalizeHeroBanner({ title: '  Pantry restock  ', message: 'Fresh essentials for your family.', button_text: 'Shop now', button_link: '/products?tab=packs', image_url: '/images/foodnova-promotional-hero.jpg' }, fallback)
  assert.equal(banner.headline, 'Pantry restock')
  assert.equal(banner.highlight, '')
  assert.equal(banner.subtext, 'Fresh essentials for your family.')
  assert.equal(banner.primary, 'Shop now')
  assert.equal(banner.primaryTo, '/products?tab=packs')
  assert.equal(banner.promotionalImage, '/images/foodnova-promotional-hero.jpg')
})

test('missing and whitespace CMS fields fall back without losing catalogue imagery', () => {
  const banner = normalizeHeroBanner({ title: ' ', message: null, button_text: '...', image_url: '' }, fallback)
  assert.equal(banner.headline, fallback.headline)
  assert.equal(banner.subtext, fallback.subtext)
  assert.equal(banner.primary, fallback.primary)
  assert.deepEqual(banner.productRefs, fallback.productRefs)
  assert.equal(heroText('Épicerie familiale', 'fallback'), 'Épicerie familiale')
})

test('hero copy never depends on an opacity animation and reduced motion disables transforms', async () => {
  const css = await readFile(new URL('../src/pages/HomePage.css', import.meta.url), 'utf8')
  const source = await readFile(new URL('../src/pages/HomePage.jsx', import.meta.url), 'utf8')
  for (const name of ['hero-copy-enter', 'hero-slide-reveal']) {
    const frames = css.match(new RegExp(`@keyframes ${name} \\{([\\s\\S]*?)\\n\\}`))?.[1]
    assert.ok(frames)
    assert.doesNotMatch(frames, /opacity:\s*0|visibility:\s*hidden/)
  }
  assert.match(css, /\.home-page \.hero-content > \*\s*\{\s*opacity: 1;\s*visibility: visible;/)
  assert.match(css, /prefers-reduced-motion: reduce/)
  assert.match(css, /animation: none !important;/)
  assert.match(source, /<h1 className="hero-headline">\{slide.headline\}/)
  assert.match(source, /normalizeHeroBanner\(item, heroSlides\[0\]\)/)
  assert.match(source, /return \[\.\.\.campaignSlides, \.\.\.fallbackSlides\]/)
  assert.doesNotMatch(source, /key=\{item\.headline\}/)
  assert.match(source, /aria-label="Previous slide"/)
  assert.match(source, /aria-label="Next slide"/)
})
