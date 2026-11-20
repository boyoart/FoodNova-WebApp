import { test, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

const screenshots = path.resolve('../.codex-attachments/cinematic-validation')
test.beforeEach(async ({ context }) => {
  // Local UI tests may read public catalogue data but must never create real orders or telemetry.
  await context.route('**/*', async (route) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(route.request().method())) return route.abort('blockedbyclient')
    return route.continue()
  })
  await mkdir(screenshots, { recursive: true })
})

for (const width of [1440, 1024, 768, 390, 360, 320]) {
  test(`live catalogue layout and shopping at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    const productResponse = page.waitForResponse((response) => new URL(response.url()).pathname.endsWith('/products') && new URL(response.url()).searchParams.get('page_size') === '100')
    const packResponse = page.waitForResponse((response) => new URL(response.url()).pathname.endsWith('/packs') && new URL(response.url()).searchParams.get('page_size') === '100')
    const categoryResponse = page.waitForResponse((response) => new URL(response.url()).pathname.endsWith('/categories'))
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('#cinema-title')).toHaveText(/^Good Food\.\s*Better Value\.$/)
    await expect(page.locator('#cinema-title')).toBeVisible()
    await expect(page.locator('.tracking-shortcut')).toHaveAccessibleName('Track Your Order')
    await expect(page.locator('.tracking-shortcut')).toHaveAttribute('href', '/track-order')
    await expect(page.locator('.cinema-product-card').first()).toBeVisible()
    await expect.poll(() => page.locator('.cinema-hero-visual img').evaluateAll((images) => images.length > 0 && images.every((img) => img.complete && img.naturalWidth > 0))).toBe(true)
    await page.locator('.cinema-hero-visual img').evaluateAll(async (images) => {
      await Promise.all(images.map((img) => img.decode()))
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    })
    const layout = await page.evaluate(() => ({ viewport: innerWidth, width: document.documentElement.scrollWidth,
      offenders: [...document.querySelectorAll('body *')].filter((el) => {
        const box = el.getBoundingClientRect(); return box.width && (box.right > innerWidth + 1 || box.left < -1)
      }).slice(0, 12).map((el) => ({ tag: el.tagName, class: String(el.className).slice(0, 100), left: el.getBoundingClientRect().left, right: el.getBoundingClientRect().right })) }))
    expect(layout.width, JSON.stringify(layout)).toBeLessThanOrEqual(layout.viewport + 1)
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.screenshot({ path: path.join(screenshots, `after-${width}.png`), fullPage: false })
    if (width === 1440 || width === 390) {
      for (const [selector, name] of [['.cinema-pack-grid', 'packs'], ['.cinema-product-grid', 'products'], ['.cinema-finale', 'finale']]) {
        await page.locator(selector).evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + scrollY - 110))
        await expect.poll(() => page.locator('.cinematic-homepage img').evaluateAll((images) => images.filter((img) => {
          const box = img.getBoundingClientRect(); return box.top < innerHeight && box.bottom > 0
        }).every((img) => img.complete && img.naturalWidth > 0))).toBe(true)
        await page.locator('.cinematic-homepage img').evaluateAll(async (images) => {
          await Promise.all(images.filter((img) => {
            const box = img.getBoundingClientRect(); return box.top < innerHeight && box.bottom > 0
          }).map((img) => img.decode()))
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
        })
        await page.screenshot({ path: path.join(screenshots, `${name}-${width}.png`), fullPage: false })
      }
    }
    const first = page.locator('.cinema-product-card').first()
    const name = await first.locator('h3').innerText()
    const list = (body, key) => Array.isArray(body) ? body : body[key] || body.items || body.data || []
    const products = list(await (await productResponse).json(), 'products')
    const packs = list(await (await packResponse).json(), 'packs').filter((p) => p.is_active !== false && p.active !== false)
    const categories = list(await (await categoryResponse).json(), 'categories').filter((p) => p.is_active !== false && p.active !== false)
    const actual = products.find((product) => product.name === name)
    expect(actual).toBeTruthy()
    const select = first.locator('select')
    const variantId = await select.count() ? await select.inputValue() : null
    const variant = actual.variants?.find((v) => String(v.id) === variantId)
    const expectedPrice = Number(variant?.price ?? variant?.unit_price ?? actual.price)
    await expect(first.locator('.cinema-product-buy strong')).toHaveText(`₦${expectedPrice.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
    const photo = await first.locator('img').getAttribute('src')
    const sources = [actual.image_url, actual.effective_image_url, ...(actual.images || []).map((image) => image.image_url)]
    expect(sources.some((source) => source && photo.includes(source.split('/').pop()))).toBe(true)
    await expect(page.locator('.cinema-pack h3')).toHaveText(packs.map((pack) => pack.name))
    await expect(page.locator('.cinema-category h3')).toHaveText(categories.map((category) => category.name))
    await first.getByRole('button', { name: `Add ${name} to cart`, exact: true }).click()
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('cart') || '[]').length)).toBeGreaterThan(0)
    await page.reload({ waitUntil: 'domcontentloaded' })
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('cart') || '[]').length)).toBeGreaterThan(0)
    if (width === 390) {
      const menu = page.getByRole('button', { name: 'Toggle navigation menu', exact: true })
      await menu.click()
      await expect(menu).toHaveAttribute('aria-expanded', 'true')
      await page.keyboard.press('Escape')
      await expect(menu).toHaveAttribute('aria-expanded', 'false')
    }
    await page.goto('/checkout', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: 'Continue checkout', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Create Account', exact: true })).toHaveAttribute('href', '/register')
    await expect(page.getByRole('link', { name: 'Log In', exact: true })).toHaveAttribute('href', '/login')
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('cart') || '[]').length)).toBeGreaterThan(0)
    expect(errors).toEqual([])
  })
}

test('scroll-linked product motion changes and reduced motion returns static readable content', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  const layer = page.locator('[data-cinema-layer]').first()
  await expect(layer).toBeAttached()
  await expect.poll(() => layer.evaluate((el) => getComputedStyle(el).transform)).not.toBe('none')
  const before = await layer.evaluate((el) => getComputedStyle(el).transform)
  await page.locator('.cinema-assembly').evaluate((el) => window.scrollTo(0, el.offsetTop + window.innerHeight * 0.6))
  await expect.poll(() => layer.evaluate((el) => getComputedStyle(el).transform)).not.toBe(before)
  await page.screenshot({ path: path.join(screenshots, 'scroll-assembly-1440.png') })
  const oldLayer = await layer.elementHandle()
  await page.getByRole('link', { name: 'Shop Now', exact: true }).click()
  await expect(page).toHaveURL(/\/products$/)
  await expect(page.locator('.cinematic-homepage')).toHaveCount(0)
  await expect(page.locator('.cinematic-homepage-frame')).toHaveCount(0)
  await expect.poll(() => oldLayer.evaluate((el) => el.style.transform)).toBe('')
  await page.goBack()
  await expect(layer).toBeAttached()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect.poll(() => layer.evaluate((el) => getComputedStyle(el).transform)).toBe('none')
  await expect(page.locator('#cinema-assembly-title')).toHaveText(/^A pantry\.\s*Full of possibility\.$/)
  await expect(page.locator('#cinema-assembly-title')).toBeVisible()
  await page.screenshot({ path: path.join(screenshots, 'reduced-motion-1440.png') })
})

test('catalogue failure keeps the headline, retry and shopping routes usable without fabricated prices', async ({ page }) => {
  await page.route('**/products?**', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }))
  await page.route('**/packs?**', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }))
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('#cinema-title')).toHaveText(/^Good Food\.\s*Better Value\.$/)
  await expect(page.locator('#cinema-title')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Try again', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Shop Now', exact: true })).toHaveAttribute('href', '/products')
  await expect(page.locator('.cinema-featured-tag')).toHaveCount(0)
})

test('preview redirects to canonical homepage and initially reduced-motion mobile stays visible', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/preview/cinematic-homepage', { waitUntil: 'domcontentloaded' })
  await expect(page).toHaveURL('http://127.0.0.1:5186/')
  await expect(page.locator('#cinema-title')).toBeVisible()
  await expect(page.locator('.cinematic-homepage')).toHaveCount(1)
  await expect(page.locator('.cinematic-homepage-frame')).toHaveCount(1)
  await expect(page.locator('.cinema-preview-note')).toHaveCount(0)
  const layer = page.locator('[data-cinema-layer]').first()
  await expect(layer).toBeAttached()
  await expect.poll(() => layer.evaluate((el) => getComputedStyle(el).transform)).toBe('none')
  await expect(page.getByRole('link', { name: 'Shop Now', exact: true })).toBeVisible()
})
