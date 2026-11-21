import { test, expect } from '@playwright/test'
import { mkdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

const captures = path.join(tmpdir(), `foodnova-homepage-release-${process.pid}`)
test.afterAll(async () => { await rm(captures, { recursive: true, force: true }) })

test.beforeEach(async ({ context }) => {
  await context.route('**/*', (route) => ['GET', 'HEAD', 'OPTIONS'].includes(route.request().method()) ? route.continue() : route.abort('blockedbyclient'))
  await mkdir(captures, { recursive: true })
})

test('starter initialization requires Admin confirmation and is not repeated', async ({ page }) => {
  let initialized = false
  let calls = 0
  await page.addInitScript(() => {
    localStorage.setItem('admin_token', 'fixture-token')
    localStorage.setItem('admin', JSON.stringify({ role: 'admin', admin_role: 'super_admin' }))
  })
  await page.route('**/admin/announcements**', async (route) => {
    const request = route.request()
    if (request.isNavigationRequest()) return route.fallback()
    if (request.method() === 'POST') {
      calls++
      initialized = true
      return route.fulfill({ json: { success: true, status: 'created' } })
    }
    return route.fulfill({ json: { ticker_initialized: initialized, announcements: initialized
      ? [{ id: 1, title: 'Welcome', message: 'Starter notice', display_type: 'top_bar', is_active: true }]
      : [] } })
  })
  await page.goto('/admin/announcements')
  const button = page.getByRole('button', { name: 'Initialize starter announcements' })
  await expect(button).toBeVisible()
  page.once('dialog', (dialog) => dialog.dismiss())
  await button.click()
  expect(calls).toBe(0)
  page.once('dialog', (dialog) => dialog.accept())
  await button.click()
  await expect(page.locator('.cms-record')).toContainText('Starter notice')
  await expect(button).toHaveCount(0)
  expect(calls).toBe(1)
})

test('Admin can edit and delete starter records used by the homepage', async ({ page }) => {
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('dialog', (dialog) => dialog.accept())
  let items = [{ id: 1, title: 'Welcome to FoodNova', message: 'WELCOME TO FOODNOVA — Your everyday food shopping made easier.', display_type: 'top_bar', priority: 5, is_active: true }]
  await page.addInitScript(() => {
    localStorage.setItem('admin_token', 'fixture-token')
    localStorage.setItem('admin', JSON.stringify({ role: 'admin', admin_role: 'super_admin' }))
  })
  await page.route('**/admin/announcements**', async (route) => {
    const request = route.request()
    if (request.isNavigationRequest()) return route.fallback()
    if (request.method() === 'PATCH') {
      items = [{ ...items[0], ...request.postDataJSON() }]
      return route.fulfill({ json: { announcement: items[0] } })
    }
    if (request.method() === 'DELETE') {
      items = []
      return route.fulfill({ json: { success: true } })
    }
    return route.fulfill({ json: { announcements: items } })
  })
  await page.route('**/announcements/active', (route) => route.fulfill({ json: { ticker_enabled: true, announcements: items.filter((item) => item.is_active) } }))
  await page.route('**/products?**', (route) => route.fulfill({ json: { items: [] } }))
  await page.route('**/packs?**', (route) => route.fulfill({ json: { items: [] } }))
  await page.route('**/categories', (route) => route.fulfill({ json: [] }))
  await page.goto('/admin/announcements')
  const record = page.locator('.cms-record').first()
  await expect(record).toContainText('WELCOME TO FOODNOVA')
  await record.getByRole('button', { name: 'Edit', exact: true }).click()
  await page.locator('.cms-form textarea').fill('Edited starter announcement')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(record).toContainText('Edited starter announcement')
  await page.goto('/')
  await expect(page.getByRole('complementary', { name: 'FoodNova announcements' })).toContainText('Edited starter announcement')
  await page.goto('/admin/announcements')
  await page.locator('.cms-record').first().getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(page.locator('.cms-record')).toHaveCount(0)
  await page.goto('/')
  await expect(page.getByRole('complementary', { name: 'FoodNova announcements' })).toHaveCount(0)
  expect(errors).toEqual([])
})

for (const width of [320, 1440]) {
  test(`ticker shows CMS content immediately and keeps short messages readable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    let response = { announcements: [{ id: 1, display_type: 'top_bar', message: 'WELCOME TO FOODNOVA — Your everyday food shopping made easier.' }] }
    await page.route('**/announcements/active', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 300))
      await route.fulfill({ json: response })
    })
    await page.route('**/products?**', (route) => route.fulfill({ json: { items: [] } }))
    await page.route('**/packs?**', (route) => route.fulfill({ json: { items: [] } }))
    await page.route('**/categories', (route) => route.fulfill({ json: [] }))
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    const ticker = page.getByRole('complementary', { name: 'FoodNova announcements' })
    await expect(ticker.getByRole('status')).toHaveText('Loading announcements…')
    const loadingHeight = (await ticker.boundingBox()).height
    await expect(ticker).toContainText('WELCOME TO FOODNOVA')
    expect(Math.abs((await ticker.boundingBox()).height - loadingHeight)).toBeLessThan(1)
    const track = ticker.locator('.homepage-ticker-track')
    const before = await track.evaluate((el) => getComputedStyle(el).transform)
    await expect.poll(() => track.evaluate((el) => getComputedStyle(el).transform)).not.toBe(before)
    const coverage = await track.evaluate((el) => {
      const animation = el.getAnimations()[0]
      animation.pause()
      const duration = animation.effect.getTiming().duration
      return [0, 0.25, 0.5, 0.75, 0.99].map((fraction) => {
        animation.currentTime = duration * fraction
        const bounds = el.parentElement.getBoundingClientRect()
        return [...el.querySelectorAll('.homepage-ticker-group>span')].some((span) => {
          const box = span.getBoundingClientRect()
          return Math.min(box.right - 30, bounds.right) - Math.max(box.left, bounds.left) > 10
        })
      })
    })
    expect(coverage).toEqual([true, true, true, true, true])
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await expect(track).toHaveCSS('animation-name', 'none')
    await expect(ticker.locator('.homepage-ticker-group:not([aria-hidden])>span:not([aria-hidden])')).toHaveCount(1)
    response = { ticker_enabled: false, announcements: [{ id: 1, display_type: 'top_bar', message: 'Edited notice' }] }
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
    await expect(ticker).toHaveCount(0)
    expect(errors).toEqual([])
  })

  test(`CMS ticker, category fallback and optional audio at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    let enabled = true
    await page.route('**/announcements/active', (route) => route.fulfill({ json: { ticker_enabled: enabled, announcements: [
      { id: 1, title: 'Notice', message: 'Fresh FoodNova notice', display_type: 'top_bar', priority: 10, button_link: '/products' },
      { id: 6, title: 'Welcome', message: 'Welcome to FoodNova - Quality Foodstuff, Reliable Supply.', display_type: 'top_bar', priority: 1, button_link: '/products?tab=packs' },
      { id: 2, title: 'Old mockup', message: 'Old promotional artwork', display_type: 'hero_banner', image_url: '/announcement-78637d94fa75434594d783495a18d2c9.png' },
      { id: 3, title: 'Seasonal pantry', message: 'Explore pantry essentials', display_type: 'hero_banner', button_link: '/products' },
      { id: 4, message: 'Expired notice', display_type: 'top_bar', end_date: '2020-01-01T00:00:00Z' },
      { id: 5, message: 'Inactive notice', display_type: 'top_bar', is_active: false },
    ] } }))
    await page.route('**/categories', (route) => route.fulfill({ json: [{ id: 8, name: 'Oils', image_url: '/broken-category.png' }, { id: 99, name: 'No category photograph' }] }))
    await page.route('**/products?**', (route) => route.fulfill({ json: { items: [{ id: 1, name: 'Palm Oil fixture', category: 'Oils', price: 100, is_active: true, image_url: '/fixture-oil.png', is_available: true }] } }))
    await page.route('**/products/1', (route) => route.fulfill({ json: { id: 1, name: 'Palm Oil fixture', category: 'Oils', price: 100, is_active: true, image_url: '/fixture-oil.png', is_available: true } }))
    await page.route('**/packs?**', (route) => route.fulfill({ json: { items: [] } }))
    await page.route('**/broken-category.png', (route) => route.abort())
    const image = await readFile('public/branding/foodnova-logo.png')
    await page.route('**/fixture-oil.png', (route) => route.fulfill({ contentType: 'image/png', body: image }))
    await page.addInitScript(() => {
      window.__cinemaAudio = []
      window.__cinemaTones = 0
      const Context = window.AudioContext
      if (Context) window.AudioContext = class extends Context {
        constructor(...args) { super(...args); window.__cinemaAudio.push(this) }
        createOscillator() { window.__cinemaTones++; return super.createOscillator() }
      }
    })

    await page.goto('/')
    const ticker = page.getByRole('complementary', { name: 'FoodNova announcements' })
    await expect(ticker).toBeVisible()
    await expect(ticker).not.toContainText('Expired notice')
    await expect(ticker).not.toContainText('Inactive notice')
    await ticker.hover()
    expect(await ticker.locator('.homepage-ticker-track').evaluate((el) => getComputedStyle(el).animationPlayState)).toBe('paused')
    await page.mouse.move(0, 0)
    const longLink = ticker.getByRole('link', { name: 'Welcome to FoodNova - Quality Foodstuff, Reliable Supply.', exact: true })
    await longLink.focus()
    const linkBox = await longLink.boundingBox()
    const windowBox = await ticker.locator('.homepage-ticker-window').boundingBox()
    expect(linkBox.x).toBeGreaterThanOrEqual(windowBox.x - 1)
    expect(linkBox.x + linkBox.width).toBeLessThanOrEqual(windowBox.x + windowBox.width + 1)

    if (width === 320) {
      const menu = page.getByRole('button', { name: 'Toggle navigation menu', exact: true })
      await menu.click()
      await expect(menu).toHaveAttribute('aria-expanded', 'true')
      expect(await page.locator('.navbar').evaluate((el) => Number(getComputedStyle(el).zIndex))).toBeGreaterThan(await ticker.evaluate((el) => Number(getComputedStyle(el).zIndex)))
      await page.screenshot({ path: path.join(captures, 'ticker-mobile-menu-320.png') })
      await page.keyboard.press('Escape')
      await expect(menu).toHaveAttribute('aria-expanded', 'false')
    }

    expect(await page.evaluate(() => window.__cinemaAudio.length)).toBe(0)
    const sound = page.getByRole('button', { name: 'Enable Sound', exact: true })
    await expect(sound).toHaveAttribute('aria-pressed', 'false')
    const soundBox = await sound.boundingBox()
    for (const selector of ['.floating-cart-button', '.tracking-shortcut']) {
      const target = page.locator(selector)
      const box = await target.count() ? await target.boundingBox() : null
      if (box) expect(soundBox.x + soundBox.width <= box.x || box.x + box.width <= soundBox.x ||
        soundBox.y + soundBox.height <= box.y || box.y + box.height <= soundBox.y).toBe(true)
    }
    await sound.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('button', { name: 'Mute Sound', exact: true })).toHaveAttribute('aria-pressed', 'true')
    expect(await page.evaluate(() => window.__cinemaAudio.length)).toBe(1)
    const add = page.getByRole('button', { name: 'Add Palm Oil fixture to cart', exact: true })
    await add.click()
    await expect.poll(() => page.evaluate(() => window.__cinemaTones)).toBe(1)
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('cart') || '[]').length)).toBeGreaterThan(0)
    const cartBox = await page.locator('.floating-cart-button').boundingBox()
    expect(soundBox.y + soundBox.height <= cartBox.y).toBe(true)
    await page.getByRole('button', { name: 'Mute Sound', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Enable Sound', exact: true })).toHaveAttribute('aria-pressed', 'false')
    await page.waitForTimeout(1000)
    await add.click()
    expect(await page.evaluate(() => window.__cinemaTones)).toBe(1)
    await page.getByRole('button', { name: 'Pause announcements', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Resume announcements', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('button', { name: 'Resume announcements', exact: true }).click()
    await expect(page.locator('.cinema-campaign')).toHaveCount(1)
    await expect(page.locator('img[src*="announcement-78637"]')).toHaveCount(0)
    const category = page.locator('.cinema-category').filter({ has: page.getByRole('heading', { name: 'Oils', exact: true }) })
    await category.scrollIntoViewIfNeeded()
    await expect(category.locator('.cinema-category-image')).toHaveAttribute('data-image-state', 'loaded')
    await expect(category.locator('.cinema-category-image>img')).toHaveAttribute('src', /fixture-oil.png$/)
    await expect(page.locator('.cinema-category-image[data-image-state="fallback"] .brand-logo-image')).toBeVisible()
    const top = await ticker.boundingBox()
    const header = await page.locator('.navbar').boundingBox()
    expect(Math.abs(top.y - (header.y + header.height))).toBeLessThan(2)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
    await page.screenshot({ path: path.join(captures, `categories-ticker-${width}.png`) })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    expect(await ticker.locator('.homepage-ticker-track').evaluate((el) => getComputedStyle(el).animationName)).toBe('none')
    enabled = false
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
    await expect(ticker).toHaveCount(0)
    await category.click()
    await expect(page).toHaveURL(/products\?category=Oils/)
    await expect.poll(() => page.evaluate(() => window.__cinemaAudio.every((context) => context.state === 'closed'))).toBe(true)
    expect(errors).toEqual([])
  })
}
