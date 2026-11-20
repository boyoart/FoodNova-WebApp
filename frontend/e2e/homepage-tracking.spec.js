import { test, expect } from '@playwright/test'
import { mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
const captures = path.resolve('../.codex-attachments/cinematic-phase2-validation')

test.beforeEach(async ({ context }) => {
  await context.route('**/*', (route) => ['GET','HEAD','OPTIONS'].includes(route.request().method()) ? route.continue() : route.abort('blockedbyclient'))
  await mkdir(captures, { recursive:true })
})

for (const width of [320, 1440]) {
  test(`CMS ticker, category fallback and optional audio at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height:900 })
    const errors=[]; page.on('pageerror', (error)=>errors.push(error.message))
    let enabled=true
    await page.route('**/announcements/active', (route)=>route.fulfill({ json:{ ticker_enabled:enabled, announcements:[
      { id:1, title:'Notice', message:'Fresh FoodNova notice', display_type:'top_bar', priority:10, button_link:'/products' },
      { id:6, title:'Welcome', message:'Welcome to FoodNova - Quality Foodstuff, Reliable Supply.', display_type:'top_bar', priority:1, button_link:'/products?tab=packs' },
      { id:2, title:'Old mockup', message:'Old promotional artwork', display_type:'hero_banner', image_url:'/announcement-78637d94fa75434594d783495a18d2c9.png' },
      { id:3, title:'Seasonal pantry', message:'Explore pantry essentials', display_type:'hero_banner', button_link:'/products' },
      { id:4, message:'Expired notice', display_type:'top_bar', end_date:'2020-01-01T00:00:00Z' },
      { id:5, message:'Inactive notice', display_type:'top_bar', is_active:false },
    ] } }))
    await page.route('**/categories', (route)=>route.fulfill({json:[{id:8,name:'Oils',image_url:'/broken-category.png'},{id:99,name:'No category photograph'}]}))
    await page.route('**/products?**', (route)=>route.fulfill({json:{items:[{id:1,name:'Palm Oil fixture',category:'Oils',price:100,is_active:true,image_url:'/fixture-oil.png',is_available:true}]}}))
    await page.route('**/broken-category.png', (route)=>route.abort())
    const image=await readFile('public/branding/foodnova-logo.png') // Test-only image bytes, never published as a product asset.
    await page.route('**/fixture-oil.png', (route)=>route.fulfill({contentType:'image/png',body:image}))
    await page.addInitScript(()=>{
      window.__cinemaAudio=[]
      const Context=window.AudioContext
      if(Context) window.AudioContext=class extends Context { constructor(...args){super(...args);window.__cinemaAudio.push(this)} }
    })
    await page.goto('/')
    const ticker=page.getByRole('complementary',{name:'FoodNova announcements'})
    await expect(ticker).toBeVisible()
    await expect(ticker).not.toContainText('Expired notice')
    await expect(ticker).not.toContainText('Inactive notice')
    await ticker.hover()
    expect(await ticker.locator('.homepage-ticker-track').evaluate((el)=>getComputedStyle(el).animationPlayState)).toBe('paused')
    await page.mouse.move(0,0)
    const longLink=ticker.getByRole('link',{name:'Welcome to FoodNova - Quality Foodstuff, Reliable Supply.',exact:true})
    await longLink.focus()
    const linkBox=await longLink.boundingBox(), windowBox=await ticker.locator('.homepage-ticker-window').boundingBox()
    expect(linkBox.x).toBeGreaterThanOrEqual(windowBox.x-1)
    expect(linkBox.x+linkBox.width).toBeLessThanOrEqual(windowBox.x+windowBox.width+1)
    if(width===320){
      const menu=page.getByRole('button',{name:'Toggle navigation menu',exact:true})
      await menu.click()
      await expect(menu).toHaveAttribute('aria-expanded','true')
      await expect(page.locator('.navbar').getByRole('link',{name:'Track Order',exact:true})).toBeVisible()
      expect(await page.locator('.navbar').evaluate((el)=>Number(getComputedStyle(el).zIndex))).toBeGreaterThan(await ticker.evaluate((el)=>Number(getComputedStyle(el).zIndex)))
      await page.screenshot({path:path.join(captures,'ticker-mobile-menu-320.png')})
      await page.keyboard.press('Escape')
      await expect(menu).toHaveAttribute('aria-expanded','false')
    }
    expect(await page.evaluate(()=>window.__cinemaAudio.length)).toBe(0)
    await expect(page.getByRole('button',{name:'Music unavailable',exact:true})).toBeDisabled()
    await page.getByRole('button',{name:'Enable sound effects',exact:true}).click()
    await expect(page.getByRole('button',{name:'Disable sound effects',exact:true})).toHaveAttribute('aria-pressed','true')
    expect(await page.evaluate(()=>window.__cinemaAudio.length)).toBe(1)
    await page.getByRole('button',{name:'Disable sound effects',exact:true}).click()
    await page.getByRole('button',{name:'Pause announcements',exact:true}).click()
    await expect(page.getByRole('button',{name:'Resume announcements',exact:true})).toHaveAttribute('aria-pressed','true')
    await page.getByRole('button',{name:'Resume announcements',exact:true}).click()
    await expect(page.locator('.cinema-campaign')).toHaveCount(1)
    await expect(page.locator('img[src*="announcement-78637"]')).toHaveCount(0)
    const category=page.locator('.cinema-category').filter({has:page.getByRole('heading',{name:'Oils',exact:true})})
    await category.scrollIntoViewIfNeeded()
    await expect(category.locator('.cinema-category-image')).toHaveAttribute('data-image-state','loaded')
    await expect(category.locator('.cinema-category-image>img')).toHaveAttribute('src',/fixture-oil.png$/)
    await expect(page.locator('.cinema-category-image[data-image-state="fallback"] .brand-logo-image')).toBeVisible()
    const top=await ticker.boundingBox(), header=await page.locator('.navbar').boundingBox()
    expect(Math.abs(top.y-(header.y+header.height))).toBeLessThan(2)
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true)
    await page.screenshot({path:path.join(captures,`categories-ticker-${width}.png`)})
    await page.emulateMedia({reducedMotion:'reduce'})
    expect(await ticker.locator('.homepage-ticker-track').evaluate((el)=>getComputedStyle(el).animationName)).toBe('none')
    enabled=false
    await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')))
    await expect(ticker).toHaveCount(0)
    await category.click()
    await expect(page).toHaveURL(/products\?category=Oils/)
    await expect.poll(()=>page.evaluate(()=>window.__cinemaAudio.every((context)=>context.state==='closed'))).toBe(true)
    expect(errors).toEqual([])
  })

  test(`number-only public tracking without login at ${width}px`, async ({page})=>{
    await page.setViewportSize({width,height:900})
    let calls=0, networkFailure=false
    await page.route('**/tracking/public', async(route)=>{
      calls++
      expect(route.request().method()).toBe('POST')
      expect(route.request().headers().authorization).toBeUndefined()
      const body=route.request().postDataJSON()
      expect(Object.keys(body)).toEqual(['order_number'])
      if(networkFailure) return route.abort()
      if(body.order_number==='FN-999') return route.fulfill({status:404,json:{detail:'Internal SQL fixture error must never be displayed'}})
      return route.fulfill({json:{order_number:'FN-001',status:'preparing',status_label:'Preparing your order',delivery_stage:'Preparing your order',timeline:[
        {step:'order_placed',label:'Order received',state:'completed'},
        {step:'preparing',label:'Preparing your order',state:'current'},
        {step:'delivered',label:'Delivered',state:'pending'},
      ]}})
    })
    await page.goto('/track-order')
    await expect(page.getByRole('heading',{name:'Track Your FoodNova Order',exact:true})).toBeVisible()
    const form=page.locator('.tracking-full-entry form')
    await expect(form.locator('input')).toHaveCount(1)
    await expect(form.locator('input[type=email]')).toHaveCount(0)
    await page.getByLabel('Order Number',{exact:true}).fill('FN-001')
    await page.getByRole('button',{name:'Track Order',exact:true}).click()
    await expect(page.locator('.public-tracking-badge')).toHaveText('Preparing your order')
    await expect(page.locator('.tracking-progress [aria-current=step]')).toContainText('Preparing your order')
    await page.getByRole('button',{name:'Refresh status',exact:true}).click()
    await expect.poll(()=>calls).toBe(2)
    expect(await page.evaluate(()=>Object.values(localStorage).some((value)=>value.includes('FN-001')))).toBe(false)
    await expect(page.locator('head meta[name=robots]')).toHaveAttribute('content',/noindex/)
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true)
    await page.screenshot({path:path.join(captures,`public-tracking-${width}.png`)})
    await page.getByLabel('Order Number',{exact:true}).fill('../orders/1')
    await page.getByRole('button',{name:'Track Order',exact:true}).click()
    expect(calls).toBe(2)
    await page.getByLabel('Order Number',{exact:true}).fill('FN-999')
    await page.getByRole('button',{name:'Track Order',exact:true}).click()
    await expect(page.locator('.tracking-full-entry [role=status]')).toContainText('Order progress is unavailable')
    await expect(page.locator('.tracking-full-entry')).not.toContainText('SQL')
    networkFailure=true
    await page.getByLabel('Order Number',{exact:true}).fill('FN-001')
    await page.getByRole('button',{name:'Track Order',exact:true}).click()
    await expect(page.locator('.tracking-full-entry [role=status]')).toContainText('Order progress is unavailable')
  })
}
