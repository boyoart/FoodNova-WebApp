import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { observeScrollReveals } from '../src/utils/scrollReveals.js'
import { observeStickyHeader } from '../src/utils/stickyHeader.js'

const source = async (path) => readFile(new URL(path, import.meta.url), 'utf8')

test('official web and mobile logo assets match the exact approved uploaded artwork', async () => {
  const expected = '8593ab0f4268bba0149525b078dc0b8273ecb9ca19e2a4f233b391dd9f098f7d'
  for (const path of ['../public/branding/foodnova-logo.png', '../../foodnova-customer-app/assets/brand/foodnova-logo.png', '../../foodnova-dispatch-app/assets/images/foodnova-dispatch-logo.png']) {
    const bytes = await readFile(new URL(path, import.meta.url))
    assert.equal(createHash('sha256').update(bytes).digest('hex'), expected)
    assert.equal(bytes.readUInt32BE(16), 828)
    assert.equal(bytes.readUInt32BE(20), 394)
  }
})

test('branding renders the full original logo and is reused in all web identity surfaces', async () => {
  const logo = await source('../src/components/BrandLogo.jsx')
  const css = await source('../src/components/BrandLogo.css')
  assert.match(logo, /\/branding\/foodnova-logo\.png/)
  assert.match(logo, /width="828" height="394"/)
  assert.match(logo, /Quality Foodstuff\. Reliable Supply\./)
  assert.match(css, /height: auto/)
  assert.match(css, /object-fit: contain/)
  assert.match(css, /background: transparent/)
  assert.doesNotMatch(css, /background: #fff/)
  assert.doesNotMatch(css, /filter:|object-fit: cover/)
  for (const path of ['components/Navbar.jsx', 'components/Footer.jsx', 'pages/AdminLayout.jsx', 'pages/LoginPage.jsx', 'pages/AdminLoginPage.jsx', 'pages/RegisterPage.jsx', 'pages/ResetPasswordPage.jsx']) {
    const content = await source(`../src/${path}`)
    assert.match(content, /<BrandLogo/)
    assert.doesNotMatch(content, /src="\/foodnova-logo\.png"|setLogoSrc/)
  }
})

test('mobile logo components preserve artwork without white background plates', async () => {
  const flutter = await source('../../foodnova-customer-app/lib/widgets/brand_logo.dart')
  const expo = await source('../../foodnova-dispatch-app/src/components/Logo.tsx')
  assert.doesNotMatch(flutter, /Colors.white|DecoratedBox|ColorFiltered/)
  assert.match(flutter, /BoxFit.contain/)
  assert.doesNotMatch(expo, /backgroundColor: "#fff"|rgba\(255/)
  assert.match(expo, /contentFit="contain"/)
  const config = JSON.parse(await source('../../foodnova-dispatch-app/app.json'))
  const splash = config.expo.plugins.find((entry) => Array.isArray(entry) && entry[0] === 'expo-splash-screen')[1]
  assert.equal(splash.image, './assets/images/foodnova-dispatch-logo.png')
  assert.equal(splash.resizeMode, 'contain')
})

test('late mounted widgets and cards are observed once without restarting existing animations', () => {
  let intersect, mutate, mutationDisconnected = false
  const observed = []
  let animations = 0
  const card = { animate: () => { animations++; return { cancel() {} } } }
  const widget = { animate: () => { animations++; return { cancel() {} } } }
  let children = [card]
  class Observer {
    constructor(callback, options) { intersect = callback; assert.equal(options.threshold, 0) }
    observe(element) { observed.push(element) }
    unobserve() {}
    disconnect() {}
  }
  class Mutations {
    constructor(callback) { mutate = callback }
    observe(_, options) { assert.deepEqual(options, { childList: true, subtree: true }) }
    disconnect() { mutationDisconnected = true }
  }
  const cleanup = observeScrollReveals({ root: { querySelectorAll: () => children }, Observer, Mutations, media: null })
  assert.deepEqual(observed, [card])
  intersect([{ target: card, isIntersecting: true }])
  children = [card, widget]
  mutate()
  mutate()
  assert.deepEqual(observed, [card, widget])
  intersect([{ target: widget, isIntersecting: true }, { target: card, isIntersecting: true }])
  assert.equal(animations, 2)
  cleanup()
  assert.equal(mutationDisconnected, true)
})

test('sticky header measures anchor offset, reacts to scroll intersections, and cleans up', () => {
  let intersection, resizeCallback, height = 84, disconnected = 0
  const states = []
  const values = new Map()
  const header = { getBoundingClientRect: () => ({ height }) }
  const sentinel = {}
  class Observer {
    constructor(callback) { intersection = callback }
    observe(target) { assert.equal(target, sentinel) }
    disconnect() { disconnected++ }
  }
  class Resize {
    constructor(callback) { resizeCallback = callback }
    observe(target) { assert.equal(target, header) }
    disconnect() { disconnected++ }
  }
  const rootStyle = { getPropertyValue: (key) => values.get(key), setProperty: (key, value) => values.set(key, value), removeProperty: (key) => values.delete(key) }
  const cleanup = observeStickyHeader({ header, sentinel, onScrollChange: (value) => states.push(value), Observer, Resize, rootStyle })
  assert.equal(values.get('--foodnova-header-offset'), '96px')
  intersection([{ isIntersecting: false }])
  intersection([{ isIntersecting: true }])
  assert.deepEqual(states, [true, false])
  height = 68
  resizeCallback()
  assert.equal(values.get('--foodnova-header-offset'), '80px')
  cleanup()
  assert.equal(disconnected, 2)
  assert.equal(values.has('--foodnova-header-offset'), false)
})

test('mobile navigation has expansion state, Escape focus return, route close and visible cart', async () => {
  const navbar = await source('../src/components/Navbar.jsx')
  const css = await source('../src/components/Navbar.css')
  const app = await source('../src/App.jsx')
  assert.match(navbar, /aria-expanded=\{mobileMenuOpen\} aria-controls="customer-navigation"/)
  assert.match(navbar, /event\.key === 'Escape'/)
  assert.match(navbar, /menuButtonRef\.current\?\.focus\(\)/)
  assert.match(navbar, /\[location\.pathname, location\.search\]/)
  assert.match(navbar, /!isAdmin && <Link to="\/cart" className="header-cart"/)
  assert.match(navbar, /isAdmin && <li[^\n]*to="\/admin\/dashboard"/)
  assert.doesNotMatch(navbar, /Admin Menu|Manage Orders|Stock Management/)
  assert.match(css, /\.navbar \.nav-menu \{ display: none; \}/)
  assert.match(css, /\.navbar \.nav-menu\.active \{ display: flex;/)
  assert.match(css, /position: sticky;/)
  assert.match(css, /scroll-padding-top: var\(--foodnova-header-offset/)
  assert.match(css, /prefers-reduced-motion: reduce/)
  assert.doesNotMatch(app, /paddingTop: isAdminRoute \? 0 : '60px'/)
})

test('scroll reveal animates an intersecting section once and cancels on reduced motion', () => {
  let intersect, preferenceChange, disconnects = 0, unobserved = 0, animations = 0, cancelled = 0
  const element = { animate: (frames, options) => {
    animations++
    assert.equal(frames[1].opacity, 1)
    assert.equal(options.iterations, undefined)
    assert.equal(options.fill, 'none')
    return { cancel: () => cancelled++ }
  } }
  const media = { matches: false, addEventListener: (_, fn) => { preferenceChange = fn }, removeEventListener: (_, fn) => assert.equal(fn, preferenceChange) }
  class Observer {
    constructor(callback) { intersect = callback }
    observe(target) { assert.equal(target, element) }
    unobserve() { unobserved++ }
    disconnect() { disconnects++ }
  }
  const cleanup = observeScrollReveals({ elements: [element], Observer, media })
  intersect([{ target: element, isIntersecting: false }])
  assert.equal(animations, 0)
  intersect([{ target: element, isIntersecting: true }])
  intersect([{ target: element, isIntersecting: true }])
  assert.equal(animations, 1)
  assert.equal(unobserved, 1)
  media.matches = true
  preferenceChange()
  assert.equal(cancelled, 1)
  cleanup()
  assert.equal(disconnects, 2)
})

test('unsupported APIs, failed animation and reduced motion never hide content', () => {
  const element = { animate() { throw new Error('Animation unavailable') } }
  assert.doesNotThrow(() => observeScrollReveals({ elements: [element], Observer: undefined, media: null })())
  class UnexpectedObserver { constructor() { throw new Error('Must not initialize') } }
  assert.doesNotThrow(() => observeScrollReveals({ elements: [element], Observer: UnexpectedObserver, media: { matches: true } })())
  class Observer {
    constructor(callback) { this.callback = callback }
    observe(target) { this.callback([{ target, isIntersecting: true }]) }
    unobserve() {}
    disconnect() {}
  }
  assert.doesNotThrow(() => observeScrollReveals({ elements: [element], Observer, media: null })())
  assert.equal(element.style, undefined)
})
