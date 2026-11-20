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

for (const width of [320, 1440]) {
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
    await page.route('**/packs?**', (route) => route.fulfill({ json: { items: [] } }))
    await page.route('**/broken-category.png', (route) => route.abort())
    const image = await readFile('public/branding/foodnova-logo.png')
    await page.route('**/fixture-oil.png', (route) => route.fulfill({ contentType: 'image/png', body: image }))
    await page.addInitScript(() => {
      window.__cinemaAudio = []
      const Context = window.AudioContext
      if (Context) window.AudioContext = class extends Context { constructor(...args) { super(...args); window.__cinemaAudio.push(this) } }
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
    await expect(page.getByRole('button', { name: 'Music unavailable', exact: true })).toBeDisabled()
    await page.getByRole('button', { name: 'Enable sound effects', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Disable sound effects', exact: true })).toHaveAttribute('aria-pressed', 'true')
    expect(await page.evaluate(() => window.__cinemaAudio.length)).toBe(1)
    await page.getByRole('button', { name: 'Disable sound effects', exact: true }).click()
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
